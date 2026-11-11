'use client'
// app/admin/page.tsx — Administrator dashboard with Onyx, Electric Indigo & Tropical Mint theme

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/shared/Navbar'
import { TableGrid } from '@/components/shared/TableGrid'
import { StatsBar } from '@/components/shared/StatsBar'
import { LiveStatusBadge, useTableSSE } from '@/components/shared/LiveStatusBadge'
import type { PublicDashboardData } from '@/types'
import { toast } from 'sonner'
import {
  Clock, CheckCircle2, XCircle, Users, Shield,
  Loader2, RefreshCw, Wrench, LogOut, AlertTriangle, Settings, Save, UserPlus,
  Cable, Wifi, Lock, Unlock, UserCheck, Trash2, KeyRound
} from 'lucide-react'
import { formatRelativeTime, formatDateTime } from '@/lib/utils'
import Link from 'next/link'

type PendingRequest = {
  id: string
  status: string
  submittedAt: string
  connectionType: string
  user: { id: string; name: string; email: string; role: string }
  table: { tableCode: string; name: string; hasEthernet: boolean }
  approval?: { decision: string; expiresAt: string } | null
}

type AdminTable = {
  id: string
  tableCode: string
  name: string
  tableType: string
  status: string
  hasEthernet: boolean
  sessions: Array<{
    id: string
    status: string
    startedAt: string
    user: { id: string; name: string; email: string }
  }>
  requests: Array<{
    id: string
    status: string
    submittedAt: string
    user: { id: string; name: string; email: string }
    approval?: { expiresAt: string } | null
  }>
}

type RejectDialogState = { open: boolean; requestId: string; reason: string }

export default function AdminDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tableData, setTableData] = useState<PublicDashboardData | null>(null)
  const [adminTables, setAdminTables] = useState<AdminTable[]>([])
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'tables' | 'users' | 'audit' | 'settings'>('overview')
  const [approving, setApproving] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<RejectDialogState>({ open: false, requestId: '', reason: '' })
  const [rejecting, setRejecting] = useState(false)
  const [selfPasswordModal, setSelfPasswordModal] = useState(false)
  const [selfCurrentPassword, setSelfCurrentPassword] = useState('')
  const [selfNewPassword, setSelfNewPassword] = useState('')
  const [selfChanging, setSelfChanging] = useState(false)

  async function handleSelfChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!selfCurrentPassword || !selfNewPassword) return
    setSelfChanging(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: selfCurrentPassword, newPassword: selfNewPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to update password')
        return
      }
      toast.success('Your password has been updated successfully!')
      setSelfPasswordModal(false)
      setSelfCurrentPassword('')
      setSelfNewPassword('')
    } catch {
      toast.error('Network error updating password')
    } finally {
      setSelfChanging(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
    if (status === 'authenticated' && session?.user?.role !== 'ADMIN') router.replace('/dashboard')
  }, [status, session, router])

  const fetchAll = useCallback(async (isInitial = false) => {
    try {
      const [tablesRes, adminTablesRes, requestsRes] = await Promise.all([
        fetch('/api/tables', { cache: 'no-store' }),
        fetch('/api/admin/tables', { cache: 'no-store' }),
        fetch('/api/admin/requests?status=PENDING_APPROVAL&limit=50', { cache: 'no-store' }),
      ])
      const [tablesJson, adminTablesJson, requestsJson] = await Promise.all([
        tablesRes.json(), adminTablesRes.json(), requestsRes.json(),
      ])
      if (tablesRes.ok && tablesJson.tables && tablesJson.tables.length > 0) {
        setTableData(tablesJson)
      }
      if (adminTablesRes.ok && Array.isArray(adminTablesJson.tables) && adminTablesJson.tables.length > 0) {
        setAdminTables(adminTablesJson.tables)
      }
      if (requestsRes.ok && Array.isArray(requestsJson.requests)) {
        setPendingRequests(requestsJson.requests)
      }
    } catch {
      // Handled silently
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return

    // 1. Initial immediate load
    fetchAll(true)

    // 2. Real-time background sync (every 3 seconds)
    const interval = setInterval(() => {
      fetchAll(false)
    }, 3000)

    // 3. Immediate refetch on window focus / tab active
    const handleFocus = () => fetchAll(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchAll(false)
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [status, fetchAll])

  const sseStatus = useTableSSE(useCallback((_: string) => { fetchAll(false) }, [fetchAll]))

  async function handleApprove(requestId: string) {
    setApproving(requestId)
    try {
      const res = await fetch(`/api/admin/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to approve'); return }
      toast.success('Request approved — table is now occupied automatically')
      await fetchAll()
    } catch { toast.error('Network error') }
    finally { setApproving(null) }
  }

  async function handleReject() {
    if (!rejectDialog.reason.trim()) { toast.error('Please provide a rejection reason'); return }
    setRejecting(true)
    try {
      const res = await fetch(`/api/admin/requests/${rejectDialog.requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectDialog.reason }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to reject'); return }
      toast.success('Request rejected')
      setRejectDialog({ open: false, requestId: '', reason: '' })
      await fetchAll()
    } catch { toast.error('Network error') }
    finally { setRejecting(false) }
  }

  async function handleReleaseTable(tableId: string, tableName: string) {
    if (!confirm(`Release active session on ${tableName}?`)) return
    try {
      const res = await fetch(`/api/admin/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to release'); return }
      toast.success('Table released by administrator')
      await fetchAll()
    } catch { toast.error('Network error') }
  }

  async function handleForceRevoke(tableId: string, tableCode: string) {
    if (!confirm(`Force reset ${tableCode} to Available? This will end any active session and cancel all pending requests.`)) return
    try {
      const res = await fetch(`/api/admin/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_revoke' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to revoke table'); return }
      toast.success(`${tableCode} forcefully reset to Available`)
      await fetchAll()
    } catch { toast.error('Network error') }
  }

  async function handleMaintenance(tableId: string, enable: boolean, tableName: string) {
    const msg = enable ? `Put ${tableName} in maintenance mode?` : `Remove ${tableName} from maintenance?`
    if (!confirm(msg)) return
    try {
      const res = await fetch(`/api/admin/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'maintenance', enable }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed'); return }
      toast.success(enable ? 'Table set to maintenance' : 'Table restored to available')
      await fetchAll()
    } catch { toast.error('Network error') }
  }

  async function handleToggleEthernet(tableId: string, currentHasEthernet: boolean, tableCode: string) {
    const newHasEthernet = !currentHasEthernet
    const modeLabel = newHasEthernet ? 'Ethernet Table' : 'Hotspot Table'
    try {
      const res = await fetch(`/api/admin/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasEthernet: newHasEthernet }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to update table mode'); return }
      toast.success(`${tableCode} set to ${modeLabel}`)
      await fetchAll()
    } catch { toast.error('Network error') }
  }

  async function handleToggleReservation(tableId: string, currentTableType: string, tableCode: string) {
    const isCurrentlyReserved = currentTableType === 'RESERVED'
    const newType = isCurrentlyReserved ? 'REGULAR' : 'RESERVED'
    const newStatus = isCurrentlyReserved ? 'AVAILABLE' : 'RESERVED'
    const confirmMsg = isCurrentlyReserved
      ? `Release representative reservation for ${tableCode}? Ordinary students will now be able to request this table.`
      : `Reserve ${tableCode} permanently for Laboratory Representatives? Students will not be able to claim it.`

    if (!confirm(confirmMsg)) return

    try {
      const res = await fetch(`/api/admin/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableType: newType, status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to update reservation'); return }
      toast.success(isCurrentlyReserved ? `${tableCode} released as Regular student table` : `${tableCode} reserved for Representatives`)
      await fetchAll()
    } catch { toast.error('Network error') }
  }

  async function handleToggleReservedOccupancy(tableId: string, currentStatus: string, tableCode: string) {
    const newStatus = currentStatus === 'OCCUPIED' ? 'RESERVED' : 'OCCUPIED'
    try {
      const res = await fetch(`/api/admin/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to update status'); return }
      toast.success(`${tableCode} marked as ${newStatus === 'OCCUPIED' ? 'Occupied by Representative' : 'Reserved (Vacant)'}`)
      await fetchAll()
    } catch { toast.error('Network error') }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#101010] text-white">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 space-y-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-white/5 rounded w-56" />
            <div className="h-28 bg-white/5 rounded-2xl" />
            <div className="h-96 bg-white/5 rounded-2xl" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6321FB]/20 border border-[#6321FB]/50 text-[#c4b5fd] text-xs font-mono font-bold mb-2">
              <Shield className="w-3.5 h-3.5 text-[#6BFFC5]" aria-hidden="true" />
              Administrator Control Center
            </div>
            <h1 className="text-3xl font-extrabold text-white">Laboratory Governance</h1>
            <p className="text-xs text-zinc-400 font-mono mt-1">
              {pendingRequests.length} occupancy request{pendingRequests.length !== 1 ? 's' : ''} awaiting review
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <LiveStatusBadge status={sseStatus} />
            <button
              onClick={() => { setSelfPasswordModal(true); setSelfCurrentPassword(''); setSelfNewPassword('') }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white transition-all"
              title="Change your admin password"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#c4b5fd]" aria-hidden="true" />
              Password
            </button>
            <button
              onClick={() => fetchAll(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:text-white transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#6BFFC5]" aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        {tableData && <StatsBar stats={tableData.stats} lastUpdated={tableData.lastUpdated} />}

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
          {(['overview', 'requests', 'tables', 'users', 'audit', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab
                  ? 'bg-[#6321FB] text-white shadow-md shadow-[#6321FB]/30'
                  : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
            >
              {tab}
              {tab === 'requests' && pendingRequests.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-[#6BFFC5] text-[#101010] text-[10px] font-black w-4 h-4">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Overview Floor Plan */}
        {activeTab === 'overview' && tableData && (
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <h2 className="text-base font-bold text-white mb-6 font-mono uppercase tracking-wider">
              Real-Time Laboratory Grid
            </h2>
            <TableGrid tables={tableData.tables} />
          </div>
        )}

        {/* Tab: Pending Requests */}
        {activeTab === 'requests' && (
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider">
                Pending Approval Requests ({pendingRequests.length})
              </h2>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="text-center py-16 text-zinc-500 space-y-2">
                <Clock className="w-10 h-10 mx-auto opacity-30 text-[#6BFFC5]" aria-hidden="true" />
                <p className="text-sm font-medium">All caught up — no pending requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="font-bold text-white text-base">
                          {r.user.name}
                          <span className="ml-2 text-xs font-mono text-zinc-400 font-normal">({r.user.email})</span>
                        </div>
                        <div className="text-sm text-zinc-300">
                          Target Table: <strong className="text-[#6BFFC5] font-mono text-base">{r.table.name} ({r.table.tableCode})</strong>
                        </div>
                        <div className="text-xs text-zinc-400 font-mono">
                          Connection: <span className="text-amber-300 uppercase font-semibold">{r.connectionType}</span>
                          {' · '}Submitted {formatRelativeTime(r.submittedAt)}
                        </div>
                      </div>
                      <div className="flex gap-2.5 shrink-0">
                        <button
                          onClick={() => handleApprove(r.id)}
                          disabled={approving === r.id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#6BFFC5] text-[#101010] px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#5ae6af] shadow-md shadow-[#6BFFC5]/20 disabled:opacity-50"
                          aria-label={`Approve request from ${r.user.name}`}
                        >
                          {approving === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Authorize
                        </button>
                        <button
                          onClick={() => setRejectDialog({ open: true, requestId: r.id, reason: '' })}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-500/10 text-rose-300 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-rose-500 hover:text-white"
                          aria-label={`Reject request from ${r.user.name}`}
                        >
                          <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Table Management */}
        {activeTab === 'tables' && (
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider">
              Administrative Table Controls
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {adminTables.map((table) => {
                const activeSession = table.sessions[0]
                const pendingReq = table.requests[0]
                return (
                  <div
                    key={table.id}
                    className="rounded-2xl border border-white/10 bg-[#161616] p-4 space-y-3.5 hover:border-white/20 transition-all shadow-md"
                  >
                    {/* Header: Table Code, Name, Role Badge, and Status Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-black text-white text-lg tracking-tight">
                          {table.tableCode}
                        </span>
                        <span className="text-xs text-zinc-400 font-medium">
                          {table.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {table.tableType === 'RESERVED' && (
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold tracking-wider bg-[#6321FB]/30 border border-[#6321FB]/60 text-[#c4b5fd]">
                            Rep Seat
                          </span>
                        )}
                        <span className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full font-bold tracking-wider border ${table.status === 'AVAILABLE' ? 'bg-[#6BFFC5]/10 text-[#6BFFC5] border-[#6BFFC5]/30' :
                            table.status === 'OCCUPIED' ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' :
                              table.status === 'RESERVED' ? 'bg-[#6321FB]/20 text-[#c4b5fd] border-[#6321FB]/40' :
                                'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}>
                          {table.status}
                        </span>
                      </div>
                    </div>

                    {/* Active Occupant Info */}
                    {activeSession && (
                      <div className="text-xs bg-rose-500/10 border border-rose-500/20 text-zinc-300 p-2.5 rounded-xl font-mono flex items-center justify-between">
                        <div>
                          <span className="text-zinc-400">Occupant: </span>
                          <strong className="text-white">{activeSession.user.name}</strong>
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          {formatRelativeTime(activeSession.startedAt)}
                        </span>
                      </div>
                    )}

                    {/* Pending Request Notice */}
                    {pendingReq && !activeSession && (
                      <div className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-200 p-2.5 rounded-xl font-mono">
                        <span className="text-amber-400/80">Pending Request: </span>
                        <strong>{pendingReq.user.name}</strong>
                      </div>
                    )}

                    {/* Representative Reserved Seat Controls */}
                    {table.tableType === 'RESERVED' && (
                      <div className="rounded-xl bg-[#6321FB]/15 border border-[#6321FB]/30 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono font-bold text-[#c4b5fd] flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-[#6BFFC5]" /> Representative Reserved Seat
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleReservation(table.id, table.tableType, table.tableCode)}
                            className="text-[10px] font-mono text-zinc-400 hover:text-white underline transition-colors"
                            title="Release this seat so regular students can claim it"
                          >
                            Make Regular Table
                          </button>
                        </div>

                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleToggleReservedOccupancy(table.id, table.status, table.tableCode)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-mono font-bold border transition-all ${table.status === 'OCCUPIED'
                                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                                : 'bg-[#6321FB]/30 border-[#6321FB]/50 text-white hover:bg-[#6321FB]/50'
                              }`}
                          >
                            {table.status === 'OCCUPIED' ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5 text-rose-300" />
                                <span>Mark Vacant (Reserved)</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5 text-[#6BFFC5]" />
                                <span>Mark Rep Seated (Occupied)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Connection Type Segmented Switch */}
                    {table.tableType === 'REGULAR' && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                          <span>Connection Type</span>
                          <span className={table.hasEthernet ? 'text-[#6BFFC5] font-semibold' : 'text-amber-300 font-semibold'}>
                            {table.hasEthernet ? 'Direct Ethernet' : 'Admin Approval Req.'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 p-1 rounded-xl bg-black/60 border border-white/10 gap-1">
                          <button
                            type="button"
                            onClick={() => !table.hasEthernet && handleToggleEthernet(table.id, false, table.tableCode)}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold font-mono transition-all ${table.hasEthernet
                                ? 'bg-[#6BFFC5] text-[#101010] shadow-md shadow-[#6BFFC5]/20 font-bold'
                                : 'text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer'
                              }`}
                          >
                            <Cable className="w-3.5 h-3.5" />
                            <span>Ethernet</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => table.hasEthernet && handleToggleEthernet(table.id, true, table.tableCode)}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold font-mono transition-all ${!table.hasEthernet
                                ? 'bg-amber-400 text-[#101010] shadow-md shadow-amber-400/20 font-bold'
                                : 'text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer'
                              }`}
                          >
                            <Wifi className="w-3.5 h-3.5" />
                            <span>Hotspot</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions footer */}
                    {table.tableType === 'REGULAR' && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => handleToggleReservation(table.id, table.tableType, table.tableCode)}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-[#c4b5fd] hover:bg-[#6321FB]/10 border border-transparent hover:border-[#6321FB]/30 px-2 py-1 rounded-lg transition-all"
                          title="Reserve this table permanently for Representatives"
                        >
                          <Lock className="w-3 h-3 text-[#6321FB]" /> Reserve Table
                        </button>

                        <div className="flex items-center gap-1.5">
                          {/* Force Revoke: available for any table that is occupied or has a pending request */}
                          {(table.status === 'OCCUPIED' || table.status === 'PENDING_APPROVAL' || table.status === 'APPROVED' || activeSession || pendingReq) && (
                            <button
                              onClick={() => handleForceRevoke(table.id, table.tableCode)}
                              className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-2.5 py-1 rounded-lg transition-all"
                              title="Forcefully reset this table back to Available"
                            >
                              <XCircle className="w-3 h-3" /> Force Revoke
                            </button>
                          )}
                          {table.status !== 'MAINTENANCE' && !activeSession && !pendingReq && table.status === 'AVAILABLE' && (
                            <button
                              onClick={() => handleMaintenance(table.id, true, table.name)}
                              className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-white/5 px-2.5 py-1 rounded-lg transition-all"
                            >
                              <Wrench className="w-3 h-3" /> Maintenance
                            </button>
                          )}
                          {table.status === 'MAINTENANCE' && (
                            <button
                              onClick={() => handleMaintenance(table.id, false, table.name)}
                              className="inline-flex items-center gap-1 text-[11px] font-mono text-[#6BFFC5] bg-[#6BFFC5]/10 border border-[#6BFFC5]/30 hover:bg-[#6BFFC5]/20 px-2.5 py-1 rounded-lg transition-all font-semibold"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Restore Table
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tab: Users */}
        {activeTab === 'users' && <AdminUsersPanel />}

        {/* Tab: Audit */}
        {activeTab === 'audit' && <AdminAuditPanel />}

        {/* Tab: Settings */}
        {activeTab === 'settings' && <AdminSettingsPanel />}
      </main>

      {/* Reject Modal */}
      {rejectDialog.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reject request"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        >
          <div className="w-full max-w-sm bg-[#141414] rounded-3xl border border-white/15 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-extrabold text-base">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              <span>Decline Table Request</span>
            </div>
            <p className="text-xs text-zinc-300">
              Provide a rationale for declining. The student will be notified.
            </p>
            <textarea
              value={rejectDialog.reason}
              onChange={(e) => setRejectDialog((d) => ({ ...d, reason: e.target.value }))}
              placeholder="e.g., Table scheduled for maintenance, please choose another table."
              rows={3}
              className="w-full rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs text-white outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB] resize-none"
              aria-label="Rejection reason"
            />
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setRejectDialog({ open: false, requestId: '', reason: '' })}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectDialog.reason.trim()}
                className="rounded-xl bg-rose-600 text-white px-4 py-2 text-xs font-bold hover:bg-rose-500 disabled:opacity-50 flex items-center gap-1.5"
              >
                {rejecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Self Change Password Modal */}
      {selfPasswordModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Change Admin Password"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md bg-[#141414] rounded-3xl border border-white/15 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#6BFFC5]" />
                Change Your Password
              </h3>
              <p className="text-xs text-zinc-400">
                Update the password for your administrator account ({session?.user?.email})
              </p>
            </div>

            <form onSubmit={handleSelfChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-zinc-300 uppercase">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={selfCurrentPassword}
                  onChange={(e) => setSelfCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-zinc-300 uppercase">
                  New Password (min 8 chars, 1 uppercase, 1 number)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={selfNewPassword}
                  onChange={(e) => setSelfNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setSelfPasswordModal(false); setSelfCurrentPassword(''); setSelfNewPassword('') }}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selfChanging || !selfCurrentPassword || selfNewPassword.length < 8}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#6BFFC5] text-[#101010] font-bold px-4 py-2 text-xs hover:bg-[#5ae6af] uppercase tracking-wider disabled:opacity-40 transition-all shadow-md shadow-[#6BFFC5]/20"
                >
                  {selfChanging && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#101010]" />}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const INITIAL_ADMIN_USERS = [
  { id: 'cmwbpghab0000jh08u1cf2vkb', name: 'Emrafil', email: 'epix3epix@gmail.com', role: 'REPRESENTATIVE', accountStatus: 'ACTIVE' },
  { id: 'cmwbofn2r0000id08r8bqlz0j', name: 'Estifanos tema', email: 'etemesgen817@gmail.com', role: 'STUDENT', accountStatus: 'ACTIVE' },
  { id: 'cmwbobahs0000jv088o8gfjrr', name: 'Dagim Tesfaye', email: 'damitansio@gmail.com', role: 'STUDENT', accountStatus: 'ACTIVE' },
  { id: 'cmwbo77yr0002jv082cf8ftnw', name: 'Yehwala obssi', email: 'obssiyehwala@gmail.com', role: 'STUDENT', accountStatus: 'ACTIVE' },
  { id: 'cmw9q49tp0000lc08gxkm1h5z', name: 'Firaol Negash', email: 'feranegash604@gmail.com', role: 'REPRESENTATIVE', accountStatus: 'ACTIVE' },
  { id: 'cmw9ou3yo0002jk08mql7p6h1', name: 'efaa', email: 'efadoit37@gmail.com', role: 'ADMIN', accountStatus: 'ACTIVE' },
  { id: 'cmw9i9fe30002i3ec8y728i6x', name: 'Haab', email: 'epix2epix@gmail.com', role: 'STUDENT', accountStatus: 'ACTIVE' },
  { id: 'cmw9hwzlo0000i3u4umolkzvv', name: 'Ermias Nigussue', email: 'haabmikaa@gmail.com', role: 'ADMIN', accountStatus: 'ACTIVE' },
]

let cachedAdminUsers: unknown[] = INITIAL_ADMIN_USERS

function AdminUsersPanel() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<unknown[]>(() => cachedAdminUsers)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [passwordModalUser, setPasswordModalUser] = useState<{ id: string; name: string; email: string } | null>(null)
  const [newPasswordValue, setNewPasswordValue] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const isFetchingRef = useState({ inFlight: false })[0]

  const loadUsers = useCallback(async (isInitial = false) => {
    // Prevent stacking requests if previous query is still pending
    if (isFetchingRef.inFlight) return
    isFetchingRef.inFlight = true

    try {
      const res = await fetch('/api/admin/users?limit=100', { cache: 'no-store' })
      if (!res.ok) {
        // Retry gently if initial call returned 401/503 during session sync
        if (isInitial) {
          setTimeout(() => loadUsers(true), 1000)
        }
        return
      }
      const data = await res.json()
      if (Array.isArray(data.users) && data.users.length > 0) {
        cachedAdminUsers = data.users
        setUsers(data.users)
      }
    } catch {
      if (isInitial && users.length === 0) {
        setTimeout(() => loadUsers(true), 1200)
      }
    } finally {
      isFetchingRef.inFlight = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [isFetchingRef, users.length])

  useEffect(() => {
    // Immediate background refresh
    loadUsers(false)

    // Gentle 6-second sync with concurrency lock — avoids overloading the database connection pool
    const interval = setInterval(() => {
      loadUsers(false)
    }, 6000)

    const handleFocus = () => loadUsers(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadUsers(false)
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [loadUsers])

  async function handleToggleStatus(userId: string, currentStatus: string, name: string) {
    const newAction = currentStatus === 'ACTIVE' ? 'disable' : 'enable'
    if (!confirm(`${newAction === 'disable' ? 'Deactivate' : 'Reactivate'} account for ${name}?`)) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: newAction }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to update user'); return }
      toast.success(`Account ${newAction === 'disable' ? 'deactivated' : 'reactivated'}`)
      loadUsers()
    } catch {
      toast.error('Network error')
    }
  }

  async function handleDeleteUser(userId: string, name: string, email: string) {
    if (!confirm(`Are you sure you want to permanently delete user "${name}" (${email})?\n\nThis will remove their account and historical records. This action cannot be undone.`)) return

    setDeletingUserId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to delete user')
        return
      }
      toast.success(`User ${email} permanently deleted`)
      loadUsers()
    } catch {
      toast.error('Network error deleting user')
    } finally {
      setDeletingUserId(null)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!passwordModalUser) return
    if (!newPasswordValue || newPasswordValue.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    setChangingPassword(true)
    try {
      const res = await fetch(`/api/admin/users/${passwordModalUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', password: newPasswordValue }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to update password')
        return
      }
      toast.success(data.message ?? 'Password updated successfully')
      setPasswordModalUser(null)
      setNewPasswordValue('')
      loadUsers()
    } catch {
      toast.error('Network error changing password')
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) return <div className="animate-pulse h-48 bg-white/5 rounded-3xl" />

  return (
    <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4 text-[#6BFFC5]" aria-hidden="true" />
          Authorized User Accounts {users.length > 0 && <span className="text-[#6BFFC5]">({users.length})</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); loadUsers(false) }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-mono font-bold text-zinc-300 hover:text-white transition-all disabled:opacity-50"
            title="Instantly refetch user accounts"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#6BFFC5] ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/admin/users/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#6BFFC5] text-[#101010] font-bold px-4 py-2 text-xs hover:bg-[#5ae6af] uppercase tracking-wider shadow-md shadow-[#6BFFC5]/20"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Authorize User
          </Link>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 space-y-4 font-mono border border-dashed border-white/10 rounded-2xl p-6 bg-black/20">
          <Users className="w-10 h-10 mx-auto text-zinc-600" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">No user accounts found</p>
            <p className="text-xs text-zinc-500">Checking database connection or no accounts match query.</p>
          </div>
          <button
            onClick={() => { setRefreshing(true); loadUsers(true) }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-mono transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#6BFFC5] ${refreshing ? 'animate-spin' : ''}`} />
            Retry Loading Users
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400 font-mono uppercase">
                <th className="text-left py-3 px-3">Name</th>
                <th className="text-left py-3 px-3">Email</th>
                <th className="text-left py-3 px-3">Role</th>
                <th className="text-left py-3 px-3">Status</th>
                <th className="text-right py-3 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(users as Array<{ id: string; name: string; email: string; role: string; accountStatus: string }>).map((u) => {
                const isSelf = u.id === session?.user?.id
                return (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-3 font-semibold text-white">
                      {u.name} {isSelf && <span className="ml-1 text-[10px] font-mono text-zinc-400">(You)</span>}
                    </td>
                    <td className="py-3 px-3 text-zinc-400 font-mono">{u.email}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                        u.role === 'ADMIN' ? 'bg-[#6321FB] text-white' : 'bg-[#6321FB]/20 text-[#c4b5fd]'
                      }`}>{u.role}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                        u.accountStatus === 'ACTIVE' ? 'bg-[#6BFFC5]/20 text-[#6BFFC5] border border-[#6BFFC5]/40' :
                        u.accountStatus === 'DISABLED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                        'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>{u.accountStatus}</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Password reset button */}
                        <button
                          onClick={() => { setPasswordModalUser(u); setNewPasswordValue('') }}
                          title="Change user password"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-[#6321FB]/20 border border-[#6321FB]/40 text-[#c4b5fd] hover:bg-[#6321FB] hover:text-white transition-all"
                        >
                          <KeyRound className="w-3 h-3" />
                          Password
                        </button>

                        {/* Deactivate/Reactivate button */}
                        {!isSelf && u.role !== 'ADMIN' && (
                          <button
                            onClick={() => handleToggleStatus(u.id, u.accountStatus, u.name)}
                            className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase font-bold transition-all ${
                              u.accountStatus === 'ACTIVE'
                                ? 'border border-amber-500/40 text-amber-300 hover:bg-amber-500 hover:text-black'
                                : 'border border-[#6BFFC5]/40 text-[#6BFFC5] hover:bg-[#6BFFC5] hover:text-[#101010]'
                            }`}
                          >
                            {u.accountStatus === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </button>
                        )}

                        {/* Delete user button */}
                        {!isSelf && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name, u.email)}
                            disabled={deletingUserId === u.id}
                            title="Permanently delete user"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase font-bold border border-rose-500/40 text-rose-300 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
                          >
                            {deletingUserId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Change Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/15 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#6BFFC5]" />
                Change Password
              </h3>
              <p className="text-xs text-zinc-400">
                Updating password for <strong className="text-white">{passwordModalUser.name}</strong> ({passwordModalUser.email})
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-zinc-300 uppercase">
                  New Password (min 8 characters)
                </label>
                <input
                  type="text"
                  required
                  minLength={8}
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setPasswordModalUser(null); setNewPasswordValue('') }}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword || newPasswordValue.length < 8}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#6BFFC5] text-[#101010] font-bold px-4 py-2 text-xs hover:bg-[#5ae6af] uppercase tracking-wider disabled:opacity-40 transition-all shadow-md shadow-[#6BFFC5]/20"
                >
                  {changingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#101010]" />}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminAuditPanel() {
  const [logs, setLogs] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadAudit = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch('/api/audit?limit=50', { cache: 'no-store' })
      const data = await res.json()
      if (data.logs) {
        setLogs(data.logs)
      }
    } catch {
      if (isInitial) toast.error('Failed to load audit records')
    } finally {
      if (isInitial) setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadAudit(true)

    const interval = setInterval(() => {
      loadAudit(false)
    }, 3000)

    const handleFocus = () => loadAudit(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadAudit(false)
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [loadAudit])

  if (loading) return <div className="animate-pulse h-48 bg-white/5 rounded-3xl" />

  return (
    <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#6BFFC5]" />
          Audit Log (Recent 50 Events)
        </h2>
        <button
          onClick={() => { setRefreshing(true); loadAudit(false) }}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-mono font-bold text-zinc-300 hover:text-white transition-all disabled:opacity-50"
          title="Instantly refetch audit log"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#6BFFC5] ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 font-mono text-xs">
          No audit records found.
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {(logs as Array<{ id: string; action: string; createdAt: string; actor?: { name: string; email: string } | null; entityType?: string; entityId?: string }>).map((log) => (
            <div key={log.id} className="py-2.5 flex items-start justify-between gap-4 text-xs">
              <div className="min-w-0 flex-1">
                <span className="font-mono font-bold text-[#6BFFC5]">{log.action}</span>
                {log.actor && (
                  <span className="ml-2 text-zinc-300 font-mono">by {log.actor.name}</span>
                )}
                {log.entityType && (
                  <span className="ml-2 text-zinc-500 font-mono">[{log.entityType}]</span>
                )}
              </div>
              <span className="shrink-0 text-[11px] font-mono text-zinc-500">{formatRelativeTime(log.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type SettingItem = {
  id: string
  key: string
  value: string
  description?: string
  updatedAt: string
}

function AdminSettingsPanel() {
  const [settings, setSettings] = useState<SettingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const fetchSettings = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      const data = await res.json()
      if (data.settings) {
        setSettings(data.settings)
        setEditValues((prev) => {
          const updated = { ...prev }
          data.settings.forEach((s: SettingItem) => {
            if (updated[s.key] === undefined) {
              updated[s.key] = s.value
            }
          })
          return updated
        })
      }
    } catch {
      if (isInitial) toast.error('Failed to load system settings')
    } finally {
      if (isInitial) setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings(true)
  }, [fetchSettings])

  async function handleSave(key: string) {
    const val = editValues[key]
    if (val === undefined) return
    setSavingKey(key)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to update setting')
        return
      }
      toast.success(`Updated ${key}`)
      await fetchSettings(false)
    } catch {
      toast.error('Network error updating setting')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <div className="animate-pulse h-48 bg-white/5 rounded-3xl" />

  return (
    <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#6BFFC5]" />
            Configurable Lab Policies
          </h2>
          <p className="text-xs text-zinc-400">
            Adjust session durations, inactivity timeouts, and approval policies. Changes take effect immediately.
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); fetchSettings(false) }}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-mono font-bold text-zinc-300 hover:text-white transition-all disabled:opacity-50 self-start sm:self-auto"
          title="Instantly refetch policies"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#6BFFC5] ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="divide-y divide-white/5">
        {settings.map((s) => (
          <div key={s.id} className="py-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-1 max-w-sm">
              <div className="font-mono text-xs font-bold text-[#c4b5fd] flex items-center gap-2">
                {s.key}
                {s.key === 'trusted_ethernet_ips' && (
                  <span className="text-[10px] font-mono uppercase bg-[#6BFFC5]/20 text-[#6BFFC5] border border-[#6BFFC5]/30 px-2 py-0.5 rounded-full">
                    Active IP Policy
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed">{s.description || 'Configurable policy'}</div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
              {s.key === 'trusted_ethernet_ips' ? (
                <textarea
                  rows={2}
                  value={editValues[s.key] ?? s.value}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  placeholder="e.g. 10.240.72.1-10.240.72.225, 102.213.68.*, 127.0.0.1"
                  className="w-full lg:w-[420px] rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs text-[#6BFFC5] font-mono outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB] resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={editValues[s.key] ?? s.value}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  className="w-full sm:w-64 rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
                />
              )}
              <button
                onClick={() => handleSave(s.key)}
                disabled={savingKey === s.key || editValues[s.key] === s.value}
                className="self-end sm:self-auto inline-flex items-center gap-1.5 rounded-xl bg-[#6BFFC5] text-[#101010] px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#5ae6af] disabled:opacity-40 transition-all shadow-sm shadow-[#6BFFC5]/20 shrink-0"
              >
                {savingKey === s.key ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#101010]" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
