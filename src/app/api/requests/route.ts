// app/api/requests/route.ts — Student: submit occupancy request
import { NextRequest, NextResponse } from 'next/server'
import { requireStudent } from '@/lib/rbac'
import { submitOccupancyRequest, OccupancyError } from '@/lib/occupancy'
import { submitRequestSchema } from '@/lib/validations'
import { ConnectionType } from '@prisma/client'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Auth check
  const { error, session } = await requireStudent()
  if (error) return error

  // Rate limit: max 5 requests per 5 minutes per user
  const rl = checkRateLimit(`request:${session!.user.id}`, 5, 5 * 60 * 1000, 10 * 60 * 1000)
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

  // IMPORTANT: connectionType is determined server-side only.
  // Client may suggest it, but we always default to UNVERIFIED unless
  // a trusted IT integration provides verified evidence.
  // TODO: When IT provides RADIUS/802.1X/VLAN integration, add verification here.
  const connectionType: ConnectionType = ConnectionType.UNVERIFIED

  try {
    const request = await submitOccupancyRequest({
      userId: session!.user.id,
      tableId,
      connectionType,
      clientIpAddress: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ request }, { status: 201 })
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

