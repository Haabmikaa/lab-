// lib/rbac.ts — Server-side Role-Based Access Control
// NEVER import this in client components. Server-only.
import { auth } from '@/lib/auth'
import { Role, AccountStatus } from '@prisma/client'
import { NextResponse } from 'next/server'

export type AuthenticatedUser = {
  id: string
  email: string
  name: string
  role: Role
  accountStatus: AccountStatus
}

type SessionWithUser = {
  user: AuthenticatedUser
  error?: string
}

/**
 * Get the current authenticated session and validate it.
 * Returns null if not authenticated or account is disabled.
 */
export async function getSession(): Promise<SessionWithUser | null> {
  const session = await auth()
  if (!session || !session.user || session.error === 'AccountDisabled') {
    return null
  }
  if (session.user.accountStatus === AccountStatus.DISABLED) {
    return null
  }
  return session as unknown as SessionWithUser
}

/**
 * Require authentication. Returns 401 response if not authenticated.
 */
export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }
  }
  return { error: null, session }
}

/**
 * Require ADMIN role. Returns 401/403 response if not authorized.
 */
export async function requireAdmin() {
  const { error, session } = await requireAuth()
  if (error || !session) return { error: error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }

  if (session.user.role !== Role.ADMIN) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null }
  }
  return { error: null, session }
}

/**
 * Require STUDENT or ADMIN role.
 */
export async function requireStudent() {
  const { error, session } = await requireAuth()
  if (error || !session) return { error: error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }

  if (session.user.role !== Role.STUDENT && session.user.role !== Role.ADMIN) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null }
  }
  return { error: null, session }
}

/**
 * Check if a user is an admin (use in server components/actions).
 */
export function isAdmin(role: Role): boolean {
  return role === Role.ADMIN
}

/**
 * Check if a user can manage a specific resource they own.
 * Admins can manage any resource.
 */
export function canManageResource(actorId: string, actorRole: Role, ownerId: string): boolean {
  if (actorRole === Role.ADMIN) return true
  return actorId === ownerId
}

