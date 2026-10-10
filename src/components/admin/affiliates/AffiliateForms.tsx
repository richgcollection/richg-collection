'use client'

import { useActionState, useEffect, useRef } from 'react'
import type { AffiliateStatus, CommissionType } from '@prisma/client'
import {
  inviteAffiliateAction,
  markAffiliateMonthPaidAction,
  updateAffiliateAction,
} from '@/lib/actions/admin-affiliates'
import { todayInStoreTz } from '@/lib/dates'
import { CommissionFields, affiliateInputClass, affiliateLabelClass } from '@/components/admin/affiliates/CommissionFields'

const buttonClass =
  'rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'

function FormMessage({ state, successText }: { state: { error?: string; success?: boolean } | undefined; successText: string }) {
  if (state?.error) return <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
  if (state?.success) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{successText}</p>
  return null
}

export function InviteAffiliateForm() {
  const [state, formAction, isPending] = useActionState(inviteAffiliateAction, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/10"
    >
      <div>
        <p className="font-medium">Recruit an affiliate</p>
        <p className="text-sm opacity-60">
          They&apos;re active straight away. Ask them to sign up at /affiliate/signup with this email to set a password.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="flex min-w-0 flex-col gap-1">
          <span className={affiliateLabelClass}>Name</span>
          <input name="name" required className={affiliateInputClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={affiliateLabelClass}>Email</span>
          <input name="email" type="email" required className={affiliateInputClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={affiliateLabelClass}>Phone (optional)</span>
          <input name="phone" type="tel" className={affiliateInputClass} />
        </label>
        <CommissionFields />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isPending} className={buttonClass}>
          {isPending ? 'Saving…' : 'Invite affiliate'}
        </button>
        <FormMessage state={state} successText="Affiliate invited." />
      </div>
    </form>
  )
}

export function AffiliateProfileForm({
  affiliate,
}: {
  affiliate: {
    id: string
    name: string
    email: string
    phone: string | null
    status: AffiliateStatus
    referralCode: string
    commissionType: CommissionType
    commissionValue: number
  }
}) {
  const [state, formAction, isPending] = useActionState(updateAffiliateAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <input type="hidden" name="affiliateId" value={affiliate.id} />
      <p className="font-medium">Profile &amp; default commission</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className={affiliateLabelClass}>Name</span>
          <input name="name" required defaultValue={affiliate.name} className={affiliateInputClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={affiliateLabelClass}>Email</span>
          <input name="email" type="email" required defaultValue={affiliate.email} className={affiliateInputClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={affiliateLabelClass}>Phone</span>
          <input name="phone" type="tel" defaultValue={affiliate.phone ?? ''} className={affiliateInputClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={affiliateLabelClass}>Status</span>
          <select name="status" defaultValue={affiliate.status} className={affiliateInputClass}>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <span className={affiliateLabelClass}>Referral code</span>
          <input
            name="referralCode"
            required
            defaultValue={affiliate.referralCode}
            className={`${affiliateInputClass} font-mono uppercase`}
          />
          <span className="text-xs opacity-60">Changing it breaks links already shared with the old code.</span>
        </label>
        <CommissionFields defaultType={affiliate.commissionType} defaultValue={affiliate.commissionValue} />
      </div>
      <p className="text-xs opacity-60">
        New terms apply to future sales only; recorded commissions keep the rate they were earned at.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isPending} className={buttonClass}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <FormMessage state={state} successText="Saved." />
      </div>
    </form>
  )
}

export function MarkMonthPaidForm({ affiliateId, periodMonth }: { affiliateId: string; periodMonth: string }) {
  const [state, formAction, isPending] = useActionState(markAffiliateMonthPaidAction, undefined)

  if (state?.success) return <p className="text-xs text-emerald-700 dark:text-emerald-400">Payout recorded.</p>

  return (
    <details className="group min-w-56">
      <summary className="cursor-pointer list-none text-xs font-medium underline underline-offset-4">
        Mark month as paid
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="affiliateId" value={affiliateId} />
        <input type="hidden" name="periodMonth" value={periodMonth} />
        <input name="reference" placeholder="Reference (e.g. M-Pesa code)" maxLength={120} className={affiliateInputClass} />
        <input
          name="paidOn"
          type="date"
          defaultValue={todayInStoreTz()}
          max={todayInStoreTz()}
          aria-label="Paid on"
          className={affiliateInputClass}
        />
        <input name="note" placeholder="Note (optional)" maxLength={1000} className={affiliateInputClass} />
        <button type="submit" disabled={isPending} className={`${buttonClass} px-4 py-1.5 text-xs`}>
          {isPending ? 'Recording…' : 'Record payout of amount owed'}
        </button>
        {state?.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      </form>
    </details>
  )
}
