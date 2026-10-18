import type { ReactNode } from 'react'
import type { Explanation } from './explanations'

/*
 * Building blocks for the "Details" panels on the analytics page. Plain
 * server components: the panels are rendered on the server and handed to the
 * client tiles/cards as children.
 */

/** The plain-language panel used by every widget except Open carts. Copy lives in explanations.ts. */
export function Explain({ e }: { e: Explanation }) {
  return (
    <dl className="max-w-prose min-w-0 space-y-3 text-sm leading-relaxed">
      <div>
        <dt className="text-xs font-semibold tracking-wide text-[var(--viz-ink-2)] uppercase">What this means</dt>
        <dd className="mt-0.5 break-words">{e.meaning}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold tracking-wide text-[var(--viz-ink-2)] uppercase">How it&rsquo;s calculated</dt>
        <dd className="mt-0.5 break-words text-[var(--viz-ink-2)]">{e.how}</dd>
      </div>
    </dl>
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

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-[var(--viz-muted)]">{children}</span>
}
