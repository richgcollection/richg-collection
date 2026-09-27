/**
 * Admin-entered dates/times are Kenyan local time. Kenya is UTC+3 year-round
 * (no DST), so a fixed offset is safe, and it keeps parsing correct on servers
 * that run in UTC (e.g. Vercel).
 */
export const STORE_TIME_ZONE = 'Africa/Nairobi'
const STORE_UTC_OFFSET = '+03:00'

/** `YYYY-MM-DD` for "today" in the store's time zone — used as the default for date inputs. */
export function todayInStoreTz(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: STORE_TIME_ZONE })
}

/** `YYYY-MM-DDTHH:mm` for "now" in the store's time zone — used as the default for datetime-local inputs. */
export function nowInStoreTzForInput(now = new Date()): string {
  const date = todayInStoreTz(now)
  const time = now.toLocaleTimeString('en-GB', {
    timeZone: STORE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${date}T${time}`
}

/**
 * Parses a `YYYY-MM-DD` date input as store-local. Today's date resolves to
 * the current instant (so same-day entries keep their real order); past dates
 * resolve to noon store time so the calendar day can't drift across time zones.
 */
export function parseStoreDate(value: string, now = new Date()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  if (value === todayInStoreTz(now)) return now
  const date = new Date(`${value}T12:00:00${STORE_UTC_OFFSET}`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Parses a `YYYY-MM-DDTHH:mm` datetime-local input as store-local. */
export function parseStoreDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00${STORE_UTC_OFFSET}`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatStoreDate(date: Date): string {
  return date.toLocaleDateString('en-KE', { timeZone: STORE_TIME_ZONE, dateStyle: 'medium' })
}

export function formatStoreDateTime(date: Date): string {
  return date.toLocaleString('en-KE', { timeZone: STORE_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' })
}
