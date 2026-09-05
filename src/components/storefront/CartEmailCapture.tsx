'use client'

import { useState, useTransition } from 'react'
import { saveCartEmailAction } from '@/lib/actions/cart'

export function CartEmailCapture({ initialEmail }: { initialEmail: string | null }) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  function save() {
    if (email === (initialEmail ?? '')) return
    if (!email) {
      setStatus('idle')
      return
    }
    startTransition(async () => {
      const result = await saveCartEmailAction(email)
      setStatus(result.success ? 'saved' : 'error')
    })
  }

  return (
    <div className="mt-8 border-t border-black/10 pt-6 dark:border-white/10">
      <label htmlFor="cart-email" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
        Email (optional)
      </label>
      <input
        id="cart-email"
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setStatus('idle')
        }}
        onBlur={save}
        disabled={isPending}
        placeholder="you@example.com"
        className="w-full max-w-sm rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
      <p className="mt-1 text-xs opacity-60">
        {status === 'saved'
          ? "Saved. We'll email you if you don't finish checking out."
          : "We'll only use this to follow up if you don't finish checking out."}
      </p>
      {status === 'error' && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Enter a valid email address.</p>}
    </div>
  )
}
