// src/app/api/admin/settings/route.ts — Admin: list and update system settings
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { updateSettingSchema } from '@/lib/validations'
import { auditLog, AuditAction } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const settings = await prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
      include: {
        updatedByUser: { select: { id: true, name: true, email: true } },
      },
    })
    return NextResponse.json({ settings })
  } catch (err) {
    console.warn('[GET /api/admin/settings] Database offline or unmigrated, returning default settings:', (err as Error).message)
    const defaultSettings = [
      { id: 's1', key: 'session_max_duration_hours', value: '8', description: 'Maximum occupancy session duration in hours', updatedAt: new Date().toISOString() },
      { id: 's2', key: 'session_inactivity_timeout_minutes', value: '120', description: 'Auto-release table after inactivity', updatedAt: new Date().toISOString() },
      { id: 's3', key: 'approval_expiry_minutes', value: '30', description: 'Minutes before approval expires', updatedAt: new Date().toISOString() },
      { id: 's4', key: 'lab_name', value: 'University Computer Laboratory', description: 'Display name', updatedAt: new Date().toISOString() },
      { id: 's5', key: 'ethernet_verification_enabled', value: 'true', description: 'Enable automatic direct occupancy on verified university Ethernet', updatedAt: new Date().toISOString() },
      { id: 's6', key: 'trusted_ethernet_ips', value: '102.213.68.*, 10.240.72.1-10.240.72.225, 10.10.*, 172.24.*, 127.0.0.1, ::1, localhost', description: 'Lab Ethernet verified IP range (10.240.72.1 to 10.240.72.225)', updatedAt: new Date().toISOString() },
    ]
    return NextResponse.json({ settings: defaultSettings })
  }
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAdmin()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { key, value } = body as { key?: string; value?: string }
  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'Missing key or value' }, { status: 400 })
  }

  const parsed = updateSettingSchema.safeParse({ value })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const previous = await prisma.systemSetting.findUnique({ where: { key } })
    if (!previous) {
      return NextResponse.json({ error: 'Setting key not found' }, { status: 404 })
    }

    const updated = await prisma.systemSetting.update({
      where: { key },
      data: {
        value: parsed.data.value,
        updatedBy: session!.user.id,
      },
    })

    await auditLog({
      actorUserId: session!.user.id,
      action: AuditAction.SETTING_UPDATED,
      entityType: 'SystemSetting',
      entityId: key,
      metadata: { key, oldValue: previous.value, newValue: parsed.data.value },
    })

    return NextResponse.json({ setting: updated })
  } catch (err) {
    console.error('[PATCH /api/admin/settings]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

