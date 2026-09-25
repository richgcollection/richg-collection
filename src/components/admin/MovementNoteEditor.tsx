'use client'

import { useState, useTransition } from 'react'
import { updateStockMovementNoteAction } from '@/lib/actions/admin-inventory'

// Mirrors NEEDS_REVIEW_PREFIX in lib/inventory (server-only, so not importable here).
const NEEDS_REVIEW_PREFIX = 'Needs review:'

export function MovementNoteEditor({ movementId, note }: { movementId: string; note: string | null }) {
  const [saved, setSaved] = useState(note ?? '')
  const [draft, setDraft] = useState(saved)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const needsReview = saved.startsWith(NEEDS_REVIEW_PREFIX)

  function save() {
    const formData = new FormData()
    formData.set('movementId', movementId)
    formData.set('note', draft)
    startTransition(async () => {
      const result = await updateStockMovementNoteAction(formData)
      if (result.success) {
        setSaved(draft.trim())
        setEditing(false)
        setError(null)
      } else {
        setError(result.error)
      }
    })
  }

  if (editing) {
    return (
      <div className="flex min-w-56 flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
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
              setDraft(saved)
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
    <div className="flex items-start gap-2">
      {needsReview && (
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Needs review
        </span>
      )}
      <span className="opacity-70">
        {(needsReview ? saved.slice(NEEDS_REVIEW_PREFIX.length).trim() : saved) || '—'}
      </span>
      <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs underline opacity-60 hover:opacity-100">
        Edit
      </button>
    </div>
  )
}
