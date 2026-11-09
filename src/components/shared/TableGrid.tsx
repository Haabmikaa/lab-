'use client'
// components/shared/TableGrid.tsx — Responsive table grid with Onyx, Electric Indigo & Tropical Mint theme

import { type PublicTable } from '@/types'
import { TableCard } from './TableCard'

type Props = {
  tables: PublicTable[]
  onTableClick?: (table: PublicTable) => void
  selectedTableId?: string
  disabledFilter?: (table: PublicTable) => boolean
  compact?: boolean
}

export function TableGrid({ tables, onTableClick, selectedTableId, disabledFilter, compact = false }: Props) {
  const regular = tables.filter((t) => t.tableType === 'REGULAR')
  const reserved = tables.filter((t) => t.tableType === 'RESERVED')

  return (
    <div className="space-y-8">
      {/* Regular student tables */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-[#6BFFC5] shadow-[0_0_8px_#6BFFC5]" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
            Student Tables · T01–T22
          </h3>
          <span className="text-[11px] text-zinc-500 font-mono">
            ({regular.filter(t => t.status === 'AVAILABLE').length} Available)
          </span>
        </div>
        <div
          className={
            compact
              ? 'grid grid-cols-6 sm:grid-cols-8 md:grid-cols-11 gap-2'
              : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3'
          }
        >
          {regular.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onClick={onTableClick ? () => onTableClick(table) : undefined}
              selected={selectedTableId === table.id}
              disabled={disabledFilter ? disabledFilter(table) : undefined}
              compact={compact}
            />
          ))}
        </div>
      </div>

      {/* Reserved representative tables */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-[#6321FB] shadow-[0_0_8px_#6321FB]" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#c4b5fd]">
            Representative Reserved Tables · T23–T25
          </h3>
          <span className="text-[11px] text-zinc-500 font-mono">(Permanent Lab Staff)</span>
        </div>
        <div
          className={
            compact
              ? 'grid grid-cols-3 gap-2'
              : 'grid grid-cols-1 sm:grid-cols-3 gap-3'
          }
        >
          {reserved.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
