/*
 * Shared by the analytics server page and its client charts. Lives outside
 * the 'use client' modules because a server component only sees client
 * references (not values) for plain objects exported from those.
 */

export const VIZ = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
  'var(--viz-6)',
  'var(--viz-7)',
  'var(--viz-8)',
]

export type VelocityClass = 'fast' | 'steady' | 'slow' | 'dead' | 'stockout'

export const CLASS_META: Record<VelocityClass, { label: string; icon: string; color: string; hint: string }> = {
  fast: { label: 'Fast', icon: '▲▲', color: 'var(--viz-good)', hint: 'Stock lasts ≤ 30 days at current pace' },
  steady: { label: 'Steady', icon: '▲', color: 'var(--viz-1)', hint: 'Stock lasts 1–3 months' },
  slow: { label: 'Slow', icon: '▼', color: 'var(--viz-warn)', hint: 'Stock lasts more than 3 months' },
  dead: { label: 'Not moving', icon: '■', color: 'var(--viz-muted)', hint: 'No sales in this period' },
  stockout: { label: 'Sold out', icon: '●', color: 'var(--viz-bad)', hint: 'Selling, but no stock left' },
}
