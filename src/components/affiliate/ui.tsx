import type { AffiliateStatus } from '@prisma/client'
import type { CommissionDisplayStatus } from '@/lib/affiliates'

/** Shared table styling: numbers never truncate, the table scrolls sideways instead. */
export const tableWrapClass = 'overflow-x-auto rounded-lg border border-black/10 dark:border-white/10'
export const tableClass = 'w-full min-w-max text-sm'
export const thClass = 'whitespace-nowrap px-4 py-3 text-left font-normal opacity-60'
export const thNumClass = 'whitespace-nowrap px-4 py-3 text-right font-normal opacity-60'
export const tdClass = 'px-4 py-3 align-top'
export const tdNumClass = 'whitespace-nowrap px-4 py-3 text-right align-top tabular-nums'
export const rowClass = 'border-t border-black/5 dark:border-white/5'

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-xs font-medium tracking-wide uppercase opacity-60">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs opacity-60">{hint}</p>}
    </div>
  )
}

const COMMISSION_STATUS_CLASS: Record<CommissionDisplayStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  APPROVED: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  PAID: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  VOID: 'bg-black/5 text-black/50 line-through dark:bg-white/10 dark:text-white/50',
}

export function CommissionStatusBadge({ status }: { status: CommissionDisplayStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COMMISSION_STATUS_CLASS[status]}`}>
      {status}
    </span>
  )
}

const AFFILIATE_STATUS_CLASS: Record<AffiliateStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  SUSPENDED: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

export function AffiliateStatusBadge({ status }: { status: AffiliateStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${AFFILIATE_STATUS_CLASS[status]}`}>
      {status}
    </span>
  )
}

/** Owed amounts can go negative after a refund on an already-paid line; show that as a credit. */
export function owedLabel(owedKes: number, format: (n: number) => string): string {
  return owedKes < 0 ? `${format(-owedKes)} credit` : format(owedKes)
}
