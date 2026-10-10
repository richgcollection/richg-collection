'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { deleteAffiliatePayoutAction, setCommissionVoidAction } from '@/lib/actions/admin-affiliates'
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
