// app/api/admin/users/[id]/route.ts — Admin: update/disable/enable/delete user & change password
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { updateUserSchema } from '@/lib/validations'
import { AccountStatus, Role, TableStatus, SessionStatus } from '@prisma/client'
import { auditLog, AuditAction } from '@/lib/audit'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, accountStatus: true,
      emailVerifiedAt: true, createdAt: true, updatedAt: true,
      sessions: {
        select: { id: true, status: true, startedAt: true, endedAt: true, connectionType: true,
          table: { select: { tableCode: true, name: true } } },
        orderBy: { startedAt: 'desc' }, take: 10,
      },
      requests: {
        select: { id: true, status: true, submittedAt: true, connectionType: true,
          table: { select: { tableCode: true, name: true } } },
        orderBy: { submittedAt: 'desc' }, take: 10,
      },
    },
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json({ user })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const { id } = await params

  // Prevent admin from modifying their own account status via this endpoint
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = (body as { action?: string }).action

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (action === 'change_password') {
    const newPassword = (body as { password?: string }).password
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 422 })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    })

    await auditLog({
      actorUserId: session!.user.id,
      action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
      entityType: 'User',
      entityId: id,
      metadata: { targetEmail: user.email, resetByAdmin: true },
    })

    return NextResponse.json({ success: true, message: `Password for ${user.email} updated successfully` })
  }

  if (action === 'disable') {
    if (id === session!.user.id) {
      return NextResponse.json({ error: 'Cannot disable your own account' }, { status: 403 })
    }
    if (user.role === Role.ADMIN)
      return NextResponse.json({ error: 'Cannot disable an admin account this way' }, { status: 403 })

    await prisma.user.update({ where: { id }, data: { accountStatus: AccountStatus.DISABLED } })
    await auditLog({
      actorUserId: session!.user.id,
      action: AuditAction.USER_DISABLED,
      entityType: 'User', entityId: id,
    })
    return NextResponse.json({ success: true })
  }

  if (action === 'enable') {
    await prisma.user.update({ where: { id }, data: { accountStatus: AccountStatus.ACTIVE } })
    await auditLog({
      actorUserId: session!.user.id,
      action: AuditAction.USER_ENABLED,
      entityType: 'User', entityId: id,
    })
    return NextResponse.json({ success: true })
  }

  if (action === 'change_role') {
    if (id === session!.user.id) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 403 })
    }
    const newRole = (body as { role?: Role }).role
    if (!newRole || !Object.values(Role).includes(newRole))
      return NextResponse.json({ error: 'Invalid role' }, { status: 422 })

    const previousRole = user.role
    await prisma.user.update({ where: { id }, data: { role: newRole } })
    await auditLog({
      actorUserId: session!.user.id,
      action: AuditAction.USER_ROLE_CHANGED,
      entityType: 'User', entityId: id,
      metadata: { previousRole, newRole },
    })
    return NextResponse.json({ success: true })
  }

  // General update (name, etc.)
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

  const updated = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, accountStatus: true },
  })
  await auditLog({
    actorUserId: session!.user.id,
    action: AuditAction.USER_UPDATED,
    entityType: 'User', entityId: id,
    metadata: parsed.data,
  })
  return NextResponse.json({ user: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const { id } = await params

  // Prevent admin from deleting their own account
  if (id === session!.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Release active sessions
      const activeSessions = await tx.occupancySession.findMany({
        where: { userId: id, status: SessionStatus.ACTIVE },
      })
      for (const s of activeSessions) {
        await tx.labTable.update({
          where: { id: s.tableId },
          data: { status: TableStatus.AVAILABLE },
        })
      }

      // 2. Unlink audit logs (preserving immutable audit history)
      await tx.auditLog.updateMany({
        where: { actorUserId: id },
        data: { actorUserId: null },
      })

      // 3. Unlink settings updated
      await tx.systemSetting.updateMany({
        where: { updatedBy: id },
        data: { updatedBy: null },
      })

      // 4. Delete notifications & auth sessions
      await tx.notification.deleteMany({ where: { userId: id } })
      await tx.authSession.deleteMany({ where: { userId: id } })

      // 5. Delete approvals for this user's requests & approvals performed by this user
      const userRequests = await tx.occupancyRequest.findMany({
        where: { userId: id },
        select: { id: true },
      })
      const userRequestIds = userRequests.map((r) => r.id)
      if (userRequestIds.length > 0) {
        await tx.approvalRecord.deleteMany({
          where: { requestId: { in: userRequestIds } },
        })
      }
      await tx.approvalRecord.deleteMany({
        where: { adminId: id },
      })

      // 6. Delete occupancy sessions & requests
      await tx.occupancySession.deleteMany({ where: { userId: id } })
      await tx.occupancyRequest.deleteMany({ where: { userId: id } })

      // 7. Delete the user
      await tx.user.delete({ where: { id } })
    })

    await auditLog({
      actorUserId: session!.user.id,
      action: AuditAction.USER_DELETED,
      entityType: 'User',
      entityId: id,
      metadata: { deletedEmail: user.email, deletedName: user.name, deletedRole: user.role },
    })

    return NextResponse.json({ success: true, message: `User ${user.email} permanently deleted` })
  } catch (err) {
    console.error('[DELETE /api/admin/users/[id]]', err)
    return NextResponse.json({ error: 'Failed to delete user', details: (err as Error).message }, { status: 500 })
  }
}


