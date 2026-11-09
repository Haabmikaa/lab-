// src/app/api/cron/cleanup/route.ts — Background task to expire stale requests and sessions
// Can be triggered by external cron or internal intervals

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { RequestStatus, TableStatus, SessionStatus } from '@prisma/client'
import { auditLog, AuditAction } from '@/lib/audit'
import { sseEmit } from '@/lib/sse'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Optional bearer secret check for cron jobs
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const results = {
    expiredPendingRequests: 0,
    expiredApprovedRequests: 0,
    expiredSessions: 0,
  }

  try {
    // 1. Expire stale PENDING_APPROVAL requests
    const stalePending = await prisma.occupancyRequest.findMany({
      where: {
        status: RequestStatus.PENDING_APPROVAL,
        expiresAt: { lte: now },
      },
      include: { table: true },
    })

    for (const reqItem of stalePending) {
      await prisma.$transaction(async (tx) => {
        await tx.occupancyRequest.update({
          where: { id: reqItem.id },
          data: { status: RequestStatus.EXPIRED },
        })
        if (reqItem.table.status === TableStatus.PENDING_APPROVAL) {
          await tx.labTable.update({
            where: { id: reqItem.tableId },
            data: { status: TableStatus.AVAILABLE },
          })
        }
      })

      await auditLog({
        actorUserId: null,
        action: AuditAction.REQUEST_EXPIRED,
        entityType: 'OccupancyRequest',
        entityId: reqItem.id,
        metadata: { reason: 'auto_expired_pending', tableCode: reqItem.table.tableCode },
      })

      sseEmit('table:available', { tableId: reqItem.tableId, tableCode: reqItem.table.tableCode })
      results.expiredPendingRequests++
    }

    // 2. Expire APPROVED requests that were never activated within the approval window
    const staleApproved = await prisma.occupancyRequest.findMany({
      where: {
        status: RequestStatus.APPROVED,
        approval: {
          expiresAt: { lte: now },
          usedAt: null,
        },
      },
      include: { table: true, approval: true },
    })

    for (const reqItem of staleApproved) {
      await prisma.$transaction(async (tx) => {
        await tx.occupancyRequest.update({
          where: { id: reqItem.id },
          data: { status: RequestStatus.EXPIRED },
        })
        if (reqItem.table.status === TableStatus.APPROVED) {
          await tx.labTable.update({
            where: { id: reqItem.tableId },
            data: { status: TableStatus.AVAILABLE },
          })
        }
      })

      await auditLog({
        actorUserId: null,
        action: AuditAction.REQUEST_EXPIRED,
        entityType: 'OccupancyRequest',
        entityId: reqItem.id,
        metadata: { reason: 'auto_expired_approval_window', tableCode: reqItem.table.tableCode },
      })

      sseEmit('table:available', { tableId: reqItem.tableId, tableCode: reqItem.table.tableCode })
      results.expiredApprovedRequests++
    }

    // 3. Expire timed-out sessions (based on session_max_duration_hours setting)
    const maxDurationSetting = await prisma.systemSetting.findUnique({
      where: { key: 'session_max_duration_hours' },
    })
    const maxHours = parseInt(maxDurationSetting?.value ?? '8', 10)
    const sessionCutoff = new Date(now.getTime() - maxHours * 60 * 60 * 1000)

    const timedOutSessions = await prisma.occupancySession.findMany({
      where: {
        status: SessionStatus.ACTIVE,
        startedAt: { lte: sessionCutoff },
      },
      include: { table: true },
    })

    for (const sess of timedOutSessions) {
      await prisma.$transaction(async (tx) => {
        await tx.occupancySession.update({
          where: { id: sess.id },
          data: {
            status: SessionStatus.EXPIRED,
            endedAt: now,
          },
        })
        await tx.labTable.update({
          where: { id: sess.tableId },
          data: { status: TableStatus.AVAILABLE },
        })
      })

      await auditLog({
        actorUserId: null,
        action: AuditAction.SESSION_EXPIRED,
        entityType: 'OccupancySession',
        entityId: sess.id,
        metadata: { reason: 'max_duration_exceeded', tableCode: sess.table.tableCode, maxHours },
      })

      sseEmit('table:available', { tableId: sess.tableId, tableCode: sess.table.tableCode })
      results.expiredSessions++
    }

    return NextResponse.json({ success: true, timestamp: now.toISOString(), results })
  } catch (err) {
    console.error('[POST /api/cron/cleanup]', err)
    return NextResponse.json({ error: 'Cleanup error', details: (err as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}


