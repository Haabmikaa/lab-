// src/app/api/notifications/route.ts — In-app notifications API
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/rbac'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const unreadCount = await prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    })

    return NextResponse.json({ notifications, unreadCount })
  } catch (err) {
    console.error('[GET /api/notifications]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { id } = (body as { id?: string }) || {}

  try {
    if (id) {
      await prisma.notification.updateMany({
        where: { id, userId: session.user.id },
        data: { readAt: new Date() },
      })
    } else {
      // Mark all as read
      await prisma.notification.updateMany({
        where: { userId: session.user.id, readAt: null },
        data: { readAt: new Date() },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/notifications]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

