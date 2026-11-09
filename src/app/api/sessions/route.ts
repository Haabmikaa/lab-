// app/api/sessions/route.ts — Student: activate an approved request → creates occupancy session
import { NextRequest, NextResponse } from 'next/server'
import { requireStudent } from '@/lib/rbac'
import { activateApprovedRequest, releaseTable, OccupancyError } from '@/lib/occupancy'
import { activateRequestSchema, releaseSessionSchema } from '@/lib/validations'
import { prisma } from '@/lib/db'
import { SessionStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// POST: Activate an approved request → start occupancy session
export async function POST(req: NextRequest) {
  const { error, session } = await requireStudent()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = activateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const occupancySession = await activateApprovedRequest({
      requestId: parsed.data.requestId,
      userId: session!.user.id,
    })

    return NextResponse.json({ session: occupancySession }, { status: 201 })
  } catch (err) {
    if (err instanceof OccupancyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
    }
    console.error('[POST /api/sessions]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Student releases their own active session
export async function DELETE(req: NextRequest) {
  const { error, session } = await requireStudent()
  if (error) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = releaseSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    await releaseTable({
      sessionId: parsed.data.sessionId,
      actorId: session!.user.id,
      actorRole: session!.user.role,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof OccupancyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
    }
    console.error('[DELETE /api/sessions]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET: Get current user's active session
export async function GET(_req: NextRequest) {
  const { error, session } = await requireStudent()
  if (error) return error

  try {
    const activeSession = await prisma.occupancySession.findFirst({
      where: { userId: session!.user.id, status: SessionStatus.ACTIVE },
      include: {
        table: { select: { tableCode: true, name: true, hasEthernet: true } },
      },
    })

    return NextResponse.json({ session: activeSession })
  } catch (err) {
    console.warn('[GET /api/sessions] Database offline or unmigrated, returning null session:', (err as Error).message)
    return NextResponse.json({ session: null })
  }
}

