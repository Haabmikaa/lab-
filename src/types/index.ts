// types/index.ts — Shared frontend-safe types
// Palette: Onyx Black (#101010), Electric Indigo (#6321FB), Tropical Mint (#6BFFC5)

export type TableStatusColor = {
  bg: string
  text: string
  border: string
  badge: string
}

export const TABLE_STATUS_COLORS: Record<string, TableStatusColor> = {
  AVAILABLE: {
    bg: 'bg-[#6BFFC5]/10 hover:bg-[#6BFFC5]/15',
    text: 'text-[#6BFFC5]',
    border: 'border-[#6BFFC5]/50 hover:border-[#6BFFC5]',
    badge: 'bg-[#6BFFC5]/20 text-[#6BFFC5] border border-[#6BFFC5]/40',
  },
  PENDING_APPROVAL: {
    bg: 'bg-amber-500/10 hover:bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/50 hover:border-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  },
  APPROVED: {
    bg: 'bg-[#6321FB]/15 hover:bg-[#6321FB]/25',
    text: 'text-[#c4b5fd]',
    border: 'border-[#6321FB]/60 hover:border-[#6321FB]',
    badge: 'bg-[#6321FB]/30 text-[#c4b5fd] border border-[#6321FB]/60',
  },
  OCCUPIED: {
    bg: 'bg-rose-500/10 hover:bg-rose-500/15',
    text: 'text-rose-400',
    border: 'border-rose-500/40 hover:border-rose-400',
    badge: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
  },
  RESERVED: {
    bg: 'bg-[#6321FB]/20 hover:bg-[#6321FB]/30',
    text: 'text-white',
    border: 'border-[#6321FB] hover:border-purple-400',
    badge: 'bg-[#6321FB] text-white shadow-sm shadow-[#6321FB]/50',
  },
  MAINTENANCE: {
    bg: 'bg-zinc-900/60 hover:bg-zinc-900',
    text: 'text-zinc-400',
    border: 'border-zinc-800 hover:border-zinc-700',
    badge: 'bg-zinc-800/80 text-zinc-400 border border-zinc-700',
  },
}

export const TABLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  OCCUPIED: 'Occupied',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
}

// Public-safe table representation (no PII)
export type PublicTable = {
  id: string
  tableCode: string
  name: string
  tableType: 'REGULAR' | 'RESERVED'
  status: string
  hasEthernet: boolean
  sortOrder: number
}

export type PublicDashboardData = {
  tables: PublicTable[]
  stats: {
    total: number
    regular: number
    reserved: number
    available: number
    occupied: number
    pendingApproval: number
    maintenance: number
  }
  lastUpdated: string
}
