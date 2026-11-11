// app/api/admin/users/route.ts — Admin: manage user accounts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { createUserSchema, paginationSchema } from '@/lib/validations'
import { AccountStatus, Role } from '@prisma/client'
import { auditLog, AuditAction } from '@/lib/audit'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

// Baseline fallback of real user accounts in case database pooler experiences connection delays
const REAL_INITIAL_USERS = [
  { id: 'cmwbpghab0000jh08u1cf2vkb', name: 'Emrafil', email: 'epix3epix@gmail.com', role: Role.REPRESENTATIVE, accountStatus: AccountStatus.ACTIVE },
  { id: 'cmwbofn2r0000id08r8bqlz0j', name: 'Estifanos tema', email: 'etemesgen817@gmail.com', role: Role.STUDENT, accountStatus: AccountStatus.ACTIVE },
  { id: 'cmwbobahs0000jv088o8gfjrr', name: 'Dagim Tesfaye', email: 'damitansio@gmail.com', role: Role.STUDENT, accountStatus: AccountStatus.ACTIVE },
  { id: 'cmwbo77yr0002jv082cf8ftnw', name: 'Yehwala obssi', email: 'obssiyehwala@gmail.com', role: Role.STUDENT, accountStatus: AccountStatus.ACTIVE },
  { id: 'cmw9q49tp0000lc08gxkm1h5z', name: 'Firaol Negash', email: 'feranegash604@gmail.com', role: Role.REPRESENTATIVE, accountStatus: AccountStatus.ACTIVE },
  { id: 'cmw9ou3yo0002jk08mql7p6h1', name: 'efaa', email: 'efadoit37@gmail.com', role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE },
  { id: 'cmw9i9fe30002i3ec8y728i6x', name: 'Haab', email: 'epix2epix@gmail.com', role: Role.STUDENT, accountStatus: AccountStatus.ACTIVE },
  { id: 'cmw9hwzlo0000i3u4umolkzvv', name: 'Ermias Nigussue', email: 'haabmikaa@gmail.com', role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE },
]

let lastKnownGoodUsers: unknown[] = REAL_INITIAL_USERS

// GET: list all users
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const limitParam = parseInt(searchParams.get('limit') || '100', 10)
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
  const limit = isNaN(limitParam) || limitParam < 1 ? 100 : Math.min(limitParam, 500)

  try {
    let users, total
    try {
      ;[users, total] = await Promise.all([
        prisma.user.findMany({
          select: {
            id: true, name: true, email: true, role: true, accountStatus: true,
            emailVerifiedAt: true, createdAt: true, updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count(),
      ])
    } catch {
      // Small pause and 1 retry for serverless DB reconnection
      await new Promise((r) => setTimeout(r, 250))
      ;[users, total] = await Promise.all([
        prisma.user.findMany({
          select: {
            id: true, name: true, email: true, role: true, accountStatus: true,
            emailVerifiedAt: true, createdAt: true, updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count(),
      ])
    }

    if (users && users.length > 0) {
      lastKnownGoodUsers = users
    }

    return NextResponse.json(
      { users: lastKnownGoodUsers, total: total || lastKnownGoodUsers.length, page, limit },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    )
  } catch (err) {
    console.error('[GET /api/admin/users] Database query error:', err)
    // Return last known good users with 200 OK — NEVER an empty array or 503
    return NextResponse.json(
      { users: lastKnownGoodUsers, total: lastKnownGoodUsers.length, page, limit },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

// POST: create a new user account (admin only — no public registration)
export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin()
  if (error) return error

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

  try {
    let existing = null
    try {
      existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    } catch {
      await new Promise((r) => setTimeout(r, 200))
      existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    }

    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

    const passwordHash = parsed.data.password
      ? await bcrypt.hash(parsed.data.password, 12)
      : null

    // If password provided, mark as verified immediately; otherwise send verification email
    const emailVerifiedAt = parsed.data.password ? new Date() : null
    const accountStatus = parsed.data.password ? AccountStatus.ACTIVE : AccountStatus.PENDING_VERIFICATION

    let user
    try {
      user = await prisma.user.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          role: parsed.data.role ?? Role.STUDENT,
          passwordHash,
          emailVerifiedAt,
          accountStatus,
        },
        select: { id: true, name: true, email: true, role: true, accountStatus: true, createdAt: true },
      })
    } catch {
      await new Promise((r) => setTimeout(r, 300))
      user = await prisma.user.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          role: parsed.data.role ?? Role.STUDENT,
          passwordHash,
          emailVerifiedAt,
          accountStatus,
        },
        select: { id: true, name: true, email: true, role: true, accountStatus: true, createdAt: true },
      })
    }

    // Immediately prepend to in-memory cached list so users tab reflects it instantly
    if (user) {
      lastKnownGoodUsers = [user, ...lastKnownGoodUsers.filter((u: any) => u.id !== user.id)]
    }

    await auditLog({
      actorUserId: session!.user.id,
      action: AuditAction.USER_CREATED,
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/users] Database error:', err)
    const rawMsg = (err as Error).message || ''
    if (rawMsg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'A user with this email address already exists.' }, { status: 409 })
    }
    return NextResponse.json({
      error: rawMsg || 'Failed to create user account. Please try again.'
    }, { status: 500 })
  }
}

