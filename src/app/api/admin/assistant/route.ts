import { z } from 'zod'
import { getCurrentAdmin } from '@/lib/auth/dal'
import { loadAssistantConfig } from '@/lib/assistant/settings'
import { describeProviderError, runAssistant, type AssistantEvent } from '@/lib/assistant/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20_000) }))
    .min(1)
    .max(60),
})

/**
 * Streams one assistant reply as NDJSON (see AssistantEvent). The browser
 * keeps the conversation and sends the text turns each time.
 */
export async function POST(req: Request) {
  const admin = await getCurrentAdmin()
  if (!admin) return Response.json({ error: 'Not signed in.' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const status = await loadAssistantConfig()
  if (!status.ready) return Response.json({ error: status.reason }, { status: 409 })

  // Keep the most recent turns, starting on a user turn as every provider expects.
  let history = parsed.data.messages.slice(-30)
  while (history[0]?.role === 'assistant') history = history.slice(1)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          // The browser went away; the abort signal stops the model loop.
        }
      }
      try {
        await runAssistant({
          config: status.config,
          adminName: admin.name || admin.email,
          history,
          emit,
          signal: req.signal,
        })
        emit({ type: 'done' })
      } catch (err) {
        if (!req.signal.aborted) {
          console.error('[assistant] reply failed', err)
          emit({ type: 'error', message: describeProviderError(err) })
        }
      } finally {
        try {
          controller.close()
        } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
