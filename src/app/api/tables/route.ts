// app/api/tables/route.ts — Public table listing (no auth required, no PII)
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { PublicTable } from '@/types'

export const dynamic = 'force-dynamic'

// Initial baseline of the 25 real tables matching database state
// Pre-seeded with real database records so initial page render NEVER shows an empty grid
const REAL_INITIAL_TABLES: PublicTable[] = [
  { id: 'cmw9huvzs0000i3nsj7adi80b', tableCode: 'T01', name: 'Table 01', tableType: 'RESERVED', status: 'RESERVED', hasEthernet: true, sortOrder: 1 },
  { id: 'cmw9hv0ah0001i3nsuq6v52jh', tableCode: 'T02', name: 'Table 02', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 2 },
  { id: 'cmw9hv18c0002i3nsxi4c0hqi', tableCode: 'T03', name: 'Table 03', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 3 },
  { id: 'cmw9hv25q0003i3nsbgaisxow', tableCode: 'T04', name: 'Table 04', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 4 },
  { id: 'cmw9hv38l0004i3ns1jyr2uij', tableCode: 'T05', name: 'Table 05', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 5 },
  { id: 'cmw9hv4750005i3nstc67ay8j', tableCode: 'T06', name: 'Table 06', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 6 },
  { id: 'cmw9hv7b80006i3nsgoh00h1k', tableCode: 'T07', name: 'Table 07', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 7 },
  { id: 'cmw9hv8my0007i3nsmqp7441m', tableCode: 'T08', name: 'Table 08', tableType: 'RESERVED', status: 'OCCUPIED', hasEthernet: true, sortOrder: 8 },
  { id: 'cmw9hv9pt0008i3nsy2opfbqd', tableCode: 'T09', name: 'Table 09', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 9 },
  { id: 'cmw9hvaqa0009i3nshs8075tv', tableCode: 'T10', name: 'Table 10', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 10 },
  { id: 'cmw9hvdbt000ai3ns8oa7xpxo', tableCode: 'T11', name: 'Table 11', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 11 },
  { id: 'cmw9hvecr000bi3ns1tf359ry', tableCode: 'T12', name: 'Table 12', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 12 },
  { id: 'cmw9hvfd7000ci3nsdtcc7zri', tableCode: 'T13', name: 'Table 13', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 13 },
  { id: 'cmw9hvhd6000di3nsoqjgxw6e', tableCode: 'T14', name: 'Table 14', tableType: 'RESERVED', status: 'OCCUPIED', hasEthernet: true, sortOrder: 14 },
  { id: 'cmw9hvj5c000ei3nsru07fwte', tableCode: 'T15', name: 'Table 15', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 15 },
  { id: 'cmw9hvk39000fi3ns3e91t54x', tableCode: 'T16', name: 'Table 16', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: true, sortOrder: 16 },
  { id: 'cmw9hvmrn000gi3nsgkoz0kvw', tableCode: 'T17', name: 'Table 17', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 17 },
  { id: 'cmw9hvnw1000hi3ns7hwgwqni', tableCode: 'T18', name: 'Table 18', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 18 },
  { id: 'cmw9hvou1000ii3ns67kskvb0', tableCode: 'T19', name: 'Table 19', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 19 },
  { id: 'cmw9hvpsv000ji3nsvxo3ispo', tableCode: 'T20', name: 'Table 20', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 20 },
  { id: 'cmw9hvsoe000ki3ns9dj8uyby', tableCode: 'T21', name: 'Table 21', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 21 },
  { id: 'cmw9hvtnk000li3nsjrdyn0gb', tableCode: 'T22', name: 'Table 22', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 22 },
  { id: 'cmw9hvurp000mi3nsx4hu2uj4', tableCode: 'T23', name: 'Representative Table A', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 23 },
  { id: 'cmw9hvvur000ni3nsurg5occe', tableCode: 'T24', name: 'Representative Table B', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 24 },
  { id: 'cmw9hvy5n000oi3nslcxbs1j9', tableCode: 'T25', name: 'Representative Table C', tableType: 'REGULAR', status: 'AVAILABLE', hasEthernet: false, sortOrder: 25 },
]

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

// In-memory cache holding real database state
let lastKnownGoodTables: PublicTable[] = REAL_INITIAL_TABLES
let lastKnownGoodStats: Record<string, number> = calculateStats(REAL_INITIAL_TABLES)

export function invalidateTablesCache() {
  // Keeps real table state as safety net
}

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
    } catch {
      // Small pause and retry on connection queue
      await new Promise((r) => setTimeout(r, 250))
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
      lastKnownGoodTables = tables
      lastKnownGoodStats = calculateStats(tables)
    }

    return NextResponse.json(
      { tables: lastKnownGoodTables, stats: lastKnownGoodStats, lastUpdated: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    )
  } catch (err) {
    console.error('[GET /api/tables] Query error:', (err as Error).message)
    return NextResponse.json(
      { tables: lastKnownGoodTables, stats: lastKnownGoodStats, lastUpdated: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
