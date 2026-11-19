import { timingSafeEqual } from 'node:crypto'

/** Checks the `Authorization: Bearer <SHEETS_SYNC_SECRET>` header sent by the sheet's Apps Script. */
export function isSheetSyncAuthorized(request: Request): boolean {
  const secret = process.env.SHEETS_SYNC_SECRET
  if (!secret || secret.length < 32) return false
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}
