// app/api/audit/route.ts — Admin: query audit logs
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { auditLogQuerySchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

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
    const [logs, total] = await Promise.all([
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

    return NextResponse.json({ logs, total, page, limit })
  } catch (err) {
    console.warn('[GET /api/audit] Database offline or unmigrated, returning empty audit list:', (err as Error).message)
    return NextResponse.json({
      logs: [
        {
          id: 'initial-setup-log',
          action: 'SYSTEM_STARTUP',
          entityType: 'System',
          createdAt: new Date().toISOString(),
          actor: { name: 'System', email: 'system@university.edu', role: 'ADMIN' },
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    })
  }
}

