import { z } from 'zod'
import { rejectUnlessBot } from '@/lib/bot/auth'
import { handleInbound } from '@/lib/bot/engine'
import { text } from '@/lib/bot/whatsapp'

/**
 * WhatsApp sales bot. n8n posts each inbound customer message here and sends
 * back whatever `messages` are returned (WhatsApp Cloud API message bodies,
 * without `messaging_product`/`to`). Auth: `Authorization: Bearer BOT_API_KEY`.
 */
export const dynamic = 'force-dynamic'

const inboundSchema = z.object({
  from: z.string().trim().min(7).max(20),
  profileName: z.string().trim().max(100).nullish(),
  text: z.string().max(2000).nullish(),
  replyId: z.string().max(256).nullish(),
})

export async function POST(request: Request) {
  const denied = rejectUnlessBot(request)
  if (denied) return denied

  const parsed = inboundSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  try {
    const reply = await handleInbound(parsed.data)
    return Response.json({ to: parsed.data.from, ...reply })
  } catch (err) {
    console.error('Bot message failed', err)
    // Still answer the customer so the chat doesn't go silent.
    return Response.json({
      to: parsed.data.from,
      messages: [text('Sorry, something went wrong on our side. Please try again in a moment, or type *menu*.')],
      handover: false,
    })
  }
}
