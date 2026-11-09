// app/api/sse/route.ts — Server-Sent Events endpoint for real-time updates
import { NextRequest } from 'next/server'
import { sseBroadcaster } from '@/lib/sse'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const FALLBACK_TABLES = [
  ...Array.from({ length: 22 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0')
    return {
      id: `fallback-t${num}`,
      tableCode: `T${num}`,
      name: `Table ${num}`,
      tableType: 'REGULAR',
      status: 'AVAILABLE',
      hasEthernet: i < 11,
      sortOrder: i + 1,
    }
  }),
  { id: 'fallback-t23', tableCode: 'T23', name: 'Representative Table A', tableType: 'RESERVED', status: 'RESERVED', hasEthernet: true, sortOrder: 23 },
  { id: 'fallback-t24', tableCode: 'T24', name: 'Representative Table B', tableType: 'RESERVED', status: 'RESERVED', hasEthernet: true, sortOrder: 24 },
  { id: 'fallback-t25', tableCode: 'T25', name: 'Representative Table C', tableType: 'RESERVED', status: 'RESERVED', hasEthernet: true, sortOrder: 25 },
]

export async function GET(_req: NextRequest) {
  const clientId = crypto.randomUUID()

  const stream = new ReadableStream({
    async start(controller) {
      sseBroadcaster.subscribe(clientId, controller)

      try {
        let tables = await prisma.labTable.findMany({
          where: { isActive: true },
          select: {
            id: true,
            tableCode: true,
            name: true,
            tableType: true,
            status: true,
            hasEthernet: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        })
        if (!tables || tables.length === 0) tables = FALLBACK_TABLES as any

        const payload = `event: connected\ndata: ${JSON.stringify({ tables, timestamp: new Date().toISOString() })}\n\n`
        controller.enqueue(new TextEncoder().encode(payload))
      } catch (err) {
        console.warn('[SSE] Database lookup fallback in SSE start:', (err as Error).message)
        const payload = `event: connected\ndata: ${JSON.stringify({ tables: FALLBACK_TABLES, timestamp: new Date().toISOString() })}\n\n`
        try {
          controller.enqueue(new TextEncoder().encode(payload))
        } catch {
          // Client closed
        }
      }
    },
    cancel() {
      sseBroadcaster.unsubscribe(clientId)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
