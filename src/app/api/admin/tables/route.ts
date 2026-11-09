// app/api/admin/tables/route.ts — Admin: list all tables with full session info
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { SessionStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const tables = await prisma.labTable.findMany({
      where: { isActive: true },
      include: {
        sessions: {
          where: { status: SessionStatus.ACTIVE },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          take: 1,
        },
        requests: {
          where: { status: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
          include: {
            user: { select: { id: true, name: true, email: true } },
            approval: { select: { expiresAt: true } },
          },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ tables })
  } catch (err) {
    console.warn('[GET /api/admin/tables] Database offline or unmigrated, returning 25 fallback tables:', (err as Error).message)
    const fallbackTables = [
      ...Array.from({ length: 22 }, (_, i) => {
        const num = String(i + 1).padStart(2, '0')
        return {
          id: `fallback-t${num}`,
          tableCode: `T${num}`,
          name: `Table ${num}`,
          tableType: 'REGULAR',
          status: 'AVAILABLE',
          hasEthernet: i < 11,
          sortOrder: i + 1,
          sessions: [],
          requests: [],
        }
      }),
      { id: 'fallback-t23', tableCode: 'T23', name: 'Representative Table A', tableType: 'RESERVED', status: 'RESERVED', hasEthernet: true, sortOrder: 23, sessions: [], requests: [] },
      { id: 'fallback-t24', tableCode: 'T24', name: 'Representative Table B', tableType: 'RESERVED', status: 'RESERVED', hasEthernet: true, sortOrder: 24, sessions: [], requests: [] },
      { id: 'fallback-t25', tableCode: 'T25', name: 'Representative Table C', tableType: 'RESERVED', status: 'RESERVED', hasEthernet: true, sortOrder: 25, sessions: [], requests: [] },
    ]
    return NextResponse.json({ tables: fallbackTables })
  }
}

