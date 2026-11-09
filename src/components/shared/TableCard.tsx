'use client'
// components/shared/TableCard.tsx — Visual table card with Onyx, Electric Indigo & Tropical Mint theme

import { TABLE_STATUS_COLORS, TABLE_STATUS_LABELS, type PublicTable } from '@/types'
import {
  Monitor,
  Wifi,
  WifiOff,
  Cable,
  Smartphone,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_ICONS: Record<string, React.ReactNode> = {
  AVAILABLE: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />,
  PENDING_APPROVAL: <Clock className="w-3.5 h-3.5" aria-hidden="true" />,
  APPROVED: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />,
  OCCUPIED: <XCircle className="w-3.5 h-3.5" aria-hidden="true" />,
  RESERVED: <Lock className="w-3.5 h-3.5" aria-hidden="true" />,
  MAINTENANCE: <Wrench className="w-3.5 h-3.5" aria-hidden="true" />,
}

type Props = {
  table: PublicTable
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  compact?: boolean
}

export function TableCard({ table, onClick, selected, disabled, compact = false }: Props) {
  const colors = TABLE_STATUS_COLORS[table.status] ?? TABLE_STATUS_COLORS.AVAILABLE
  const label = TABLE_STATUS_LABELS[table.status] ?? table.status
  const icon = STATUS_ICONS[table.status]

  const isClickable = onClick && !disabled
  const isAvailable = table.status === 'AVAILABLE'

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={`${table.name}: ${label}`}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() } : undefined}
      className={cn(
        'relative rounded-2xl border transition-all duration-200 backdrop-blur-md',
        compact ? 'p-2.5' : 'p-3.5',
        colors.bg,
        colors.border,
        isClickable && isAvailable && !selected && 'cursor-pointer hover:scale-[1.03] hover:shadow-lg hover:shadow-[#6BFFC5]/10 active:scale-100',
        isClickable && !isAvailable && 'cursor-not-allowed opacity-50',
        selected && 'ring-2 ring-[#6321FB] ring-offset-2 ring-offset-[#101010] scale-[1.03] shadow-lg shadow-[#6321FB]/30 bg-[#6321FB]/20',
        disabled && !isAvailable && 'opacity-40 cursor-not-allowed',
      )}
    >
      {/* Table code */}
      <div className="flex items-center justify-between">
        <span className={cn('font-mono font-extrabold tracking-tight', compact ? 'text-sm' : 'text-base', colors.text)}>
          {table.tableCode}
        </span>
        {/* Table Type badge for reserved */}
        {table.tableType === 'RESERVED' && !compact && (
          <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-white bg-[#6321FB] px-1.5 py-0.5 rounded-md">
            <Monitor className="w-3 h-3" />
            Rep
          </span>
        )}
      </div>

      {/* Status badge */}
      {!compact && (
        <div className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', colors.badge)}>
          {icon}
          <span>{label}</span>
        </div>
      )}

      {/* Ethernet vs Mobile Table Mode */}
      {!compact && table.tableType === 'REGULAR' && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium">
          {table.hasEthernet ? (
            <span className="inline-flex items-center gap-1 text-[#6BFFC5]">
              <Cable className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ethernet Port Table</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Mobile Table (Hotspot)</span>
            </span>
          )}
        </div>
      )}

      {/* Compact status dot */}
      {compact && (
        <div
          aria-hidden="true"
          className={cn(
            'absolute top-2 right-2 w-2 h-2 rounded-full',
            table.status === 'AVAILABLE' && 'bg-[#6BFFC5] shadow-[0_0_8px_#6BFFC5]',
            table.status === 'PENDING_APPROVAL' && 'bg-amber-400 shadow-[0_0_8px_#fbbf24]',
            table.status === 'APPROVED' && 'bg-[#6321FB] shadow-[0_0_8px_#6321FB]',
            table.status === 'OCCUPIED' && 'bg-rose-500 shadow-[0_0_8px_#f43f5e]',
            table.status === 'RESERVED' && 'bg-[#6321FB] shadow-[0_0_8px_#6321FB]',
            table.status === 'MAINTENANCE' && 'bg-zinc-600',
          )}
        />
      )}
    </div>
  )
}
