'use client'
// src/app/not-found.tsx — 404 Not Found Page

import Link from 'next/link'
import { LayoutGrid, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#101010] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/3 -left-32 w-96 h-96 bg-[#6321FB]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 text-center space-y-4 max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#6321FB]/20 border border-[#6321FB]/40 mb-2">
          <LayoutGrid className="w-8 h-8 text-[#6BFFC5]" />
        </div>
        <h1 className="text-5xl font-mono font-black text-white">404</h1>
        <h2 className="text-xl font-bold text-white">Laboratory Resource Not Found</h2>
        <p className="text-xs text-zinc-400">
          The table, session, or administrative endpoint you are looking for does not exist or has been relocated.
        </p>
        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[#6BFFC5] text-[#101010] font-bold px-5 py-2.5 text-xs hover:bg-[#5ae6af] uppercase tracking-wider shadow-lg shadow-[#6BFFC5]/20"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Live Floor Plan
          </Link>
        </div>
      </div>
    </div>
  )
}

