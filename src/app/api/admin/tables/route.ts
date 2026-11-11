// app/api/admin/tables/route.ts — Admin: list all tables with full session info
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { SessionStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

let lastKnownGoodAdminTables: unknown[] | null = null

export async function GET(_req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    let tables
    try {
      tables = await prisma.labTable.findMany({
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
    } catch {
      // Retry once on serverless connection delay
      await new Promise((r) => setTimeout(r, 150))
      tables = await prisma.labTable.findMany({
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
    }

    if (tables && tables.length > 0) {
      lastKnownGoodAdminTables = tables
      return NextResponse.json(
        { tables },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      )
    }

    if (lastKnownGoodAdminTables) {
      return NextResponse.json(
        { tables: lastKnownGoodAdminTables },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json({ tables: [] })
  } catch (err) {
    console.error('[GET /api/admin/tables] Query error:', (err as Error).message)
    if (lastKnownGoodAdminTables) {
      return NextResponse.json(
        { tables: lastKnownGoodAdminTables },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
    return NextResponse.json({ error: 'Database unavailable', tables: [] }, { status: 503 })
  }
}

