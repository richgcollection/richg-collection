'use client'

import { useActionState } from 'react'
import { placeOrderAction } from '@/lib/actions/checkout'

export function CheckoutForm({ counties }: { counties: string[] }) {
  const [state, formAction, isPending] = useActionState(placeOrderAction, undefined)

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

      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Address" name="line1" autoComplete="address-line1" required />
      <Field label="Apartment, suite, etc. (optional)" name="line2" autoComplete="address-line2" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Town / City" name="city" autoComplete="address-level2" required />
        <div>
          <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            County
          </label>
          <select
            name="county"
            required
            defaultValue=""
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          >
            <option value="" disabled>
              Select county
            </option>
            {counties.map((county) => (
              <option key={county} value={county}>
                {county}
              </option>
            ))}
            <option value="Other">Other</option>
          </select>
        </div>
        <Field label="Postal Code (optional)" name="postalCode" autoComplete="postal-code" />
      </div>

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
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  required?: boolean
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
        className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
      />
    </div>
  )
}
