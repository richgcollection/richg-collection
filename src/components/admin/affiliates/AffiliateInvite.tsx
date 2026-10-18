'use client'

import { useState, useTransition } from 'react'
import { ReferralLink } from '@/components/affiliate/CopyButton'
import { resendAffiliateInviteAction } from '@/lib/actions/admin-affiliates'
import type { InviteDelivery } from '@/lib/affiliate-invites'

/** Shown right after a link is generated; the affiliate's page keeps showing it until it's claimed. */
export function InviteDeliveryNotice({ delivery }: { delivery: InviteDelivery }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
      {delivery.emailSent ? (
        <p className="text-emerald-700 dark:text-emerald-400">Invite emailed. The link expires in 7 days.</p>
      ) : (
        <p className="text-amber-700 dark:text-amber-400">{delivery.notice}</p>
      )}
      <p className="text-xs opacity-60">
        Invite link (works once). It also stays on the affiliate’s page until they use it, next to their permanent dashboard link:
      </p>
      <ReferralLink url={delivery.inviteUrl} />
    </div>
  )
}

export function ResendInviteButton({ affiliateId, label = 'Resend invite' }: { affiliateId: string; label?: string }) {
  const [isPending, startTransition] = useTransition()
  const [delivery, setDelivery] = useState<InviteDelivery | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (!confirm('Create a new invite link? Any earlier link stops working.')) return
    setError(null)
    startTransition(async () => {
      const result = await resendAffiliateInviteAction(affiliateId)
      if (result.success) {
        setDelivery({ inviteUrl: result.inviteUrl, emailSent: result.emailSent, notice: result.notice })
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
        >
          {isPending ? 'Creating…' : label}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {delivery && <InviteDeliveryNotice delivery={delivery} />}
    </div>
  )
}
