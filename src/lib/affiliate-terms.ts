import type { CommissionType } from '@prisma/client'
import { STORE_TIME_ZONE } from '@/lib/dates'
import { formatKes } from '@/lib/money'

/**
 * Commission values are stored as integers: FIXED is whole KES per unit sold,
 * PERCENT is basis points of the line total (1000 = 10%, 750 = 7.5%).
 */
export function computeCommissionKes(input: {
  type: CommissionType
  value: number
  quantity: number
  lineTotalKes: number
}): number {
  if (input.type === 'FIXED') return Math.max(0, input.value * input.quantity)
  return Math.max(0, Math.round((input.lineTotalKes * input.value) / 10000))
}

export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, '')
}

/** Parses a percent like "7.5" into basis points; null if out of range. */
export function percentToBps(value: string): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100)
}

export function formatCommissionTerms(type: CommissionType, value: number): string {
  return type === 'FIXED' ? `${formatKes(value)} / unit` : `${bpsToPercent(value)}% of sale`
}

/** `YYYY-MM` for the store-local month of a date. */
export function monthKey(date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: STORE_TIME_ZONE }).slice(0, 7)
}

export function isMonthKey(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number)
  const index = year * 12 + (month - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** First instant after the month ends, in store time (Kenya is UTC+3 all year). */
export function monthEndExclusive(key: string): Date {
  return new Date(`${shiftMonth(key, 1)}-01T00:00:00+03:00`)
}

export function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-KE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
