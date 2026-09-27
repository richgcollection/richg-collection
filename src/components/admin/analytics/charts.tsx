'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { VIZ } from './tokens'

/*
 * Small SVG chart kit for the admin analytics page. Props must stay
 * serializable (they come from a server component), so number formatting is
 * chosen with a `format` key rather than a callback.
 */

export type ValueFormat = 'kes' | 'num' | 'pct' | 'units'

const NUM = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 })
const NUM1 = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 })
const COMPACT = new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 })

export function fmt(value: number, format: ValueFormat, compact = false): string {
  switch (format) {
    case 'kes':
      return `KES ${compact ? COMPACT.format(value) : NUM.format(value)}`
    case 'pct':
      return `${NUM1.format(value)}%`
    case 'units':
      return `${compact ? COMPACT.format(value) : NUM.format(value)}`
    default:
      return compact ? COMPACT.format(value) : NUM1.format(value)
  }
}

const SEQ = ['var(--viz-seq-0)', 'var(--viz-seq-1)', 'var(--viz-seq-2)', 'var(--viz-seq-3)', 'var(--viz-seq-4)']
const GAP = 'var(--surface)'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    setWidth(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * exp
}

function ticks(min: number, max: number, count = 4): number[] {
  const out: number[] = []
  const step = (max - min) / count
  for (let i = 0; i <= count; i++) out.push(min + step * i)
  return out
}

/** Path for a bar with 4px rounded corners on its data end only (square at the baseline). */
function barPath(x: number, y: number, w: number, h: number, end: 'top' | 'bottom' | 'right' | 'none', r = 4): string {
  if (h <= 0 || w <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  if (end === 'top')
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
  if (end === 'bottom')
    return `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`
  if (end === 'right')
    return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`
  return `M${x},${y}h${w}v${h}h${-w}Z`
}

// ---------------------------------------------------------------- tooltip

type TipState = { x: number; y: number; content: ReactNode } | null

function Tooltip({ tip, width }: { tip: TipState; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 200))
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-36 rounded-md border border-black/10 bg-background px-3 py-2 text-xs shadow-lg dark:border-white/10"
      style={{ left, top: Math.max(0, tip.y - 8), transform: 'translateY(-100%)' }}
    >
      {tip.content}
    </div>
  )
}

function TipRow({ color, label, value, line = true }: { color?: string; label: string; value: string; line?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2 text-[var(--viz-ink-2)]">
        {color &&
          (line ? (
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          ))}
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------- card + legend + table view

export type TableData = { columns: string[]; rows: Array<Array<string | number>> }

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className = '',
  action,
}: {
  title: string
  subtitle?: string
  legend?: Array<{ label: string; color: string; shape?: 'line' | 'box' }>
  table?: TableData
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <section className={`min-w-0 rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--viz-ink-2)]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <div className="flex rounded-md border border-black/10 text-xs dark:border-white/10" role="group" aria-label="View">
              {(['chart', 'table'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 capitalize ${view === v ? 'bg-background font-medium' : 'opacity-60 hover:opacity-100'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {legend && legend.length > 1 && view === 'chart' && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--viz-ink-2)]">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              {l.shape === 'line' ? (
                <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: l.color }} />
              ) : (
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              )}
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        {view === 'chart' || !table ? children : <DataTable table={table} />}
      </div>
    </section>
  )
}

function DataTable({ table }: { table: TableData }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-black/10 text-left text-[var(--viz-ink-2)] dark:border-white/10">
            {table.columns.map((c, i) => (
              <th key={c} className={`py-1.5 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-black/5 dark:border-white/5">
              {row.map((cell, ci) => (
                <td key={ci} className={`py-1.5 pr-3 ${ci > 0 ? 'text-right tabular-nums' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- line / area

export type Series = { key: string; label: string; color: string; values: number[] }

export function LineChart({
  labels,
  series,
  format,
  height = 220,
  area = false,
  stackedArea = false,
}: {
  labels: string[]
  series: Series[]
  format: ValueFormat
  height?: number
  area?: boolean
  stackedArea?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = labels.length
  const m = { l: 64, r: 16, t: 12, b: 28 }
  const pw = Math.max(0, width - m.l - m.r)
  const ph = height - m.t - m.b

  const stacked = useMemo(() => {
    if (!stackedArea) return series.map((s) => s.values)
    const acc = new Array(n).fill(0)
    return series.map((s) => s.values.map((v, i) => (acc[i] += v)))
  }, [series, stackedArea, n])

  const rawMin = Math.min(0, ...stacked.flat())
  const rawMax = Math.max(0, ...stacked.flat())
  const yMax = niceMax(rawMax)
  const yMin = rawMin < 0 ? -niceMax(-rawMin) : 0
  const x = (i: number) => m.l + (n <= 1 ? pw / 2 : (i * pw) / (n - 1))
  const y = (v: number) => m.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph

  const onMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const px = e.clientX - rect.left
      const i = n <= 1 ? 0 : Math.round((px / rect.width) * (n - 1))
      setHover(Math.max(0, Math.min(n - 1, i)))
    },
    [n],
  )

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 70))))

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(', ')}>
          {ticks(yMin, yMax).map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} />
              <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--viz-muted)] text-[10px] tabular-nums">
                {fmt(t, format, true)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-[var(--viz-muted)] text-[10px]">
                {l}
              </text>
            ) : null,
          )}
          {series.map((s, si) => {
            const vals = stacked[si]
            const base = stackedArea && si > 0 ? stacked[si - 1] : null
            const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join('')
            const areaPath =
              area || stackedArea
                ? `${line}L${x(n - 1)},${base ? y(base[n - 1]) : y(Math.max(0, yMin))}` +
                  (base
                    ? base
                        .map((_, j) => {
                          const i = n - 1 - j
                          return `L${x(i)},${y(base[i])}`
                        })
                        .join('')
                    : `L${x(0)},${y(Math.max(0, yMin))}`) +
                  'Z'
                : null
            return (
              <g key={s.key}>
                {areaPath && <path d={areaPath} fill={s.color} opacity={stackedArea ? 0.22 : 0.1} />}
                <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {n === 1 && <circle cx={x(0)} cy={y(vals[0])} r={4} fill={s.color} />}
              </g>
            )
          })}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ph} stroke="var(--viz-axis)" strokeWidth={1} />
              {series.map((s, si) => (
                <circle key={s.key} cx={x(hover)} cy={y(stacked[si][hover])} r={4} fill={s.color} stroke={GAP} strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={m.l - 8}
            y={m.t}
            width={pw + 16}
            height={ph}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      <Tooltip
        width={width}
        tip={
          hover === null
            ? null
            : {
                x: x(hover),
                y: m.t + 8,
                content: (
                  <>
                    <div className="mb-1 font-medium">{labels[hover]}</div>
                    {series.map((s) => (
                      <TipRow key={s.key} color={s.color} label={s.label} value={fmt(s.values[hover], format)} />
                    ))}
                  </>
                ),
              }
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------- columns (stacked, diverging-capable)

export function ColumnChart({
  labels,
  series,
  format,
  height = 220,
  showTotals = false,
}: {
  labels: string[]
  series: Series[]
  format: ValueFormat
  height?: number
  showTotals?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = labels.length
  const m = { l: 64, r: 12, t: showTotals ? 22 : 12, b: 28 }
  const pw = Math.max(0, width - m.l - m.r)
  const ph = height - m.t - m.b

  const pos = labels.map((_, i) => series.reduce((s, se) => s + Math.max(0, se.values[i]), 0))
  const neg = labels.map((_, i) => series.reduce((s, se) => s + Math.min(0, se.values[i]), 0))
  const yMax = niceMax(Math.max(0, ...pos))
  const minNeg = Math.min(0, ...neg)
  const yMin = minNeg < 0 ? -niceMax(-minNeg) : 0
  const y = (v: number) => m.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph
  const band = n > 0 ? pw / n : 0
  const bw = Math.max(2, Math.min(24, band * 0.7))
  const bx = (i: number) => m.l + band * i + (band - bw) / 2
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 56))))
  const peak = pos.indexOf(Math.max(...pos))

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(', ')}>
          {ticks(yMin, yMax, yMin < 0 ? 4 : 4).map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={Math.abs(t) < 1e-9 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} />
              <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--viz-muted)] text-[10px] tabular-nums">
                {fmt(t, format, true)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            let up = 0
            let down = 0
            const posSegs = series.map((s, si) => ({ s, si, v: s.values[i] })).filter((d) => d.v > 0)
            const negSegs = series.map((s, si) => ({ s, si, v: s.values[i] })).filter((d) => d.v < 0)
            const dim = hover !== null && hover !== i
            return (
              <g key={i} opacity={dim ? 0.55 : 1}>
                {posSegs.map((d, k) => {
                  const y0 = y(up)
                  up += d.v
                  const y1 = y(up)
                  const gap = k < posSegs.length - 1 ? 2 : 0
                  return (
                    <path
                      key={d.s.key}
                      d={barPath(bx(i), y1 + gap, bw, y0 - y1 - gap, k === posSegs.length - 1 ? 'top' : 'none')}
                      fill={d.s.color}
                    />
                  )
                })}
                {negSegs.map((d, k) => {
                  const y0 = y(down)
                  down += d.v
                  const y1 = y(down)
                  const gap = k < negSegs.length - 1 ? 2 : 0
                  return (
                    <path
                      key={d.s.key}
                      d={barPath(bx(i), y0, bw, y1 - y0 - gap, k === negSegs.length - 1 ? 'bottom' : 'none')}
                      fill={d.s.color}
                    />
                  )
                })}
                {showTotals && i === peak && pos[i] > 0 && (
                  <text x={bx(i) + bw / 2} y={y(pos[i]) - 6} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
                    {fmt(pos[i], format, true)}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text x={bx(i) + bw / 2} y={height - 8} textAnchor="middle" className="fill-[var(--viz-muted)] text-[10px]">
                    {l}
                  </text>
                )}
                <rect
                  x={m.l + band * i}
                  y={m.t}
                  width={band}
                  height={ph}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${l}: ${series.map((s) => `${s.label} ${fmt(s.values[i], format)}`).join(', ')}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            )
          })}
        </svg>
      )}
      <Tooltip
        width={width}
        tip={
          hover === null
            ? null
            : {
                x: bx(hover) + bw / 2,
                y: y(pos[hover]),
                content: (
                  <>
                    <div className="mb-1 font-medium">{labels[hover]}</div>
                    {series.map((s) => (
                      <TipRow key={s.key} color={s.color} label={s.label} value={fmt(s.values[hover], format)} line={false} />
                    ))}
                  </>
                ),
              }
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------- horizontal bars (ranking)

export function HBarChart({
  items,
  format,
  secondaryFormat,
  secondaryLabel,
  color = 'var(--viz-1)',
  emptyText = 'No data in this period.',
}: {
  items: Array<{ name: string; value: number; secondary?: number }>
  format: ValueFormat
  secondaryFormat?: ValueFormat
  secondaryLabel?: string
  color?: string
  emptyText?: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  const [hover, setHover] = useState<number | null>(null)
  if (items.length === 0) return <Empty text={emptyText} />
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li
          key={it.name + i}
          className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-xs sm:grid-cols-[minmax(0,12rem)_1fr]"
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
          title={
            secondaryFormat && it.secondary !== undefined
              ? `${it.name}: ${fmt(it.value, format)} · ${fmt(it.secondary, secondaryFormat)} ${secondaryLabel ?? ''}`
              : `${it.name}: ${fmt(it.value, format)}`
          }
        >
          <span className="truncate text-[var(--viz-ink-2)]">{it.name}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-3.5 rounded-r transition-opacity"
              style={{
                width: `${Math.max(0.5, (it.value / max) * 78)}%`,
                background: color,
                opacity: hover === null || hover === i ? 1 : 0.55,
              }}
            />
            <span className="shrink-0 font-medium tabular-nums">
              {fmt(it.value, format, true)}
              {secondaryFormat && it.secondary !== undefined && (
                <span className="ml-1.5 font-normal text-[var(--viz-muted)]">
                  {fmt(it.secondary, secondaryFormat, true)}
                  {secondaryLabel ? ` ${secondaryLabel}` : ''}
                </span>
              )}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- donut

export function DonutChart({
  items,
  format,
  centerLabel,
  colors,
  size = 168,
}: {
  items: Array<{ name: string; value: number }>
  format: ValueFormat
  centerLabel: string
  colors?: string[]
  size?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) return <Empty text="No data in this period." />
  const r = size / 2
  const inner = r * 0.64
  const gapAngle = items.filter((i) => i.value > 0).length > 1 ? 2 / r : 0
  const starts = [-Math.PI / 2]
  for (let i = 1; i < items.length; i++) starts.push(starts[i - 1] + (items[i - 1].value / total) * Math.PI * 2)
  const arcs = items.map((it, i) => {
    const a0 = starts[i]
    const sweep = (it.value / total) * Math.PI * 2
    const start = a0 + gapAngle / 2
    const end = a0 + sweep - gapAngle / 2
    if (it.value <= 0 || end <= start) return { d: '', i }
    const large = end - start > Math.PI ? 1 : 0
    const p = (rad: number, a: number) => `${r + rad * Math.cos(a)},${r + rad * Math.sin(a)}`
    const full = sweep >= Math.PI * 2 - 1e-6
    const d = full
      ? `M${r},0A${r},${r} 0 1 1 ${r},${2 * r}A${r},${r} 0 1 1 ${r},0ZM${r},${r - inner}A${inner},${inner} 0 1 0 ${r},${r + inner}A${inner},${inner} 0 1 0 ${r},${r - inner}Z`
      : `M${p(r, start)}A${r},${r} 0 ${large} 1 ${p(r, end)}L${p(inner, end)}A${inner},${inner} 0 ${large} 0 ${p(inner, start)}Z`
    return { d, i }
  })
  const palette = colors ?? VIZ
  const focus = hover !== null ? items[hover] : null

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} role="img" aria-label={centerLabel} className="shrink-0">
        {arcs.map(({ d, i }) =>
          d ? (
            <path
              key={i}
              d={d}
              fillRule="evenodd"
              fill={palette[i % palette.length]}
              opacity={hover === null || hover === i ? 1 : 0.45}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          ) : null,
        )}
        <text x={r} y={r - 4} textAnchor="middle" className="fill-foreground text-base font-semibold">
          {focus ? fmt(focus.value, format, true) : fmt(total, format, true)}
        </text>
        <text x={r} y={r + 14} textAnchor="middle" className="fill-[var(--viz-muted)] text-[10px]">
          {focus ? `${((focus.value / total) * 100).toFixed(0)}% · ${focus.name}`.slice(0, 26) : centerLabel}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {items.map((it, i) => (
          <li
            key={it.name}
            className={`flex items-center justify-between gap-3 ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="flex min-w-0 items-center gap-2 text-[var(--viz-ink-2)]">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: palette[i % palette.length] }} />
              <span className="truncate">{it.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium">{fmt(it.value, format, true)}</span>
              <span className="ml-1.5 text-[var(--viz-muted)]">{((it.value / total) * 100).toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- calendar heatmap

export function CalendarHeatmap({ days, format }: { days: Array<{ date: string; units: number; revenueKes: number }>; format: ValueFormat }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TipState>(null)
  if (days.length === 0) return <Empty text="No data in this period." />
  const firstDow = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7
  const weeks = Math.ceil((firstDow + days.length) / 7)
  const labelW = 28
  const cell = Math.max(8, Math.min(18, Math.floor((width - labelW) / Math.max(1, weeks)) - 2))
  const step = cell + 2
  const values = days.map((d) => d.units).filter((v) => v > 0).sort((a, b) => a - b)
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 0
  const cuts = [q(0.25), q(0.5), q(0.75)]
  const level = (v: number) => (v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4)
  const height = step * 7 + 18

  return (
    <div ref={ref} className="relative w-full overflow-x-auto">
      {width > 0 && (
        <svg width={Math.max(width, labelW + weeks * step)} height={height} role="img" aria-label="Daily units sold">
          {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => (
            <text key={i} x={0} y={16 + i * step + cell / 2} dy="0.32em" className="fill-[var(--viz-muted)] text-[9px]">
              {d}
            </text>
          ))}
          {days.map((d, idx) => {
            const pos = firstDow + idx
            const col = Math.floor(pos / 7)
            const row = pos % 7
            const dt = new Date(`${d.date}T00:00:00Z`)
            const showMonth = dt.getUTCDate() <= 7 && row === 0
            return (
              <g key={d.date}>
                {showMonth && (
                  <text x={labelW + col * step} y={9} className="fill-[var(--viz-muted)] text-[9px]">
                    {dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
                  </text>
                )}
                <rect
                  x={labelW + col * step}
                  y={16 + row * step}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={SEQ[level(d.units)]}
                  tabIndex={0}
                  aria-label={`${d.date}: ${d.units} units`}
                  className="outline-none hover:stroke-foreground focus:stroke-foreground"
                  strokeWidth={1}
                  onPointerEnter={() =>
                    setTip({
                      x: labelW + col * step,
                      y: 16 + row * step,
                      content: (
                        <>
                          <div className="mb-1 font-medium">
                            {dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                          </div>
                          <TipRow label="Units sold" value={fmt(d.units, 'units')} />
                          <TipRow label="Revenue" value={fmt(d.revenueKes, format)} />
                        </>
                      ),
                    })
                  }
                  onPointerLeave={() => setTip(null)}
                />
              </g>
            )
          })}
        </svg>
      )}
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-[var(--viz-muted)]">
        <span className="mr-1">Fewer units</span>
        {SEQ.map((c) => (
          <span key={c} className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
        ))}
        <span className="ml-1">More</span>
      </div>
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

// ---------------------------------------------------------------- scatter

export function ScatterChart({
  points,
  xLabel,
  yLabel,
  xFormat,
  yFormat,
  height = 280,
}: {
  points: Array<{ x: number; y: number; label: string; detail?: string }>
  xLabel: string
  yLabel: string
  xFormat: ValueFormat
  yFormat: ValueFormat
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const m = { l: 52, r: 16, t: 12, b: 36 }
  const pw = Math.max(0, width - m.l - m.r)
  const ph = height - m.t - m.b
  const xMax = niceMax(Math.max(0, ...points.map((p) => p.x)))
  const yMax = niceMax(Math.max(0, ...points.map((p) => p.y)))
  const sx = (v: number) => m.l + (v / xMax) * pw
  const sy = (v: number) => m.t + ph - (v / yMax) * ph
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 0
  }
  const mx = median(points.map((p) => p.x))
  const my = median(points.map((p) => p.y))
  if (points.length === 0) return <Empty text="No products." />

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${yLabel} vs ${xLabel}`}>
          {ticks(0, yMax).map((t) => (
            <g key={`y${t}`}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} />
              <text x={m.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-[var(--viz-muted)] text-[10px] tabular-nums">
                {fmt(t, yFormat, true)}
              </text>
            </g>
          ))}
          {ticks(0, xMax).map((t) => (
            <text key={`x${t}`} x={sx(t)} y={m.t + ph + 16} textAnchor="middle" className="fill-[var(--viz-muted)] text-[10px] tabular-nums">
              {fmt(t, xFormat, true)}
            </text>
          ))}
          <text x={m.l + pw / 2} y={height - 2} textAnchor="middle" className="fill-[var(--viz-ink-2)] text-[10px]">
            {xLabel} →
          </text>
          <text x={12} y={m.t + ph / 2} textAnchor="middle" transform={`rotate(-90 12 ${m.t + ph / 2})`} className="fill-[var(--viz-ink-2)] text-[10px]">
            {yLabel} →
          </text>
          <line x1={sx(mx)} x2={sx(mx)} y1={m.t} y2={m.t + ph} stroke="var(--viz-axis)" />
          <line x1={m.l} x2={width - m.r} y1={sy(my)} y2={sy(my)} stroke="var(--viz-axis)" />
          <text x={m.l + 6} y={m.t + 12} className="fill-[var(--viz-muted)] text-[10px]">
            Overstocked · slow
          </text>
          <text x={width - m.r - 6} y={m.t + 12} textAnchor="end" className="fill-[var(--viz-muted)] text-[10px]">
            Deep stock · fast
          </text>
          <text x={width - m.r - 6} y={m.t + ph - 6} textAnchor="end" className="fill-[var(--viz-muted)] text-[10px]">
            Restock risk
          </text>
          <text x={m.l + 6} y={m.t + ph - 6} className="fill-[var(--viz-muted)] text-[10px]">
            Low activity
          </text>
          {points.map((p, i) => (
            <g key={p.label + i}>
              <circle
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={hover === i ? 6 : 4.5}
                fill="var(--viz-1)"
                fillOpacity={hover === null || hover === i ? 0.9 : 0.35}
                stroke={GAP}
                strokeWidth={2}
              />
              <circle
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={12}
                fill="transparent"
                tabIndex={0}
                aria-label={`${p.label}: ${fmt(p.x, xFormat)} ${xLabel}, ${fmt(p.y, yFormat)} ${yLabel}`}
                className="outline-none"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
      )}
      <Tooltip
        width={width}
        tip={
          hover === null
            ? null
            : {
                x: sx(points[hover].x),
                y: sy(points[hover].y),
                content: (
                  <>
                    <div className="mb-1 font-medium">{points[hover].label}</div>
                    <TipRow label={xLabel} value={fmt(points[hover].x, xFormat)} />
                    <TipRow label={yLabel} value={fmt(points[hover].y, yFormat)} />
                    {points[hover].detail && <div className="mt-1 text-[var(--viz-muted)]">{points[hover].detail}</div>}
                  </>
                ),
              }
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------- sparkline + stat tile

export function Sparkline({ values, width = 96, height = 28, color = 'var(--viz-1)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length === 0) return null
  const max = Math.max(1, ...values)
  const x = (i: number) => (values.length <= 1 ? width / 2 : (i * (width - 4)) / (values.length - 1) + 2)
  const y = (v: number) => height - 3 - (v / max) * (height - 6)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join('')
  const last = values.length - 1
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <path d={`${d}L${x(last)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill={color} />
    </svg>
  )
}

export function StatTile({
  label,
  value,
  deltaPct,
  upIsGood = true,
  spark,
  hint,
  hero = false,
}: {
  label: string
  value: string
  deltaPct?: number | null
  upIsGood?: boolean
  spark?: number[]
  hint?: string
  hero?: boolean
}) {
  const hasDelta = deltaPct !== undefined && deltaPct !== null && Number.isFinite(deltaPct)
  const good = hasDelta && (deltaPct >= 0) === upIsGood
  return (
    <div className={`min-w-0 rounded-lg border border-black/10 bg-surface p-4 dark:border-white/10 ${hero ? 'sm:col-span-2' : ''}`}>
      <p className="text-xs text-[var(--viz-ink-2)]">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p className={`${hero ? 'text-4xl sm:text-5xl' : 'text-2xl'} truncate font-semibold tracking-tight`}>{value}</p>
        {spark && spark.length > 1 && <Sparkline values={spark} width={hero ? 160 : 84} height={hero ? 44 : 28} />}
      </div>
      <div className="mt-1.5 flex min-h-4 flex-wrap items-center gap-x-2 text-xs">
        {hasDelta && (
          <span className="font-medium" style={{ color: good ? 'var(--viz-good)' : 'var(--viz-bad)' }}>
            <span aria-hidden>{deltaPct >= 0 ? '▲' : '▼'}</span> {Math.abs(deltaPct).toFixed(1)}%
            <span className="sr-only">{good ? ' (improvement)' : ' (decline)'}</span>
          </span>
        )}
        {hasDelta && <span className="text-[var(--viz-muted)]">vs previous period</span>}
        {!hasDelta && hint && <span className="text-[var(--viz-muted)]">{hint}</span>}
      </div>
      {hasDelta && hint && <p className="mt-0.5 text-xs text-[var(--viz-muted)]">{hint}</p>}
    </div>
  )
}

export function Meter({ label, value, max, detail, tone = 'var(--viz-1)' }: { label: string; value: number; max: number; detail: string; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[var(--viz-ink-2)]">{label}</span>
        <span className="font-medium tabular-nums">{detail}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-[var(--viz-seq-0)]">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-xs text-[var(--viz-muted)]">{text}</p>
}
