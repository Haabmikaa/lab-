// app/api/admin/tables/[id]/route.ts — Admin: update table config, maintenance, release session
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { updateTableSchema, tableMaintenanceSchema } from '@/lib/validations'
import { TableStatus, SessionStatus } from '@prisma/client'
import { auditLog, AuditAction } from '@/lib/audit'
import { releaseTable, OccupancyError } from '@/lib/occupancy'
import { sseEmit } from '@/lib/sse'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// PATCH: update table name/description or set maintenance mode
export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = (body as { action?: string }).action

  try {
    // Update table metadata
    if (!action || action === 'update') {
      const parsed = updateTableSchema.safeParse(body)
      if (!parsed.success)
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

      const table = await prisma.labTable.update({
        where: { id },
        data: parsed.data,
      })

      await auditLog({
        actorUserId: session!.user.id,
        action: AuditAction.TABLE_UPDATED,
        entityType: 'LabTable',
        entityId: id,
        metadata: parsed.data,
      })

      return NextResponse.json({ table })
    }

    // Set/unset maintenance mode
    if (action === 'maintenance') {
      const parsed = tableMaintenanceSchema.safeParse(body)
      if (!parsed.success)
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

      const currentTable = await prisma.labTable.findUnique({ where: { id } })
      if (!currentTable) return NextResponse.json({ error: 'Table not found' }, { status: 404 })

      // Can't set maintenance if occupied — must release first
      if (parsed.data.enable && currentTable.status === TableStatus.OCCUPIED) {
        return NextResponse.json({ error: 'Release the active session before setting maintenance' }, { status: 409 })
      }

      const newStatus = parsed.data.enable ? TableStatus.MAINTENANCE : TableStatus.AVAILABLE
      const table = await prisma.labTable.update({
        where: { id },
        data: { status: newStatus },
      })

      await auditLog({
        actorUserId: session!.user.id,
        action: parsed.data.enable ? AuditAction.TABLE_MAINTENANCE_ON : AuditAction.TABLE_MAINTENANCE_OFF,
        entityType: 'LabTable',
        entityId: id,
        metadata: { reason: parsed.data.reason },
      })

      sseEmit(parsed.data.enable ? 'table:maintenance' : 'table:available', {
        tableId: id,
        tableCode: table.tableCode,
      })

      return NextResponse.json({ table })
    }

    // Admin release active session
    if (action === 'release') {
      const activeSession = await prisma.occupancySession.findFirst({
        where: { tableId: id, status: SessionStatus.ACTIVE },
      })
      if (!activeSession) return NextResponse.json({ error: 'No active session on this table' }, { status: 404 })

      await releaseTable({
        sessionId: activeSession.id,
        actorId: session!.user.id,
        actorRole: session!.user.role,
        isAdminOverride: true,
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    if (err instanceof OccupancyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
    }
    console.error('[PATCH /api/admin/tables/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

