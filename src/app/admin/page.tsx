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
  Cable, Smartphone
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

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
    if (status === 'authenticated' && session?.user?.role !== 'ADMIN') router.replace('/dashboard')
  }, [status, session, router])

  const fetchAll = useCallback(async () => {
    try {
      const [tablesRes, adminTablesRes, requestsRes] = await Promise.all([
        fetch('/api/tables'),
        fetch('/api/admin/tables'),
        fetch('/api/admin/requests?status=PENDING_APPROVAL&limit=50'),
      ])
      const [tablesJson, adminTablesJson, requestsJson] = await Promise.all([
        tablesRes.json(), adminTablesRes.json(), requestsRes.json(),
      ])
      setTableData(tablesJson)
      setAdminTables(adminTablesJson.tables ?? [])
      setPendingRequests(requestsJson.requests ?? [])
    } catch {
      // Handled silently
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') fetchAll()
  }, [status, fetchAll])

  const sseStatus = useTableSSE(useCallback((_: string) => { fetchAll() }, [fetchAll]))

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
      toast.success('Request approved — student can now activate table')
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
    const modeLabel = newHasEthernet ? 'Ethernet Port Table' : 'Mobile Table (Hotspot required)'
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
          <div className="flex items-center gap-3">
            <LiveStatusBadge status={sseStatus} />
            <button
              onClick={fetchAll}
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
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === tab
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {adminTables.map((table) => {
                const activeSession = table.sessions[0]
                const pendingReq = table.requests[0]
                return (
                  <div
                    key={table.id}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-extrabold text-white text-base">{table.tableCode}</span>
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                        table.status === 'AVAILABLE' ? 'bg-[#6BFFC5]/10 text-[#6BFFC5] border-[#6BFFC5]/40' :
                        table.status === 'OCCUPIED' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                        table.status === 'RESERVED' ? 'bg-[#6321FB]/20 text-[#c4b5fd] border-[#6321FB]/40' :
                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}>
                        {table.status}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-300 font-medium">{table.name}</div>
                    {activeSession && (
                      <div className="text-xs text-zinc-400 bg-white/5 p-2 rounded-xl font-mono">
                        Occupant: <strong className="text-white">{activeSession.user.name}</strong><br />
                        Since: {formatRelativeTime(activeSession.startedAt)}
                      </div>
                    )}
                    {pendingReq && !activeSession && (
                      <div className="text-xs text-amber-300 bg-amber-500/10 p-2 rounded-xl font-mono">
                        Pending: <strong>{pendingReq.user.name}</strong>
                      </div>
                    )}
                    {table.tableType === 'REGULAR' && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {activeSession && (
                          <button
                            onClick={() => handleReleaseTable(table.id, table.name)}
                            className="inline-flex items-center gap-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500 hover:text-white transition-all"
                          >
                            <LogOut className="w-3 h-3" /> Force Release
                          </button>
                        )}
                        {table.status !== 'MAINTENANCE' && !activeSession && (
                          <button
                            onClick={() => handleMaintenance(table.id, true, table.name)}
                            className="inline-flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 text-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 hover:text-white transition-all"
                          >
                            <Wrench className="w-3 h-3" /> Set Maintenance
                          </button>
                        )}
                        {table.status === 'MAINTENANCE' && (
                          <button
                            onClick={() => handleMaintenance(table.id, false, table.name)}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#6BFFC5]/20 border border-[#6BFFC5]/40 text-[#6BFFC5] px-3 py-1.5 text-xs font-semibold hover:bg-[#6BFFC5] hover:text-[#101010] transition-all"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Restore Table
                          </button>
                        )}
                      </div>
                    )}

                    {/* Table Network Mode: Ethernet Port vs Mobile Table Toggle */}
                    {table.tableType === 'REGULAR' && (
                      <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {table.hasEthernet ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#6BFFC5] font-semibold bg-[#6BFFC5]/10 border border-[#6BFFC5]/30 px-2 py-0.5 rounded-lg">
                              <Cable className="w-3 h-3 shrink-0" /> Ethernet Port Table
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                              <Smartphone className="w-3 h-3 shrink-0" /> Mobile Table (Hotspot)
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleToggleEthernet(table.id, table.hasEthernet, table.tableCode)}
                          className={`shrink-0 text-[10px] font-mono uppercase px-2.5 py-1 rounded-lg border font-bold transition-all ${
                            table.hasEthernet
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                              : 'bg-[#6BFFC5]/15 border-[#6BFFC5]/30 text-[#6BFFC5] hover:bg-[#6BFFC5]/25'
                          }`}
                          title={table.hasEthernet ? 'Switch to Mobile Table (Hotspot)' : 'Switch to Ethernet Port Table'}
                        >
                          Set as {table.hasEthernet ? 'Mobile' : 'Ethernet'}
                        </button>
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
    </div>
  )
}

function AdminUsersPanel() {
  const [users, setUsers] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)

  const loadUsers = useCallback(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => toast.error('Failed to load accounts'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadUsers()
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

  if (loading) return <div className="animate-pulse h-48 bg-white/5 rounded-3xl" />

  return (
    <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4 text-[#6BFFC5]" aria-hidden="true" />
          Authorized User Accounts
        </h2>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#6BFFC5] text-[#101010] font-bold px-4 py-2 text-xs hover:bg-[#5ae6af] uppercase tracking-wider shadow-md shadow-[#6BFFC5]/20"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Authorize User
        </Link>
      </div>
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
            {(users as Array<{ id: string; name: string; email: string; role: string; accountStatus: string }>).map((u) => (
              <tr key={u.id} className="hover:bg-white/5 transition-colors">
                <td className="py-3 px-3 font-semibold text-white">{u.name}</td>
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
                  {u.role !== 'ADMIN' && (
                    <button
                      onClick={() => handleToggleStatus(u.id, u.accountStatus, u.name)}
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase font-bold transition-all ${
                        u.accountStatus === 'ACTIVE'
                          ? 'border border-rose-500/40 text-rose-300 hover:bg-rose-500 hover:text-white'
                          : 'border border-[#6BFFC5]/40 text-[#6BFFC5] hover:bg-[#6BFFC5] hover:text-[#101010]'
                      }`}
                    >
                      {u.accountStatus === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AdminAuditPanel() {
  const [logs, setLogs] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/audit?limit=50')
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .catch(() => toast.error('Failed to load audit records'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="animate-pulse h-48 bg-white/5 rounded-3xl" />

  return (
    <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
      <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider">
        Audit Log (Recent 50 Events)
      </h2>
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
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (data.settings) {
        setSettings(data.settings)
        const initial: Record<string, string> = {}
        data.settings.forEach((s: SettingItem) => {
          initial[s.key] = s.value
        })
        setEditValues(initial)
      }
    } catch {
      toast.error('Failed to load system settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
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
      await fetchSettings()
    } catch {
      toast.error('Network error updating setting')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <div className="animate-pulse h-48 bg-white/5 rounded-3xl" />

  return (
    <div className="bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#6BFFC5]" />
          Configurable Lab Policies
        </h2>
        <p className="text-xs text-zinc-400">
          Adjust session durations, inactivity timeouts, and approval policies. Changes take effect immediately.
        </p>
      </div>

      <div className="divide-y divide-white/5">
        {settings.map((s) => (
          <div key={s.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-0.5 max-w-md">
              <div className="font-mono text-xs font-bold text-[#c4b5fd]">{s.key}</div>
              <div className="text-xs text-zinc-400">{s.description || 'Configurable policy'}</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValues[s.key] ?? s.value}
                onChange={(e) => setEditValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                className="w-48 rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
              />
              <button
                onClick={() => handleSave(s.key)}
                disabled={savingKey === s.key || editValues[s.key] === s.value}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#6BFFC5] text-[#101010] px-3.5 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#5ae6af] disabled:opacity-40 transition-all shadow-sm shadow-[#6BFFC5]/20"
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
