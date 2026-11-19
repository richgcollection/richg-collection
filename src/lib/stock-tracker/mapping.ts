import type { StockMovementReason } from '@prisma/client'

/**
 * How the "RICH G COLLECTION - STOCK TRACKER" Google Sheet describes products
 * and stock movements, and how that maps onto the site's catalogue and ledger.
 * Site product names are "<Colour> <Type>", e.g. "Black Round Neck T-Shirt".
 */

export const SHEET_NAMES = { in: 'Stock In', out: 'Stock Out', profit: 'PROFIT' } as const

/** Column in Stock In / Stock Out that links a row to its site ledger entry. */
export const SITE_ID_COLUMN = 'SITE ID'

export const TYPE_BY_CATEGORY: Record<string, string> = {
  SHORTS: 'Gym Shorts',
  VEST: 'Gym Vest',
  'R TSHIRTS': 'Round Neck T-Shirt',
  'O TSHIRTS': 'Oversized T-Shirt',
  'L TSHIRTS': 'Long Sleeve T-Shirt',
  'COLLARLESS SHIRT': 'Collarless Shirt',
  OFFICIAL: 'Official Shirt',
  'SHORT SLEEVED SHIRT': 'Short Sleeved Shirt',
  'SIDE ADJUSTER': 'Side Adjuster Trousers',
  BELTED: 'Belted Trousers',
}

/** The sheet's ITEM column, per CATEGORY. */
export const ITEM_BY_CATEGORY: Record<string, string> = {
  SHORTS: 'GYM SHORTS',
  VEST: 'GYM VEST',
  'R TSHIRTS': 'TSHIRTS',
  'O TSHIRTS': 'TSHIRTS',
  'L TSHIRTS': 'TSHIRTS',
  'COLLARLESS SHIRT': 'SHIRTS',
  OFFICIAL: 'SHIRTS',
  'SHORT SLEEVED SHIRT': 'SHIRTS',
  'SIDE ADJUSTER': 'TROUSERS',
  BELTED: 'TROUSERS',
}

/** PROFIT-sheet item names -> product types they can refer to. */
export const TYPES_BY_PROFIT_ITEM: Record<string, string[]> = {
  'GYM SHORTS': ['Gym Shorts'],
  'GYM VEST': ['Gym Vest'],
  'R TSHIRTS': ['Round Neck T-Shirt'],
  'O TSHIRT': ['Oversized T-Shirt'],
  'L TSHIRT': ['Long Sleeve T-Shirt'],
  'C SHIRT': ['Collarless Shirt'],
  'O SHIRTS': ['Official Shirt', 'Oversized T-Shirt'],
  TROUSERS: ['Side Adjuster Trousers', 'Belted Trousers'],
}

/** Sheet colours that mean a different (or one of several) site colours. */
export const COLOR_ALIASES: Record<string, string[]> = {
  STRIPPED: ['Striped'],
  BLUE: ['Blue', 'Navy Blue'],
  // Older black batch; its sizes are written as the true size.
  'BLACK L': ['Black'],
}

/** Colour to write in the sheet for site products whose name differs from the sheet's. */
export const SHEET_COLOR_BY_PRODUCT: Record<string, string> = {
  'navy blue long sleeve t-shirt': 'BLUE',
  'striped short sleeved shirt': 'STRIPPED',
}

/** Products in the sheet that aren't on the site yet: skipped and reported. */
export const SKIP_PRODUCTS = new Set(['navy blue round neck t-shirt'])

export const REASON_BY_SHEET_TYPE: Record<string, { reason: StockMovementReason; note?: string }> = {
  SALE: { reason: 'MANUAL_SALE' },
  'ONLINE SALE': { reason: 'ONLINE_SALE' },
  INFLUENCER: { reason: 'INFLUENCER' },
  REWARD: { reason: 'REWARD' },
  EMPLOYEE: { reason: 'REWARD', note: 'Employee' },
  DAMAGE: { reason: 'DAMAGE' },
}

export const SHEET_TYPE_BY_REASON: Partial<Record<StockMovementReason, string>> = {
  MANUAL_SALE: 'SALE',
  ONLINE_SALE: 'ONLINE SALE',
  INFLUENCER: 'INFLUENCER',
  REWARD: 'REWARD',
  DAMAGE: 'DAMAGE',
}

export const REVIEW = 'Needs review:'
export const TZ = 'Africa/Nairobi'

// ---------------------------------------------------------------- helpers

export const str = (v: unknown) => (v == null ? '' : String(v).trim())
export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
export const normSize = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/^XXL$/, '2XL')
export const normName = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
export const num = (v: unknown) => {
  const n = Number(v)
  return v !== null && v !== '' && typeof v !== 'boolean' && Number.isFinite(n) ? Math.round(n) : null
}
export const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })

/** Sheet dates arrive as YYYY-MM-DD; they are stored at 09:00 Nairobi time. */
export function parseSheetDate(v: unknown, fallback?: Date): Date {
  const s = str(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T09:00:00+03:00`)
  if (fallback) return fallback
  throw new Error(`Bad date: "${s}"`)
}

/** Splits a site product name into the sheet's CATEGORY and COLOR. */
export function sheetProduct(productName: string): { item: string; category: string; color: string } | null {
  for (const [category, type] of Object.entries(TYPE_BY_CATEGORY)) {
    if (!productName.endsWith(type)) continue
    const color = SHEET_COLOR_BY_PRODUCT[productName.toLowerCase()] ?? productName.slice(0, -type.length).trim().toUpperCase()
    return { item: ITEM_BY_CATEGORY[category], category, color }
  }
  return null
}
