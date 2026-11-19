import { z } from 'zod'
import { isSheetSyncAuthorized } from '@/lib/stock-tracker/auth'
import { ackOutbox, listOutbox } from '@/lib/stock-tracker/outbox'

// Site → sheet. GET lists stock entries made on the site that the sheet
// doesn't have yet; POST { ids } confirms the sheet has appended them.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isSheetSyncAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json({ rows: await listOutbox() })
}

const ackSchema = z.object({ ids: z.array(z.string().min(1)).max(500) })

export async function POST(request: Request) {
  if (!isSheetSyncAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = ackSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Expected { ids: string[] }' }, { status: 400 })
  return Response.json({ acknowledged: await ackOutbox(parsed.data.ids) })
}
