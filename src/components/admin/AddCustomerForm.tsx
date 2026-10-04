'use client'

import { useRef, useState, useTransition } from 'react'
import { createCustomerAction } from '@/lib/actions/admin-customers'
import { ProductMultiSelect } from '@/components/admin/ProductMultiSelect'
import { CUSTOMER_SOURCES, OTHER_SOURCE } from '@/lib/customer-sources'

const inputClass = 'rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

export type CustomerProductOption = { id: string; name: string }

export function AddCustomerForm({ products }: { products: CustomerProductOption[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [productIds, setProductIds] = useState<string[]>([])
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [source, setSource] = useState('')
  const [isPending, startTransition] = useTransition()

  const productsById = new Map(products.map((p) => [p.id, p]))

  function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(false)
    formData.set(
      'products',
      JSON.stringify(productIds.map((productId) => ({ productId, quantity: quantities[productId] ?? '' }))),
    )
    startTransition(async () => {
      const result = await createCustomerAction(formData)
      if (result.success) {
        setSuccess(true)
        formRef.current?.reset()
        setProductIds([])
        setQuantities({})
        setSource('')
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
        <select
          name="source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Source"
          className={inputClass}
        >
          <option value="">Source</option>
          {CUSTOMER_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={OTHER_SOURCE}>Other…</option>
        </select>
        {source === OTHER_SOURCE && (
          <input
            name="sourceOther"
            required
            maxLength={60}
            autoFocus
            placeholder="Specify source (e.g. Walk-in)"
            aria-label="Other source"
            className={inputClass}
          />
        )}
        <div className="sm:col-span-2">
          <ProductMultiSelect
            options={products}
            selectedIds={productIds}
            onChange={setProductIds}
            placeholder="Products bought — search and select…"
          />
        </div>
        {productIds.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 sm:col-span-3 sm:grid-cols-3">
            {productIds.map((id) => (
              <li key={id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{productsById.get(id)?.name ?? 'Unknown product'}</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Qty"
                  aria-label={`Quantity of ${productsById.get(id)?.name ?? 'product'}`}
                  value={quantities[id] ?? ''}
                  onChange={(e) => setQuantities((q) => ({ ...q, [id]: e.target.value }))}
                  className={`w-20 ${inputClass}`}
                />
              </li>
            ))}
          </ul>
        )}
        <input name="notes" placeholder="Notes" className={`sm:col-span-3 ${inputClass}`} />
      </div>
      <p className="mt-3 text-xs opacity-60">
        Products here are for reference only and don&apos;t change stock. Record the sale, its price and any discount
        under Inventory → Record Stock Out — that is where order values come from.
      </p>
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
