'use client'

import { useRef, useState, useTransition } from 'react'
import { createCustomerAction } from '@/lib/actions/admin-customers'

const inputClass = 'rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

export type CustomerProductOption = { id: string; name: string }

export function AddCustomerForm({ products }: { products: CustomerProductOption[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await createCustomerAction(formData)
      if (result.success) {
        setSuccess(true)
        formRef.current?.reset()
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="mb-4 text-sm font-medium tracking-wide uppercase opacity-70">Add Customer</h2>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input name="firstName" required placeholder="First name" className={inputClass} />
        <input name="lastName" placeholder="Last name" className={inputClass} />
        <input name="phone" placeholder="Phone" className={inputClass} />
        <input name="email" type="email" placeholder="Email" className={inputClass} />
        <select name="gender" defaultValue="" className={inputClass}>
          <option value="">Gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <input name="location" placeholder="Location" className={inputClass} />
        <input name="source" placeholder="Source (e.g. Facebook)" className={inputClass} />
        <select name="productId" defaultValue="" className={inputClass}>
          <option value="">Product bought…</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <input name="lastQuantity" type="number" min={0} placeholder="Quantity" className={inputClass} />
        <input name="lastOrderValueKes" type="number" min={0} placeholder="Order value (KES)" className={inputClass} />
        <input name="notes" placeholder="Notes" className={`sm:col-span-2 ${inputClass}`} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Add Customer'}
        </button>
        {success && <span className="text-sm text-emerald-600 dark:text-emerald-400">Customer added.</span>}
      </div>
    </form>
  )
}
