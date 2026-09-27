'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { fmt, Sparkline } from './charts'
import { CLASS_META, type VelocityClass } from './tokens'

export type VelocityRow = {
  productId: string
  name: string
  category: string
  unitsSold: number
  revenueKes: number
  profitKes: number
  marginPct: number | null
  avgPriceKes: number | null
  listPriceKes: number
  unitsPerWeek: number
  stockQty: number
  daysOfCover: number | null
  sellThroughPct: number
  daysSinceLastSale: number | null
  trendPct: number | null
  spark: number[]
  velocityClass: VelocityClass
}

type SortKey = 'name' | 'unitsSold' | 'revenueKes' | 'profitKes' | 'marginPct' | 'unitsPerWeek' | 'stockQty' | 'daysOfCover' | 'sellThroughPct' | 'daysSinceLastSale' | 'trendPct'

const COLUMNS: Array<{ key: SortKey; label: string; title?: string }> = [
  { key: 'name', label: 'Product' },
  { key: 'unitsSold', label: 'Sold' },
  { key: 'unitsPerWeek', label: 'Per week', title: 'Average units sold per week' },
  { key: 'trendPct', label: 'Trend', title: 'Units sold in the second half of the period vs the first half' },
  { key: 'revenueKes', label: 'Revenue' },
  { key: 'profitKes', label: 'Profit' },
  { key: 'marginPct', label: 'Margin' },
  { key: 'stockQty', label: 'In stock' },
  { key: 'daysOfCover', label: 'Cover', title: 'Days of stock left at the current selling pace' },
  { key: 'sellThroughPct', label: 'Sell-through', title: 'Sold ÷ (sold + still in stock)' },
  { key: 'daysSinceLastSale', label: 'Last sale' },
]

export function VelocityTable({ rows }: { rows: VelocityRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'revenueKes', dir: -1 })
  const [filter, setFilter] = useState<VelocityRow['velocityClass'] | 'all'>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of rows) c[r.velocityClass] = (c[r.velocityClass] ?? 0) + 1
    return c
  }, [rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => (filter === 'all' || r.velocityClass === filter) && (!q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)))
      .sort((a, b) => {
        const av = a[sort.key]
        const bv = b[sort.key]
        if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sort.dir
        // Nulls (no sales / no cover) always sink to the bottom.
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return ((av as number) - (bv as number)) * sort.dir
      })
  }, [rows, sort, filter, query])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All ({rows.length})
        </FilterChip>
        {(Object.keys(CLASS_META) as Array<VelocityRow['velocityClass']>).map((k) =>
          counts[k] ? (
            <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)} title={CLASS_META[k].hint}>
              <span aria-hidden style={{ color: CLASS_META[k].color }}>
                {CLASS_META[k].icon}
              </span>{' '}
              {CLASS_META[k].label} ({counts[k]})
            </FilterChip>
          ) : null,
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="ml-auto w-full rounded-md border border-black/10 bg-background px-3 py-1.5 text-xs sm:w-56 dark:border-white/10"
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[960px] text-xs">
          <thead>
            <tr className="border-b border-black/10 text-left text-[var(--viz-ink-2)] dark:border-white/10">
              {COLUMNS.map((c, i) => (
                <th key={c.key} className={`py-2 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`} title={c.title}>
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : c.key === 'name' ? 1 : -1 }))}
                    className="hover:text-foreground"
                  >
                    {c.label}
                    {sort.key === c.key && <span aria-hidden>{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}
                  </button>
                </th>
              ))}
              <th className="py-2 pr-3 text-right font-medium">Status</th>
              <th className="py-2 text-right font-medium">Units over time</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const meta = CLASS_META[r.velocityClass]
              return (
                <tr key={r.productId} className="border-b border-black/5 hover:bg-background/60 dark:border-white/5">
                  <td className="max-w-56 py-2 pr-3">
                    <Link href={`/admin/products/${r.productId}/edit`} className="block truncate font-medium hover:opacity-70">
                      {r.name}
                    </Link>
                    <span className="text-[var(--viz-muted)]">{r.category}</span>
                  </td>
                  <Num>{fmt(r.unitsSold, 'units')}</Num>
                  <Num>{r.unitsPerWeek > 0 ? r.unitsPerWeek.toFixed(1) : '—'}</Num>
                  <Num>
                    {r.trendPct === null ? (
                      '—'
                    ) : (
                      <span style={{ color: r.trendPct >= 0 ? 'var(--viz-good)' : 'var(--viz-bad)' }}>
                        {r.trendPct >= 0 ? '▲' : '▼'} {Math.abs(r.trendPct).toFixed(0)}%
                      </span>
                    )}
                  </Num>
                  <Num>{fmt(r.revenueKes, 'kes', true)}</Num>
                  <Num>{fmt(r.profitKes, 'kes', true)}</Num>
                  <Num>{r.marginPct === null ? '—' : `${r.marginPct.toFixed(0)}%`}</Num>
                  <Num>{fmt(r.stockQty, 'units')}</Num>
                  <Num>{r.daysOfCover === null ? '—' : r.daysOfCover > 365 ? '1 yr +' : `${Math.round(r.daysOfCover)} d`}</Num>
                  <Num>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-10 rounded-full bg-[var(--viz-seq-0)]">
                        <span className="block h-1.5 rounded-full bg-[var(--viz-1)]" style={{ width: `${r.sellThroughPct}%` }} />
                      </span>
                      {r.sellThroughPct.toFixed(0)}%
                    </span>
                  </Num>
                  <Num>{r.daysSinceLastSale === null ? 'never' : r.daysSinceLastSale === 0 ? 'today' : `${r.daysSinceLastSale} d ago`}</Num>
                  <td className="py-2 pr-3 text-right whitespace-nowrap" title={meta.hint}>
                    <span aria-hidden style={{ color: meta.color }}>
                      {meta.icon}
                    </span>{' '}
                    {meta.label}
                  </td>
                  <td className="py-2 text-right">
                    <span className="inline-block">
                      <Sparkline values={r.spark} width={88} height={24} />
                    </span>
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="py-8 text-center text-[var(--viz-muted)]">
                  No products match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Num({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{children}</td>
}

function FilterChip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-foreground' : 'border-black/10 dark:border-white/10'}`}
    >
      {children}
    </button>
  )
}
