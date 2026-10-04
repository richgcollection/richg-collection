'use client'

import { useState, useTransition } from 'react'
import { updateStockMovementDiscountAction } from '@/lib/actions/admin-inventory'

export function MovementDiscountEditor({
  movementId,
  discountKes,
}: {
  movementId: string
  discountKes: number | null
}) {
  const [saved, setSaved] = useState(discountKes ?? 0)
  const [draft, setDraft] = useState(saved ? String(saved) : '')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    const formData = new FormData()
    formData.set('movementId', movementId)
    formData.set('discountKes', draft)
    startTransition(async () => {
      const result = await updateStockMovementDiscountAction(formData)
      if (result.success) {
        setSaved(Number(draft) || 0)
        setEditing(false)
        setError(null)
      } else {
        setError(result.error)
      }
    })
  }

  if (editing) {
    return (
      <div className="flex min-w-36 flex-col gap-2">
        <input
          type="number"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="KES"
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
              setDraft(saved ? String(saved) : '')
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

  return (
    <div className="flex items-center gap-2">
      <span className="opacity-70">{saved ? `KES ${saved.toLocaleString('en-KE')}` : '—'}</span>
      <button type="button" onClick={() => setEditing(true)} className="text-xs underline opacity-60 hover:opacity-100">
        Edit
      </button>
    </div>
  )
}
