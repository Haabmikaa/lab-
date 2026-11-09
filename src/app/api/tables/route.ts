// app/api/tables/route.ts — Public table listing (no auth required, no PII)
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { PublicTable } from '@/types'

export const dynamic = 'force-dynamic'

// Default 25 tables fallback in case database is initializing
const FALLBACK_TABLES: PublicTable[] = [
  ...Array.from({ length: 22 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0')
    return {
      id: `fallback-t${num}`,
      tableCode: `T${num}`,
      name: `Table ${num}`,
      tableType: 'REGULAR' as const,
      status: 'AVAILABLE',
      hasEthernet: i < 11,
      sortOrder: i + 1,
    }
  }),
  {
    id: 'fallback-t23',
    tableCode: 'T23',
    name: 'Representative Table A',
    tableType: 'RESERVED' as const,
    status: 'RESERVED',
    hasEthernet: true,
    sortOrder: 23,
  },
  {
    id: 'fallback-t24',
    tableCode: 'T24',
    name: 'Representative Table B',
    tableType: 'RESERVED' as const,
    status: 'RESERVED',
    hasEthernet: true,
    sortOrder: 24,
  },
  {
    id: 'fallback-t25',
    tableCode: 'T25',
    name: 'Representative Table C',
    tableType: 'RESERVED' as const,
    status: 'RESERVED',
    hasEthernet: true,
    sortOrder: 25,
  },
]

export async function GET() {
  try {
    let tables: PublicTable[] = []
    try {
      tables = await prisma.labTable.findMany({
        where: { isActive: true },
        select: {
          id: true,
          tableCode: true,
          name: true,
          tableType: true,
          status: true,
          hasEthernet: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' },
      })
    } catch (dbErr) {
      console.warn('[GET /api/tables] Database offline or unseeded, using laboratory fallback:', (dbErr as Error).message)
      tables = FALLBACK_TABLES
    }

    if (!tables || tables.length === 0) {
      tables = FALLBACK_TABLES
    }

    const stats = {
      total: tables.length,
      regular: tables.filter((t) => t.tableType === 'REGULAR').length,
      reserved: tables.filter((t) => t.tableType === 'RESERVED').length,
      available: tables.filter((t) => t.status === 'AVAILABLE').length,
      occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
      pendingApproval: tables.filter((t) => t.status === 'PENDING_APPROVAL').length,
      maintenance: tables.filter((t) => t.status === 'MAINTENANCE').length,
    }

    return NextResponse.json({
      tables,
      stats,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/tables] Fatal error:', err)
    return NextResponse.json({
      tables: FALLBACK_TABLES,
      stats: {
        total: 25,
        regular: 22,
        reserved: 3,
        available: 22,
        occupied: 0,
        pendingApproval: 0,
        maintenance: 0,
      },
      lastUpdated: new Date().toISOString(),
    })
  }
}
