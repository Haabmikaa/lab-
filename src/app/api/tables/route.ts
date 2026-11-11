// app/api/tables/route.ts — Public table listing (no auth required, no PII)
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { PublicTable } from '@/types'

export const dynamic = 'force-dynamic'

// Last known good real tables from the database — never hardcode fake reserved tables!
let lastKnownGoodTables: PublicTable[] | null = null
let lastKnownGoodStats: Record<string, number> | null = null

export function invalidateTablesCache() {
  lastKnownGoodTables = null
  lastKnownGoodStats = null
}

function calculateStats(tables: PublicTable[]) {
  return {
    total: tables.length,
    regular: tables.filter((t) => t.tableType === 'REGULAR').length,
    reserved: tables.filter((t) => t.tableType === 'RESERVED').length,
    available: tables.filter((t) => t.status === 'AVAILABLE').length,
    occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
    pendingApproval: tables.filter((t) => t.status === 'PENDING_APPROVAL').length,
    maintenance: tables.filter((t) => t.status === 'MAINTENANCE').length,
  }
}

export async function GET() {
  try {
    let tables: PublicTable[] = []
    
    // Attempt 1: Fetch from live database
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
    } catch {
      // Small pause and retry on cold serverless connection
      await new Promise((r) => setTimeout(r, 150))
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
    }

    if (tables && tables.length > 0) {
      const stats = calculateStats(tables)
      lastKnownGoodTables = tables
      lastKnownGoodStats = stats

      return NextResponse.json(
        { tables, stats, lastUpdated: new Date().toISOString() },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'X-Cache': 'LIVE',
          },
        }
      )
    }

    // If DB returned 0 tables but we had previous good data, use it
    if (lastKnownGoodTables && lastKnownGoodTables.length > 0) {
      return NextResponse.json(
        { tables: lastKnownGoodTables, stats: lastKnownGoodStats!, lastUpdated: new Date().toISOString() },
        { headers: { 'Cache-Control': 'no-store', 'X-Cache': 'CACHED_REAL' } }
      )
    }

    return NextResponse.json(
      { error: 'No tables found', tables: [], stats: calculateStats([]) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[GET /api/tables] Query error:', (err as Error).message)
    if (lastKnownGoodTables && lastKnownGoodTables.length > 0) {
      return NextResponse.json(
        { tables: lastKnownGoodTables, stats: lastKnownGoodStats!, lastUpdated: new Date().toISOString() },
        { headers: { 'Cache-Control': 'no-store', 'X-Cache': 'FALLBACK_REAL' } }
      )
    }

    return NextResponse.json(
      { error: 'Database connecting...', tables: [], stats: calculateStats([]) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
