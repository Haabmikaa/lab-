'use client'
// app/page.tsx — Public dashboard with Onyx Black, Electric Indigo & Tropical Mint theme

import { useEffect, useState, useCallback } from 'react'
import { Navbar } from '@/components/shared/Navbar'
import { TableGrid } from '@/components/shared/TableGrid'
import { StatsBar } from '@/components/shared/StatsBar'
import { LiveStatusBadge, useTableSSE } from '@/components/shared/LiveStatusBadge'
import type { PublicDashboardData, PublicTable } from '@/types'
import { RefreshCw, Sparkles, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

export default function PublicDashboard() {
  const [data, setData] = useState<PublicDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchTables = useCallback(async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/tables')
      if (res.ok) {
        const json: PublicDashboardData = await res.json()
        setData(json)
      }
    } catch {
      // Handled silently with cached/fallback data
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  const handleSSEUpdate = useCallback((type: string, payload: unknown) => {
    if (type === 'connected') {
      const p = payload as { tables: PublicTable[]; timestamp: string }
      if (p.tables) {
        setData((prev) => prev ? { ...prev, tables: p.tables, lastUpdated: p.timestamp } : {
          tables: p.tables,
          stats: computeStats(p.tables),
          lastUpdated: p.timestamp,
        })
      }
    } else {
      fetchTables()
    }
  }, [fetchTables])

  const sseStatus = useTableSSE(handleSSEUpdate)

  if (loading && !data) {
    return (
      <div className="min-h-screen flex flex-col bg-[#101010] text-white">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
          <div className="animate-pulse space-y-6">
            <div className="h-12 bg-white/5 rounded-2xl w-80" />
            <div className="h-28 bg-white/5 rounded-2xl" />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} className="h-24 bg-white/5 rounded-2xl" />
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero & Title Bar */}
        <div className="relative rounded-3xl bg-gradient-to-r from-[#181028] via-[#141414] to-[#101010] border border-white/10 p-6 sm:p-8 overflow-hidden shadow-2xl">
          {/* Ambient glow effects */}
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#6321FB]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-[#6BFFC5]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6321FB]/20 border border-[#6321FB]/40 text-[#c4b5fd] text-xs font-mono font-medium">
                <Sparkles className="w-3.5 h-3.5 text-[#6BFFC5]" />
                University Computer Lab Floor Plan
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Live Table Occupancy
              </h1>
              <p className="text-sm sm:text-base text-zinc-400">
                Real-time monitoring across all 25 tables. Public remote view — no sign in required to inspect availability.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <LiveStatusBadge status={sseStatus} />
              <button
                onClick={fetchTables}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white transition-all disabled:opacity-50"
                aria-label="Refresh table data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#6BFFC5] ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                Refresh
              </button>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-[#6BFFC5] text-[#101010] font-bold px-4 py-2 text-xs hover:bg-[#5ae6af] shadow-md shadow-[#6BFFC5]/20 transition-all uppercase tracking-wider"
              >
                Claim a Table →
              </Link>
            </div>
          </div>
        </div>

        {/* Live Metrics */}
        {data && <StatsBar stats={data.stats} lastUpdated={data.lastUpdated} />}

        {/* Status Legend */}
        <div className="flex flex-wrap items-center gap-2.5 px-1">
          <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider mr-1">Legend:</span>
          {[
            { label: 'Available', color: 'bg-[#6BFFC5]/15 text-[#6BFFC5] border-[#6BFFC5]/40' },
            { label: 'Pending Approval', color: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
            { label: 'Approved', color: 'bg-[#6321FB]/25 text-[#c4b5fd] border-[#6321FB]/50' },
            { label: 'Occupied', color: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
            { label: 'Reserved (Staff)', color: 'bg-[#6321FB] text-white border-[#6321FB]' },
            { label: 'Maintenance', color: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
          ].map(({ label, color }) => (
            <span
              key={label}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border ${color}`}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Floor Plan Grid Container */}
        {data && (
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
            <TableGrid tables={data.tables} />
          </div>
        )}

        {/* Public Privacy Notice */}
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#141414] p-4 text-xs text-zinc-400">
          <ShieldCheck className="w-4 h-4 text-[#6BFFC5] shrink-0 mt-0.5" />
          <div>
            <strong className="text-white font-semibold">Student Privacy Guaranteed:</strong> Table statuses are broadcast publicly, but student names, emails, and active activity sessions are strictly private and never exposed. To occupy a table, log in with your authorized university account.
          </div>
        </div>
      </main>
    </div>
  )
}

function computeStats(tables: PublicTable[]): PublicDashboardData['stats'] {
  return {
    total: tables.length,
    regular: tables.filter((t) => t.tableType === 'REGULAR').length,
    reserved: tables.filter((t) => t.tableType === 'RESERVED').length,
    available: tables.filter((t) => t.status === 'AVAILABLE').length,
    occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
    pendingApproval: tables.filter((t) => t.status === 'PENDING_APPROVAL').length,
    maintenance: tables.filter((t) => t.status === 'MAINTENANCE').length,
  }
}
