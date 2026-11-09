// lib/sse.ts — Server-Sent Events emitter (in-process pub/sub)
// For production scale, replace with Redis pub/sub.

type SSEClient = {
  id: string
  controller: ReadableStreamDefaultController
}

type SSEEvent = {
  type: string
  data: unknown
}

class SSEBroadcaster {
  private clients: Map<string, SSEClient> = new Map()

  subscribe(id: string, controller: ReadableStreamDefaultController): void {
    this.clients.set(id, { id, controller })
  }

  unsubscribe(id: string): void {
    this.clients.delete(id)
  }

  emit(type: string, data: unknown): void {
    const event: SSEEvent = { type, data }
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
    const encoder = new TextEncoder()
    const encoded = encoder.encode(payload)

    const dead: string[] = []
    for (const [id, client] of this.clients) {
      try {
        client.controller.enqueue(encoded)
      } catch {
        dead.push(id)
      }
    }
    dead.forEach((id) => this.clients.delete(id))
  }

  get clientCount(): number {
    return this.clients.size
  }
}

// Global singleton (survives Next.js hot reload in dev via globalThis)
const globalForSSE = globalThis as unknown as { sseBroadcaster: SSEBroadcaster }
export const sseBroadcaster =
  globalForSSE.sseBroadcaster ?? new SSEBroadcaster()

if (process.env.NODE_ENV !== 'production') {
  globalForSSE.sseBroadcaster = sseBroadcaster
}

export function sseEmit(type: string, data: unknown): void {
  sseBroadcaster.emit(type, data)
}

