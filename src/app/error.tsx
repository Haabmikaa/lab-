'use client'
// src/app/error.tsx — Application Error Boundary

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Application Error Boundary caught error]:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#101010] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 text-center space-y-4 max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 mb-2">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white">System Encountered an Error</h1>
        <p className="text-xs text-zinc-400">
          An unexpected exception occurred. Your table occupancy and active requests remain secured in the database.
        </p>
        <div className="pt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#6BFFC5] text-[#101010] font-bold px-5 py-2.5 text-xs hover:bg-[#5ae6af] uppercase tracking-wider"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-white/10 px-5 py-2.5 text-xs text-zinc-300 hover:bg-white/5 uppercase tracking-wider font-semibold"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

