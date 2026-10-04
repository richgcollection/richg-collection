'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const selectClass =
  'rounded-md border border-black/10 bg-background px-3 py-1.5 text-xs disabled:opacity-40 dark:border-white/10'

/**
 * Year and month dropdowns for the analytics page. Choosing a year replaces
 * the rolling range (30 days, 90 days…); "Rolling range" goes back to it.
 * The chosen month is kept when switching years, so the same month can be
 * compared across years.
 */
export function PeriodSelect({
  years,
  year,
  month,
  months,
}: {
  /** Years with stock records, newest first. */
  years: number[]
  year: number | null
  month: number | null
  /** 1–12, months of the selected year that have started. */
  months: number[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function go(next: { year: number | null; month: number | null }) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('range')
    params.delete('year')
    params.delete('month')
    if (next.year) {
      params.set('year', String(next.year))
      if (next.month) params.set('month', String(next.month))
    }
    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${isPending ? 'opacity-60' : ''}`}>
      <label className="flex items-center gap-1.5 text-xs">
        <span className="opacity-70">Year</span>
        <select
          value={year ?? ''}
          onChange={(e) => go({ year: e.target.value ? Number(e.target.value) : null, month })}
          className={selectClass}
        >
          <option value="">Rolling range</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        <span className="opacity-70">Month</span>
        <select
          value={month ?? ''}
          disabled={!year}
          title={year ? undefined : 'Choose a year first'}
          onChange={(e) => go({ year, month: e.target.value ? Number(e.target.value) : null })}
          className={selectClass}
        >
          <option value="">{year ? 'Whole year' : '—'}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {MONTHS[m - 1]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
