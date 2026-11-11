'use client'
// app/dashboard/page.tsx — Student dashboard with Onyx, Electric Indigo & Tropical Mint theme

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/shared/Navbar'
import { TableGrid } from '@/components/shared/TableGrid'
import { StatsBar } from '@/components/shared/StatsBar'
import { LiveStatusBadge, useTableSSE } from '@/components/shared/LiveStatusBadge'
import type { PublicDashboardData, PublicTable } from '@/types'
import { toast } from 'sonner'
import {
  CheckCircle2, Clock, XCircle, AlertTriangle,
  Loader2, Wifi, WifiOff, ArrowRight, Sparkles, Cable, ShieldCheck, KeyRound
} from 'lucide-react'
import { formatRelativeTime, formatDateTime } from '@/lib/utils'

type OccupancyRequest = {
  id: string
  status: string
  submittedAt: string
  connectionType: string
  table: { tableCode: string; name: string }
  approval?: { decision: string; expiresAt: string; usedAt?: string } | null
}

type OccupancySession = {
  id: string
  status: string
  startedAt: string
  connectionType: string
  table: { tableCode: string; name: string; hasEthernet: boolean }
}

type NetworkStatus = {
  clientIp: string
  isVerifiedEthernet: boolean
  verificationEnabled: boolean
  trustedPatterns: string
}

export default function StudentDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tableData, setTableData] = useState<PublicDashboardData | null>(null)
  const [mySession, setMySession] = useState<OccupancySession | null>(null)
  const [myRequests, setMyRequests] = useState<OccupancyRequest[]>([])
  const [selectedTable, setSelectedTable] = useState<PublicTable | null>(null)
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  async function handleStudentChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!currentPassword || !newPassword) return
    setChangingPassword(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to update password')
        return
      }
      toast.success('Your password was updated successfully!')
      setPasswordModalOpen(false)
      setCurrentPassword('')
      setNewPassword('')
    } catch {
      toast.error('Network error updating password')
    } finally {
      setChangingPassword(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  const fetchAll = useCallback(async (isInitial = false) => {
    try {
      const [tablesRes, sessionRes, requestsRes, networkRes] = await Promise.all([
        fetch('/api/tables', { cache: 'no-store' }),
        fetch('/api/sessions', { cache: 'no-store' }),
        fetch('/api/requests', { cache: 'no-store' }),
        fetch('/api/network-status', { cache: 'no-store' }),
      ])
      const [tablesJson, sessionJson, requestsJson, networkJson] = await Promise.all([
        tablesRes.json(), sessionRes.json(), requestsRes.json(), networkRes.json(),
      ])
      if (tablesRes.ok && tablesJson.tables && tablesJson.tables.length > 0) {
        setTableData(tablesJson)
      }
      if (sessionRes.ok) {
        setMySession(sessionJson.session ?? null)
      }
      if (requestsRes.ok && Array.isArray(requestsJson.requests)) {
        setMyRequests(requestsJson.requests)
      }
      if (networkRes.ok) {
        setNetworkStatus(networkJson)
      }
    } catch {
      if (isInitial) toast.error('Failed to load session details')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return

    // 1. Initial immediate load
    fetchAll(true)

    // 2. Real-time background live sync (every 3 seconds)
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

  const sseStatus = useTableSSE(useCallback((_type: string) => { fetchAll(false) }, [fetchAll]))

  const activePendingRequest = myRequests.find((r) => r.status === 'PENDING_APPROVAL')

  async function handleRequestTable() {
    if (!selectedTable) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: selectedTable.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to claim table')
        return
      }

      if (data.directOccupancy) {
        toast.success(data.message ?? 'Verified on Lab Ethernet! Table occupied instantly.')
      } else {
        toast.info(data.message ?? 'Request submitted via Hotspot — awaiting administrator approval.')
      }

      setSelectedTable(null)
      await fetchAll()
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRelease(sessionId: string) {
    if (!confirm('Are you sure you want to release your table?')) return
    setReleasing(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to release table')
        return
      }
      toast.success('Table released successfully.')
      await fetchAll()
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setReleasing(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#101010] text-white">
        <Navbar />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 space-y-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-white/5 rounded w-56" />
            <div className="h-24 bg-white/5 rounded-2xl" />
            <div className="h-64 bg-white/5 rounded-2xl" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Welcome */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded-full bg-[#6321FB]/30 border border-[#6321FB]/50 text-[#c4b5fd]">
                Authorized Student
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-white mt-1">
              Welcome, {session?.user?.name?.split(' ')[0]}
            </h1>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Account: {session?.user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <LiveStatusBadge status={sseStatus} />
            <button
              onClick={() => { setPasswordModalOpen(true); setCurrentPassword(''); setNewPassword('') }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white transition-all"
              title="Change your password"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#c4b5fd]" />
              Password
            </button>
          </div>
        </div>

        {/* Connection classification notice */}
        {networkStatus?.isVerifiedEthernet ? (
          <div className="flex items-start gap-3 rounded-2xl border border-[#6BFFC5]/40 bg-[#6BFFC5]/10 p-4">
            <ShieldCheck className="w-5 h-5 text-[#6BFFC5] mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-xs text-zinc-200 leading-relaxed">
              <strong className="text-[#6BFFC5] flex items-center gap-1.5 font-bold">
                <Cable className="w-4 h-4" /> University Lab Ethernet Verified (IP: {networkStatus.clientIp})
              </strong>
              You are connected through the official laboratory Ethernet network. You can <strong>take and release Ethernet tables directly</strong> without requiring administrator intervention.
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <WifiOff className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-xs text-amber-200/90 leading-relaxed">
              <strong className="text-amber-300">Connection Status: Hotspot / Unverified ({networkStatus?.clientIp || 'Detecting IP...'})</strong><br />
              Your connection is not registered through university Ethernet. 
              <strong> Administrator approval is required before you can occupy a student table.</strong>
            </div>
          </div>
        )}

        {/* Current active session */}
        {mySession && (
          <div className="rounded-3xl border-2 border-[#6BFFC5]/50 bg-[#6BFFC5]/10 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#6BFFC5]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-[#6BFFC5] font-extrabold text-lg">
                  <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                  <span>Active Session: {mySession.table.name} ({mySession.table.tableCode})</span>
                </div>
                <div className="text-xs text-zinc-300 space-y-1 font-mono">
                  <div>Started: {formatDateTime(mySession.startedAt)}</div>
                  <div>Elapsed: {formatRelativeTime(mySession.startedAt)}</div>
                  <div className="flex items-center gap-1.5 text-[#6BFFC5]">
                    {mySession.table.hasEthernet ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                    {mySession.table.hasEthernet ? 'Ethernet Port Active' : 'Hotspot Tether Active'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleRelease(mySession.id)}
                disabled={releasing}
                className="shrink-0 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500 hover:text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2"
                aria-label="Release your table"
              >
                {releasing && <Loader2 className="w-4 h-4 animate-spin" />}
                Release Table
              </button>
            </div>
          </div>
        )}

        {/* Pending Approval Screen */}
        {!mySession && activePendingRequest && (
          <div className="rounded-3xl border-2 border-amber-500/40 bg-amber-500/10 p-6">
            <div className="flex items-center gap-2.5 text-amber-300 font-extrabold text-base">
              <Clock className="w-5 h-5 animate-pulse text-amber-400" aria-hidden="true" />
              <span>Awaiting Administrator Review</span>
            </div>
            <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
              You submitted a request for <strong className="text-white">{activePendingRequest.table.name} ({activePendingRequest.table.tableCode})</strong> {formatRelativeTime(activePendingRequest.submittedAt)}.<br />
              <strong className="text-amber-300">Security enforcement:</strong> Once approved by the administrator, your table will automatically become <span className="text-[#6BFFC5] font-semibold">Occupied</span> and your session will begin without extra steps.
            </p>
          </div>
        )}

        {/* Table Selection */}
        {!mySession && !activePendingRequest && tableData && (
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-white">Select an Available Table</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Click any <span className="text-[#6BFFC5] font-semibold">Available</span> regular student table (T01–T22). Reserved representative tables cannot be requested.
              </p>
            </div>

            <TableGrid
              tables={tableData.tables}
              onTableClick={(t) => {
                if (t.status === 'AVAILABLE' && t.tableType === 'REGULAR') {
                  setSelectedTable((prev) => prev?.id === t.id ? null : t)
                }
              }}
              selectedTableId={selectedTable?.id}
              disabledFilter={(t) => t.status !== 'AVAILABLE' || t.tableType !== 'REGULAR'}
            />

            {selectedTable && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[#6321FB] bg-[#6321FB]/20 p-5">
                <div className="text-xs text-white space-y-1">
                  <div>
                    Selected: <strong className="text-[#6BFFC5] font-mono text-sm">{selectedTable.name} ({selectedTable.tableCode})</strong>
                    <span className="ml-2 font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                      {selectedTable.hasEthernet ? '🔌 Ethernet Table' : '📶 Hotspot Table'}
                    </span>
                  </div>
                  <div className="text-zinc-300 text-[11px]">
                    {networkStatus?.isVerifiedEthernet && selectedTable.hasEthernet ? (
                      <span className="text-[#6BFFC5] font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Direct Access: Lab Ethernet verified. No administrator approval needed.
                      </span>
                    ) : (
                      <span className="text-amber-300 font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Requires Approval: Connecting via Hotspot or unverified network.
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-400 hover:text-white hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRequestTable}
                    disabled={submitting}
                    className={`rounded-xl font-bold px-5 py-2.5 text-xs disabled:opacity-50 flex items-center gap-2 uppercase tracking-wider shadow-lg transition-all ${
                      networkStatus?.isVerifiedEthernet && selectedTable.hasEthernet
                        ? 'bg-[#6BFFC5] text-[#101010] hover:bg-[#5ae6af] shadow-[#6BFFC5]/20'
                        : 'bg-amber-400 text-black hover:bg-amber-300 shadow-amber-400/20'
                    }`}
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {networkStatus?.isVerifiedEthernet && selectedTable.hasEthernet
                      ? '🟢 Take Table (Direct Ethernet)'
                      : '📶 Request Table (Requires Approval)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Lab Overview */}
        {tableData && <StatsBar stats={tableData.stats} lastUpdated={tableData.lastUpdated} />}

        {/* Occupancy Request History */}
        {myRequests.length > 0 && (
          <div className="bg-[#141414] border border-white/10 rounded-3xl p-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono mb-4">
              My Request History
            </h2>
            <div className="divide-y divide-white/5">
              {myRequests.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-white">{r.table.name}</span>
                    <span className="text-zinc-500 font-mono ml-2">{formatRelativeTime(r.submittedAt)}</span>
                  </div>
                  <RequestStatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Change Password Modal */}
        {passwordModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Change Account Password"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          >
            <div className="w-full max-w-md bg-[#141414] rounded-3xl border border-white/15 shadow-2xl p-6 sm:p-8 space-y-5">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#6BFFC5]" />
                  Change Password
                </h3>
                <p className="text-xs text-zinc-400">
                  Update password for {session?.user?.email}
                </p>
              </div>

              <form onSubmit={handleStudentChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono text-zinc-300 uppercase">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
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
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter your new password"
                    className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setPasswordModalOpen(false); setCurrentPassword(''); setNewPassword('') }}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-mono text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={changingPassword || !currentPassword || newPassword.length < 8}
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
      </main>
    </div>
  )
}

function RequestStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    PENDING_APPROVAL: { label: 'Pending Approval', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: <Clock className="w-3 h-3" /> },
    APPROVED: { label: 'Approved', className: 'bg-[#6321FB]/30 text-[#c4b5fd] border-[#6321FB]/60', icon: <CheckCircle2 className="w-3 h-3 text-[#6BFFC5]" /> },
    REJECTED: { label: 'Rejected', className: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: <XCircle className="w-3 h-3" /> },
    CANCELLED: { label: 'Cancelled', className: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: <XCircle className="w-3 h-3" /> },
    EXPIRED: { label: 'Expired', className: 'bg-zinc-800 text-zinc-500 border-zinc-700', icon: <AlertTriangle className="w-3 h-3" /> },
  }
  const config = configs[status] ?? { label: status, className: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: null }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-mono border ${config.className}`}>
      {config.icon}{config.label}
    </span>
  )
}
