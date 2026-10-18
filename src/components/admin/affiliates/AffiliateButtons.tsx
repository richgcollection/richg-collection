'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  deleteAffiliateAction,
  deleteAffiliatePayoutAction,
  setAffiliateActiveAction,
  setCommissionVoidAction,
} from '@/lib/actions/admin-affiliates'
import { formatMonth } from '@/lib/affiliate-terms'

const smallButtonClass = 'whitespace-nowrap text-xs underline underline-offset-4 opacity-70 hover:opacity-100 disabled:opacity-40'

export function CommissionVoidButton({ commissionId, isVoid, canRestore }: { commissionId: string; isVoid: boolean; canRestore: boolean }) {
  const [isPending, startTransition] = useTransition()

  if (isVoid && !canRestore) return null

  function handleClick() {
    if (!isVoid && !confirm('Void this commission? It will no longer count toward what is owed.')) return
    startTransition(async () => {
      const result = await setCommissionVoidAction({ commissionId, void: !isVoid })
      if (!result.success) alert(result.error)
    })
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={smallButtonClass}>
      {isVoid ? 'Restore' : 'Void'}
    </button>
  )
}

export function PayoutDeleteButton({ payoutId }: { payoutId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('Delete this payout? Its commissions will show as unpaid again.')) return
    startTransition(async () => {
      const result = await deleteAffiliatePayoutAction(payoutId)
      if (!result.success) alert(result.error)
    })
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={`${smallButtonClass} text-red-600 dark:text-red-400`}>
      Delete
    </button>
  )
}

const outlineButtonClass =
  'rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10'

export function AffiliateActiveToggle({ affiliateId, isActive }: { affiliateId: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (isActive && !confirm('Deactivate this affiliate? Their links stop earning commission and their dashboard is locked. Their history is kept.')) {
      return
    }
    startTransition(async () => {
      const result = await setAffiliateActiveAction({ affiliateId, active: !isActive })
      if (!result.success) alert(result.error)
    })
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className={outlineButtonClass}>
      {isPending ? 'Saving…' : isActive ? 'Deactivate' : 'Activate'}
    </button>
  )
}

export function AffiliateDeleteButton({ affiliateId, name }: { affiliateId: string; name: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    const typed = prompt(
      `Delete ${name} permanently? This removes their account, commissions and payout records. Their orders stay but lose the affiliate link.\n\nType DELETE to confirm.`,
    )
    if (typed?.trim().toUpperCase() !== 'DELETE') return
    startTransition(async () => {
      const result = await deleteAffiliateAction(affiliateId)
      if (result.success) router.push('/admin/affiliates')
      else alert(result.error)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`${outlineButtonClass} border-red-600/30 text-red-600 hover:bg-red-600/10 dark:border-red-400/30 dark:text-red-400`}
    >
      {isPending ? 'Deleting…' : 'Delete affiliate'}
    </button>
  )
}

export function AffiliateMonthSelect({ months, value }: { months: string[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function handleChange(month: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', month)
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <label className={`flex items-center gap-2 text-sm ${isPending ? 'opacity-60' : ''}`}>
      <span className="opacity-70">Month</span>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border border-black/10 bg-background px-3 py-1.5 text-sm dark:border-white/10"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonth(m)}
          </option>
        ))}
      </select>
    </label>
  )
}
