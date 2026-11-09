// app/api/admin/requests/[id]/route.ts — Admin: approve or reject a specific request
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { approveRequest, rejectRequest, cancelRequest, OccupancyError } from '@/lib/occupancy'
import { approveRequestSchema, rejectRequestSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// PATCH: approve or reject
export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = (body as { action?: string }).action

  try {
    if (action === 'approve') {
      const parsed = approveRequestSchema.safeParse(body)
      if (!parsed.success)
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

      const result = await approveRequest({
        requestId: id,
        adminId: session!.user.id,
        reason: parsed.data.reason,
      })
      return NextResponse.json({ result })
    }

    if (action === 'reject') {
      const parsed = rejectRequestSchema.safeParse(body)
      if (!parsed.success)
        return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

      const result = await rejectRequest({
        requestId: id,
        adminId: session!.user.id,
        reason: parsed.data.reason,
      })
      return NextResponse.json({ result })
    }

    if (action === 'cancel') {
      const result = await cancelRequest({
        requestId: id,
        actorId: session!.user.id,
        actorRole: session!.user.role,
      })
      return NextResponse.json({ result })
    }

    return NextResponse.json({ error: 'Invalid action. Use approve, reject, or cancel.' }, { status: 400 })
  } catch (err) {
    if (err instanceof OccupancyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
    }
    console.error('[PATCH /api/admin/requests/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

