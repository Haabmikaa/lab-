// middleware.ts — Route protection (runs at the edge before every request)
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const PUBLIC_ROUTES = ['/', '/login', '/halo', '/api/tables', '/api/sse', '/api/auth', '/api/network-status']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public routes and static assets
  if (
    PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  const session = await auth()

  // No session → return 401 for API, redirect to login for pages
  if (!session || !session.user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Disabled account → return 403 for API, redirect to login for pages
  if (session.error === 'AccountDisabled' || session.user.accountStatus === 'DISABLED') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 })
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('error', 'AccountDisabled')
    return NextResponse.redirect(loginUrl)
  }

  // Admin-only routes
  if (pathname.startsWith('/admin') && session.user.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Admin-only API routes
  if (pathname.startsWith('/api/admin') && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Audit API — admin only
  if (pathname.startsWith('/api/audit') && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

