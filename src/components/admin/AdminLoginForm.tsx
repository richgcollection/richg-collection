'use client'

import { useActionState } from 'react'
import { adminLoginAction } from '@/lib/actions/admin-auth'

export function AdminLoginForm() {
  const [state, formAction, isPending] = useActionState(adminLoginAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 w-full rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}
