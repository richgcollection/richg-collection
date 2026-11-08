import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * The bot API is called only by n8n, with `Authorization: Bearer <BOT_API_KEY>`.
 * Returns a 401/503 Response to send back, or null when the caller is allowed.
 */
export function rejectUnlessBot(request: Request): Response | null {
  const expected = process.env.BOT_API_KEY
  if (!expected || expected.length < 24) {
    return new Response('Bot API is not configured', { status: 503 })
  }
  const header = request.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Compare digests so the comparison is constant-time whatever the lengths.
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b) ? null : new Response('Unauthorized', { status: 401 })
}
