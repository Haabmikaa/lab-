'use client'
// components/shared/StatsBar.tsx — Summary metrics with Onyx, Electric Indigo & Tropical Mint styling

import type { PublicDashboardData } from '@/types'
import {
  LayoutGrid, CheckCircle2, XCircle, Clock, Lock, Wrench
} from 'lucide-react'

type Props = {
  stats: PublicDashboardData['stats']
  lastUpdated?: string
}

const statItems = (stats: Props['stats']) => [
  { label: 'Available',    value: stats.available,       icon: <CheckCircle2 className="w-4 h-4 text-[#6BFFC5]" />, color: 'text-[#6BFFC5]' },
  { label: 'Occupied',     value: stats.occupied,        icon: <XCircle className="w-4 h-4 text-rose-400" />,          color: 'text-rose-400' },
  { label: 'Pending',      value: stats.pendingApproval, icon: <Clock className="w-4 h-4 text-amber-300" />,          color: 'text-amber-300' },
  { label: 'Reserved',     value: stats.reserved,        icon: <Lock className="w-4 h-4 text-[#c4b5fd]" />,          color: 'text-[#c4b5fd]' },
  { label: 'Maintenance',  value: stats.maintenance,     icon: <Wrench className="w-4 h-4 text-zinc-500" />,          color: 'text-zinc-400' },
  { label: 'Total Tables', value: stats.total,           icon: <LayoutGrid className="w-4 h-4 text-white" />,        color: 'text-white' },
]

export function StatsBar({ stats, lastUpdated }: Props) {
  return (
    <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
      {/* Subtle Indigo & Mint background ambient glow */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#6321FB]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#6BFFC5]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statItems(stats).map(({ label, value, icon, color }) => (
          <div key={label} className="flex flex-col items-center justify-center p-3 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
              {icon}
              <span>{label}</span>
            </div>
            <span className={`text-3xl font-extrabold font-mono mt-1 ${color}`}>{value}</span>
          </div>
        ))}
      </div>
      {lastUpdated && (
        <p className="mt-3 text-center text-[11px] font-mono text-zinc-500">
          Last synchronized {new Date(lastUpdated).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
