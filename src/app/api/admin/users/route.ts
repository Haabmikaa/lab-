// app/api/admin/users/route.ts — Admin: manage user accounts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/db'
import { createUserSchema, paginationSchema } from '@/lib/validations'
import { AccountStatus, Role } from '@prisma/client'
import { auditLog, AuditAction } from '@/lib/audit'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

// GET: list all users
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const parsed = paginationSchema.safeParse({ page: searchParams.get('page'), limit: searchParams.get('limit') })
  const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 20 }

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true, name: true, email: true, role: true, accountStatus: true,
          emailVerifiedAt: true, createdAt: true, updatedAt: true,
          _count: { select: { sessions: true, requests: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count(),
    ])

    return NextResponse.json({ users, total, page, limit })
  } catch (err) {
    console.warn('[GET /api/admin/users] Database query error:', (err as Error).message)
    return NextResponse.json({ users: [], total: 0, page: 1, limit: 20 })
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
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

    const passwordHash = parsed.data.password
      ? await bcrypt.hash(parsed.data.password, 12)
      : null

    // If password provided, mark as verified immediately; otherwise send verification email
    const emailVerifiedAt = parsed.data.password ? new Date() : null
    const accountStatus = parsed.data.password ? AccountStatus.ACTIVE : AccountStatus.PENDING_VERIFICATION

    const user = await prisma.user.create({
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
    const msg = (err as Error).message || ''
    if (msg.includes('Authentication failed') || msg.includes('connect') || msg.includes('Can\'t reach database server')) {
      return NextResponse.json({
        error: 'Database connection failed. Please check your DATABASE_URL in .env.local and run `npm run db:push`.'
      }, { status: 503 })
    }
    return NextResponse.json({ error: 'Failed to create user. Ensure database is connected and migrated.' }, { status: 500 })
  }
}

