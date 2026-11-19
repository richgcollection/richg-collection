import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { isSheetSyncAuthorized } from '@/lib/stock-tracker/auth'
import { runSheetSync } from '@/lib/stock-tracker/sync'

// Sheet → site. The Apps Script posts the Stock In / Stock Out / PROFIT rows;
// the site applies them and returns the SITE ID for every row that didn't
// have one, for the sheet to store.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()])
const row = z.record(z.string(), cell).and(z.object({ _row: z.number().int().positive() }))
const bodySchema = z.object({ sheets: z.record(z.string(), z.array(row).max(20_000)) })

export async function POST(request: Request) {
  if (!isSheetSyncAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Expected { sheets: { [name]: rows[] } }' }, { status: 400 })

  try {
    const result = await runSheetSync(parsed.data.sheets as Parameters<typeof runSheetSync>[0], { source: 'apps-script' })
    if (result.status === 'APPLIED') {
      revalidatePath('/admin/inventory')
      revalidatePath('/admin')
      revalidatePath('/', 'layout')
    }
    return Response.json({ status: result.status, message: result.message, problems: result.plan.problems, links: result.links })
  } catch (err) {
    return Response.json({ status: 'FAILED', message: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
