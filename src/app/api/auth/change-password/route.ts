// app/api/auth/change-password/route.ts — Change own password
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { changePasswordSchema } from '@/lib/validations'
import { auditLog, AuditAction } from '@/lib/audit'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid password format' }, { status: 422 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
  })

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: 'User account not found' }, { status: 404 })
  }

  const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)
  if (!matches) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  })

  await auditLog({
    actorUserId: user.id,
    action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
    entityType: 'User',
    entityId: user.id,
    metadata: { selfChanged: true },
  })

  return NextResponse.json({ success: true, message: 'Password updated successfully' })
}
