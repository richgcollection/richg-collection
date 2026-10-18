'use client'

import { useActionState } from 'react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { affiliateLoginAction, affiliateSignupAction } from '@/lib/actions/affiliate-auth'

const labelClass = 'mb-1 block text-xs font-medium tracking-wide uppercase opacity-70'
const inputClass = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'
const buttonClass =
  'mt-2 w-full rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50'

function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}

export function AffiliateLoginForm() {
  const [state, formAction, isPending] = useActionState(affiliateLoginAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state?.error} />
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <PasswordInput id="password" name="password" required autoComplete="current-password" />
      </div>
      <button type="submit" disabled={isPending} className={buttonClass}>
        {isPending ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

export function AffiliateSignupForm({
  invite,
}: {
  invite?: { token: string; name: string; email: string; phone: string }
}) {
  const [state, formAction, isPending] = useActionState(affiliateSignupAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state?.error} />
      {invite && <input type="hidden" name="invite" value={invite.token} />}
      <div>
        <label htmlFor="name" className={labelClass}>
          Full name
        </label>
        <input id="name" name="name" required autoComplete="name" defaultValue={invite?.name} className={inputClass} />
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={invite?.email}
          readOnly={Boolean(invite)}
          className={`${inputClass} read-only:opacity-60`}
        />
      </div>
      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          defaultValue={invite?.phone}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <PasswordInput id="password" name="password" required autoComplete="new-password" placeholder="At least 8 characters" />
      </div>
      <button type="submit" disabled={isPending} className={buttonClass}>
        {isPending ? 'Creating account…' : invite ? 'Activate Account' : 'Create Account'}
      </button>
    </form>
  )
}
