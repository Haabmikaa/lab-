'use client'
// components/shared/Navbar.tsx — Top navigation bar with Onyx, Electric Indigo & Tropical Mint theme

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useState } from 'react'
import {
  LayoutGrid, LogOut, Shield, Menu, X
} from 'lucide-react'
import { getInitials } from '@/lib/utils'

export function Navbar() {
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)

  const isAdmin = session?.user?.role === 'ADMIN'
  const isStudent = session?.user?.role === 'STUDENT' || session?.user?.role === 'REPRESENTATIVE'

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#101010]/90 backdrop-blur-md">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 font-bold tracking-tight text-white hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#6321FB] to-[#450ec2] shadow-md shadow-[#6321FB]/30">
              <LayoutGrid className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-white leading-tight">Lab Occupancy</span>
              <span className="text-[10px] text-[#6BFFC5] font-mono tracking-wider uppercase">Live Lab System</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-5">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
            >
              Dashboard
            </Link>

            {isStudent && (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                My Session
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#c4b5fd] hover:text-white transition-colors px-2.5 py-1 rounded-lg bg-[#6321FB]/20 border border-[#6321FB]/40"
              >
                <Shield className="w-3.5 h-3.5 text-[#6BFFC5]" aria-hidden="true" />
                Admin Panel
              </Link>
            )}

            {session?.user ? (
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 bg-[#18181b]">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#6321FB] text-white text-xs font-bold">
                    {getInitials(session.user.name ?? session.user.email)}
                  </div>
                  <span className="text-xs font-medium text-white max-w-[140px] truncate">
                    {session.user.name ?? session.user.email}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono uppercase font-semibold ${
                    isAdmin ? 'bg-[#6321FB] text-white' : 'bg-[#6BFFC5]/20 text-[#6BFFC5]'
                  }`}>
                    {session.user.role}
                  </span>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="flex items-center justify-center w-8 h-8 rounded-xl border border-white/10 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-xl bg-[#6BFFC5] px-4 py-2 text-xs font-bold text-[#101010] hover:bg-[#5ae6af] shadow-md shadow-[#6BFFC5]/20 hover:scale-[1.02] active:scale-100 transition-all uppercase tracking-wider"
              >
                Sign in
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="sm:hidden p-2 rounded-xl text-zinc-300 hover:bg-white/5"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="sm:hidden border-t border-white/10 py-3 space-y-2">
            <Link href="/" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 rounded-xl">
              Dashboard
            </Link>
            {isStudent && (
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 rounded-xl">
                My Session
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm text-[#6BFFC5] hover:bg-white/5 rounded-xl font-medium">
                Admin Panel
              </Link>
            )}
            {session?.user ? (
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="block w-full text-left px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 rounded-xl"
              >
                Sign out
              </button>
            ) : (
              <Link href="/login" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm font-bold text-[#6BFFC5]">
                Sign in
              </Link>
            )}
          </div>
        )}
      </nav>
    </header>
  )
}
