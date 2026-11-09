// app/api/requests/route.ts — Student: submit occupancy request or direct occupy on verified network
import { NextRequest, NextResponse } from 'next/server'
import { requireStudent } from '@/lib/rbac'
import { submitOccupancyRequest, directOccupyTable, OccupancyError } from '@/lib/occupancy'
import { submitRequestSchema } from '@/lib/validations'
import { verifyClientNetwork } from '@/lib/network'
import { prisma } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Auth check
  const { error, session } = await requireStudent()
  if (error) return error

  // Rate limit: max 10 requests per 5 minutes per user
  const rl = checkRateLimit(`request:${session!.user.id}`, 10, 5 * 60 * 1000, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)) } },
    )
  }

  // Parse and validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = submitRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const { tableId } = parsed.data

  try {
    // 1. Fetch table details to verify hardware Ethernet capability
    const table = await prisma.labTable.findUnique({
      where: { id: tableId },
    })

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    // 2. Perform server-side IP & Network Verification
    const networkVerification = await verifyClientNetwork(req, table.hasEthernet)

    // 3. CORE LOGIC:
    // If student is physically on the verified university lab Ethernet and table has Ethernet port:
    // -> Instant Direct Access (No admin intervention needed, user can toggle ON/OFF)
    if (networkVerification.isVerifiedEthernet) {
      const activeSession = await directOccupyTable({
        userId: session!.user.id,
        tableId,
        clientIpAddress: networkVerification.clientIp,
        userAgent: req.headers.get('user-agent') ?? undefined,
      })

      return NextResponse.json(
        {
          success: true,
          directOccupancy: true,
          session: activeSession,
          message: 'Connected via Lab Ethernet. Table occupied directly without requiring approval.',
        },
        { status: 201 }
      )
    }

    // Otherwise: Table is Hotspot-only or user is on mobile hotspot/unverified network:
    // -> Strict administrative approval required
    const request = await submitOccupancyRequest({
      userId: session!.user.id,
      tableId,
      connectionType: networkVerification.connectionType,
      clientIpAddress: networkVerification.clientIp,
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json(
      {
        success: true,
        directOccupancy: false,
        request,
        message: 'Connected via Hotspot. Awaiting administrator approval.',
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof OccupancyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
    }
    console.error('[POST /api/requests]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Student: list their own requests
export async function GET(req: NextRequest) {
  const { error, session } = await requireStudent()
  if (error) return error

  const { prisma } = await import('@/lib/db')

  try {
    const requests = await prisma.occupancyRequest.findMany({
      where: { userId: session!.user.id },
      include: {
        table: {
          select: { tableCode: true, name: true },
        },
        approval: {
          select: { decision: true, expiresAt: true, usedAt: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({ requests })
  } catch (err) {
    console.warn('[GET /api/requests] Database offline or unmigrated, returning empty requests list:', (err as Error).message)
    return NextResponse.json({ requests: [] })
  }
}

