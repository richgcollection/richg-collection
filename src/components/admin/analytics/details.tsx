import Link from 'next/link'
import type { ReactNode } from 'react'

/*
 * Building blocks for the drill-down panels on the analytics page. Plain
 * server components: the panels are rendered on the server and handed to the
 * client tiles/cards as children.
 */

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-x-6 gap-y-5">{children}</div>
}

export function DetailSection({ title, note, children, wide = false }: { title: string; note?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`min-w-0 ${wide ? 'col-span-full' : ''}`}>
      <h3 className="text-xs font-semibold tracking-wide text-[var(--viz-ink-2)] uppercase">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-[var(--viz-muted)]">{note}</p>}
      <div className="mt-2 min-w-0">{children}</div>
    </section>
  )
}

/** A labelled figure that shrinks its type to fit its own width, so long amounts never clip. */
export function Fig({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="@container min-w-0">
      <dt className="text-xs break-words text-[var(--viz-ink-2)]">{label}</dt>
      <dd
        className="mt-0.5 text-[clamp(0.95rem,12cqi,1.25rem)] leading-tight font-semibold tabular-nums [overflow-wrap:anywhere]"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </dd>
      {sub && <dd className="mt-0.5 text-xs break-words text-[var(--viz-muted)]">{sub}</dd>}
    </div>
  )
}

export function FigGrid({ children }: { children: ReactNode }) {
  return <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-4">{children}</dl>
}

export type Col = { label: string; num?: boolean }

/**
 * Compact table. Text columns wrap; figure columns keep their digits together
 * and the table scrolls sideways inside its panel rather than clipping.
 */
export function MiniTable({ cols, rows, empty = 'Nothing to show for this period.' }: { cols: Col[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <p className="py-3 text-xs text-[var(--viz-muted)]">{empty}</p>
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/10 text-left text-[var(--viz-ink-2)] dark:border-white/10">
            {cols.map((c) => (
              <th key={c.label} scope="col" className={`py-1.5 pr-3 font-medium last:pr-0 ${c.num ? 'text-right whitespace-nowrap' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-black/5 align-top last:border-0 dark:border-white/5">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`py-1.5 pr-3 last:pr-0 ${cols[ci]?.num ? 'text-right whitespace-nowrap tabular-nums' : 'min-w-[7rem] [overflow-wrap:anywhere]'}`}
                >
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

export function ProductLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link href={`/admin/products/${id}/edit`} className="underline decoration-black/20 underline-offset-2 hover:decoration-current dark:decoration-white/25">
      {children}
    </Link>
  )
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-[var(--viz-muted)]">{children}</span>
}

/** Signed change with a colour that says whether it is good news. */
export function Change({ pct, upIsGood = true }: { pct: number | null; upIsGood?: boolean }) {
  if (pct === null || !Number.isFinite(pct)) return <Muted>—</Muted>
  const good = (pct >= 0) === upIsGood
  return (
    <span style={{ color: good ? 'var(--viz-good)' : 'var(--viz-bad)' }}>
      <span aria-hidden>{pct >= 0 ? '▲' : '▼'}</span> {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

/** Stacked share bar with a legend, for splits like online vs manual. */
export function ShareBar({ items, format }: { items: Array<{ name: string; value: number; color: string }>; format: (v: number) => string }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total <= 0) return <p className="text-xs text-[var(--viz-muted)]">Nothing recorded.</p>
  return (
    <div className="min-w-0">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--viz-seq-0)]" aria-hidden>
        {items.map((i) => (
          <span key={i.name} style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {items.map((i) => (
          <li key={i.name} className="flex min-w-0 items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color }} aria-hidden />
            <span className="text-[var(--viz-ink-2)]">{i.name}</span>
            <span className="font-medium tabular-nums">{format(i.value)}</span>
            <Muted>({((i.value / total) * 100).toFixed(0)}%)</Muted>
          </li>
        ))}
      </ul>
    </div>
  )
}
