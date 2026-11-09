'use client'
// components/shared/LiveStatusBadge.tsx — SSE connection indicator with Onyx/Indigo/Mint styling

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'connecting' | 'connected' | 'disconnected'

export function LiveStatusBadge({ status }: { status: Status }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono font-medium border backdrop-blur-md transition-all',
        status === 'connected' && 'bg-[#6BFFC5]/15 text-[#6BFFC5] border-[#6BFFC5]/40 shadow-sm shadow-[#6BFFC5]/20',
        status === 'connecting' && 'bg-[#6321FB]/20 text-[#c4b5fd] border-[#6321FB]/40 shadow-sm shadow-[#6321FB]/20',
        status === 'disconnected' && 'bg-rose-500/15 text-rose-400 border-rose-500/40',
      )}
    >
      {status === 'connected' && <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6BFFC5] opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6BFFC5]"></span>
      </span>}
      {status === 'connecting' && <Loader2 className="w-3 h-3 animate-spin text-[#c4b5fd]" />}
      {status === 'disconnected' && <WifiOff className="w-3 h-3 text-rose-400" />}
      <span>
        {status === 'connected' ? 'LIVE SYNC' : status === 'connecting' ? 'SYNCING…' : 'OFFLINE'}
      </span>
    </div>
  )
}

// Hook for SSE table updates
export function useTableSSE(onUpdate: (type: string, data: unknown) => void) {
  const [status, setStatus] = useState<Status>('connecting')

  useEffect(() => {
    let es: EventSource
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      setStatus('connecting')
      es = new EventSource('/api/sse')

      es.addEventListener('connected', (e) => {
        setStatus('connected')
        try {
          onUpdate('connected', JSON.parse(e.data))
        } catch {}
      })

      const tableEvents = ['table:occupied', 'table:available', 'table:maintenance', 'request:new', 'request:approved', 'request:rejected']
      tableEvents.forEach((type) => {
        es.addEventListener(type, (e) => {
          try {
            onUpdate(type, JSON.parse(e.data))
          } catch {}
        })
      })

      es.onerror = () => {
        setStatus('disconnected')
        es.close()
        reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      es?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return status
}
