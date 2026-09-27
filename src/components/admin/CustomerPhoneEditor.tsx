'use client'

import { useState, useTransition } from 'react'
import { updateCustomerPhoneAction } from '@/lib/actions/admin-customers'

export function CustomerPhoneEditor({ customerId, phone }: { customerId: string; phone: string | null }) {
  const [draft, setDraft] = useState(phone ?? '')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    const formData = new FormData()
    formData.set('customerId', customerId)
    formData.set('phone', draft)
    startTransition(async () => {
      const result = await updateCustomerPhoneAction(formData)
      if (result.success) {
        // The page revalidates and passes the normalized number back in.
        setEditing(false)
        setError(null)
      } else {
        setError(result.error)
      }
    })
  }

  if (editing) {
    return (
      <div className="flex min-w-48 flex-col gap-2">
        <input
          type="tel"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="0712 345 678"
          autoFocus
          className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-full bg-foreground px-3 py-1 font-medium text-background disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(phone ?? '')
              setEditing(false)
              setError(null)
            }}
            className="rounded-full border border-black/10 px-3 py-1 dark:border-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (!phone) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-full border border-dashed border-black/20 px-3 py-0.5 text-xs opacity-80 hover:opacity-100 dark:border-white/20"
      >
        + Add phone
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="opacity-80">{phone}</span>
      <button type="button" onClick={() => setEditing(true)} className="text-xs underline opacity-60 hover:opacity-100">
        Edit
      </button>
    </div>
  )
}
