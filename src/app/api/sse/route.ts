// app/api/sse/route.ts — Server-Sent Events endpoint for real-time updates
import { NextRequest } from 'next/server'
import { sseBroadcaster } from '@/lib/sse'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const clientId = crypto.randomUUID()

  const stream = new ReadableStream({
    async start(controller) {
      sseBroadcaster.subscribe(clientId, controller)

      try {
        const tables = await prisma.labTable.findMany({
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

        if (tables && tables.length > 0) {
          const payload = `event: connected\ndata: ${JSON.stringify({ tables, timestamp: new Date().toISOString() })}\n\n`
          controller.enqueue(new TextEncoder().encode(payload))
        } else {
          const payload = `event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`
          controller.enqueue(new TextEncoder().encode(payload))
        }
      } catch (err) {
        console.warn('[SSE] DB initial fetch error:', (err as Error).message)
        const payload = `event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`
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
