// app/api/admin/users/[id]/route.ts — Admin: update/disable/enable a user
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { updateUserSchema } from '@/lib/validations'
import { AccountStatus, Role } from '@prisma/client'
import { auditLog, AuditAction } from '@/lib/audit'

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

  // Prevent admin from disabling their own account
  if (id === session!.user.id) {
    return NextResponse.json({ error: 'Cannot modify your own account via this endpoint' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = (body as { action?: string }).action

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (action === 'disable') {
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

