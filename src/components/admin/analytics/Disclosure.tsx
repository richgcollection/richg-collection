'use client'

import { useId, useState, type ReactNode } from 'react'

export function useDisclosure() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return { open, toggle: () => setOpen((o) => !o), id }
}

export function DetailsButton({
  open,
  controls,
  onClick,
  label = 'Details',
  subject,
}: {
  open: boolean
  controls: string
  onClick: () => void
  label?: string
  /** Read by screen readers after the label, e.g. "Revenue". */
  subject?: string
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--viz-1)] ${
        open
          ? 'border-foreground/40 bg-background font-medium'
          : 'border-black/10 text-[var(--viz-ink-2)] hover:border-foreground/40 hover:text-foreground dark:border-white/10'
      }`}
    >
      {open ? 'Hide' : label}
      {subject && <span className="sr-only"> for {subject}</span>}
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
        <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export function DetailsPanel({ id, open, label, children }: { id: string; open: boolean; label: string; children: ReactNode }) {
  return (
    <div id={id} hidden={!open} role="region" aria-label={label} className="mt-4 min-w-0 border-t border-black/10 pt-4 dark:border-white/10">
      {children}
    </div>
  )
}

/** A single line (e.g. an insight) that reveals supporting detail underneath. */
export function DisclosureRow({ summary, children, subject }: { summary: ReactNode; children?: ReactNode; subject: string }) {
  const { open, toggle, id } = useDisclosure()
  if (!children) return <div className="min-w-0">{summary}</div>
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{summary}</div>
        <DetailsButton open={open} controls={id} onClick={toggle} subject={subject} />
      </div>
      <div id={id} hidden={!open} role="region" aria-label={`${subject} details`} className="mt-2 mb-1 min-w-0 rounded-md bg-background p-3">
        {children}
      </div>
    </div>
  )
}
