'use client'

import { useActionState, useState } from 'react'
import { placeOrderAction } from '@/lib/actions/checkout'

export function CheckoutForm({ towns, prefillEmail }: { towns: string[]; prefillEmail?: string | null }) {
  const [state, formAction, isPending] = useActionState(placeOrderAction, undefined)
  const [town, setTown] = useState('')

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full Name" name="fullName" autoComplete="name" required />
        <Field label="Phone" name="phone" type="tel" autoComplete="tel" required />
      </div>

      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={prefillEmail ?? ''} />

      <div>
        <label htmlFor="town" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
          Delivery Town
        </label>
        <select
          id="town"
          name="town"
          required
          value={town}
          onChange={(e) => setTown(e.target.value)}
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        >
          <option value="" disabled>
            Select delivery town
          </option>
          {towns.map((town) => (
            <option key={town} value={town}>
              {town}
            </option>
          ))}
          <option value="Other">Other</option>
        </select>
      </div>

      {town === 'Other' && (
        <Field label="Your Town" name="otherTown" autoComplete="address-level2" required minLength={2} />
      )}

      <Field label="Delivery notes, e.g. estate or landmark (optional)" name="line2" autoComplete="address-line1" />

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 w-full rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? 'Placing Order…' : 'Place Order'}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  required,
  minLength,
  defaultValue,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  required?: boolean
  minLength?: number
  defaultValue?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
    </div>
  )
}
