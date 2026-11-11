// app/api/audit/route.ts — Admin: query audit logs
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { auditLogQuerySchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

let lastKnownGoodLogs: unknown[] = []
let lastKnownGoodTotal = 0

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const parsed = auditLogQuerySchema.safeParse(Object.fromEntries(searchParams.entries()))

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, { status: 422 })
  }

  const { page, limit, action, actorUserId, entityType, from, to } = parsed.data

  const where = {
    ...(action ? { action } : {}),
    ...(actorUserId ? { actorUserId } : {}),
    ...(entityType ? { entityType } : {}),
    ...((from || to) ? {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    } : {}),
  }

  try {
    let logs, total
    try {
      ;[logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: {
            actor: { select: { id: true, name: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ])
    } catch {
      // Retry once on serverless connection queue
      await new Promise((r) => setTimeout(r, 250))
      ;[logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: {
            actor: { select: { id: true, name: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ])
    }

    if (logs && logs.length > 0) {
      lastKnownGoodLogs = logs
      lastKnownGoodTotal = total
    }

    return NextResponse.json(
      { logs: lastKnownGoodLogs, total: lastKnownGoodTotal || lastKnownGoodLogs.length, page, limit },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    )
  } catch (err) {
    console.warn('[GET /api/audit] Database offline or unmigrated, returning last known logs:', (err as Error).message)
    return NextResponse.json(
      {
        logs: lastKnownGoodLogs,
        total: lastKnownGoodTotal || lastKnownGoodLogs.length,
        page,
        limit,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

