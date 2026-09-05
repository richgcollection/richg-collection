'use client'

import { useActionState, useState } from 'react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { updatePaystackSettingsAction } from '@/lib/actions/admin-payment-settings'

export function PaymentSettingsForm({
  enabled: initialEnabled,
  publicKey: initialPublicKey,
  hasSecretKey,
}: {
  enabled: boolean
  publicKey: string
  hasSecretKey: boolean
}) {
  const [state, formAction, isPending] = useActionState(updatePaystackSettingsAction, undefined)
  const [enabled, setEnabled] = useState(initialEnabled)

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4 rounded-lg border border-black/10 p-6 dark:border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Paystack</h2>
          <p className="text-xs opacity-60">Card payments and Lipa na M-Pesa for Kenya.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>
      </div>

      {state?.success === false && (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.success === true && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Payment settings saved.</p>
      )}

      <div>
        <label htmlFor="publicKey" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
          Public Key
        </label>
        <input
          id="publicKey"
          name="publicKey"
          defaultValue={initialPublicKey}
          placeholder="pk_test_… or pk_live_…"
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>

      <div>
        <label htmlFor="secretKey" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
          Secret Key {hasSecretKey && <span className="normal-case opacity-60">(already set — leave blank to keep it)</span>}
        </label>
        <PasswordInput
          id="secretKey"
          name="secretKey"
          autoComplete="off"
          placeholder={hasSecretKey ? '•••••••••••••••• (unchanged)' : 'sk_test_… or sk_live_…'}
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 pr-10 text-sm dark:border-white/10"
        />
      </div>

      <p className="text-xs opacity-60">
        Find these in your{' '}
        <a
          href="https://dashboard.paystack.com/#/settings/developer"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Paystack dashboard
        </a>{' '}
        under Settings → API Keys &amp; Webhooks. After saving, also register this webhook URL there:{' '}
        <code className="rounded bg-surface px-1 py-0.5">{'{your-domain}'}/api/webhooks/paystack</code>
      </p>

      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
