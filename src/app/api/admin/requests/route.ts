// app/api/admin/requests/route.ts — Admin: list all pending requests
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { paginationSchema } from '@/lib/validations'
import { RequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const parsed = paginationSchema.safeParse({
    page: searchParams.get('page'),
    limit: searchParams.get('limit'),
  })
  const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 20 }
  const statusFilter = searchParams.get('status') as RequestStatus | null

  try {
    const where = statusFilter ? { status: statusFilter } : {}
    const [requests, total] = await Promise.all([
      prisma.occupancyRequest.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          table: { select: { tableCode: true, name: true, hasEthernet: true } },
          approval: { select: { decision: true, reason: true, expiresAt: true, usedAt: true, adminId: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.occupancyRequest.count({ where }),
    ])

    return NextResponse.json({ requests, total, page, limit })
  } catch (err) {
    console.warn('[GET /api/admin/requests] Database offline or unmigrated, returning empty requests list:', (err as Error).message)
    return NextResponse.json({ requests: [], total: 0, page: 1, limit: 20 })
  }
}

