'use client'

import { useRef, useState, useTransition } from 'react'
import { updateCustomerAction } from '@/lib/actions/admin-customers'
import { CUSTOMER_SOURCES, OTHER_SOURCE } from '@/lib/customer-sources'

const inputClass = 'rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

export type EditableCustomer = {
  id: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  gender: string | null
  location: string | null
  source: string
  notes: string | null
}

export function CustomerEditButton({ customer }: { customer: EditableCustomer }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const knownSource = (CUSTOMER_SOURCES as readonly string[]).includes(customer.source)
  // "Website" and "Manual" are set by the system; anything else not in the list was typed under "Other".
  const isSystemSource = customer.source === 'Website' || customer.source === 'Manual'
  const initialSource = knownSource ? customer.source : isSystemSource ? '' : OTHER_SOURCE
  const [source, setSource] = useState(initialSource)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function open() {
    setSource(initialSource)
    setError(null)
    dialogRef.current?.showModal()
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    formData.set('customerId', customer.id)
    // Keep a system source (Website/Manual) when the dropdown is left blank.
    if (!source && isSystemSource) formData.set('source', customer.source)
    startTransition(async () => {
      const result = await updateCustomerAction(formData)
      if (result.success) {
        dialogRef.current?.close()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <button type="button" onClick={open} className="text-xs opacity-60 hover:opacity-100">
        Edit
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-lg rounded-lg border border-black/10 bg-background p-0 text-foreground backdrop:bg-black/40 dark:border-white/10"
      >
        <form action={handleSubmit} className="p-5 text-left">
          <h2 className="mb-4 text-sm font-medium tracking-wide uppercase opacity-70">Edit Customer</h2>
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="firstName" required defaultValue={customer.firstName} placeholder="First name" aria-label="First name" className={inputClass} />
            <input name="lastName" defaultValue={customer.lastName ?? ''} placeholder="Last name" aria-label="Last name" className={inputClass} />
            <input name="phone" type="tel" defaultValue={customer.phone ?? ''} placeholder="Phone" aria-label="Phone" className={inputClass} />
            <input name="email" type="email" defaultValue={customer.email ?? ''} placeholder="Email" aria-label="Email" className={inputClass} />
            <select name="gender" defaultValue={customer.gender ?? ''} aria-label="Gender" className={inputClass}>
              <option value="">Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            <input name="location" defaultValue={customer.location ?? ''} placeholder="Location" aria-label="Location" className={inputClass} />
            <select
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-label="Source"
              className={inputClass}
            >
              <option value="">{isSystemSource ? customer.source : 'Source'}</option>
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
                defaultValue={knownSource || isSystemSource ? '' : customer.source}
                placeholder="Specify source (e.g. Walk-in)"
                aria-label="Other source"
                className={inputClass}
              />
            )}
            <textarea
              name="notes"
              rows={3}
              defaultValue={customer.notes ?? ''}
              placeholder="Notes"
              aria-label="Notes"
              className={`sm:col-span-2 ${inputClass}`}
            />
          </div>
          <p className="mt-3 text-xs opacity-60">
            Order values and stock can&apos;t be changed here — edit them under Inventory → Stock Out. Manual sales are
            linked to customers by name, so renaming a customer can unlink their past sales.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full border border-black/10 px-4 py-2 text-sm dark:border-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
