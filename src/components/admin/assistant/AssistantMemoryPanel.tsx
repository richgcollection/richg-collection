'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { addAssistantMemoryAction, deleteAssistantMemoryAction } from '@/lib/actions/admin-assistant'

type Note = { id: string; content: string; createdBy: string | null; createdAt: string }

const field = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

export function AssistantMemoryPanel({ notes, max, maxLength }: { notes: Note[]; max: number; maxLength: number }) {
  const [state, formAction, saving] = useActionState(addAssistantMemoryAction, undefined)
  const [deleting, startDelete] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  function remove(id: string) {
    setDeleteError(null)
    startDelete(async () => {
      const r = await deleteAssistantMemoryAction(id)
      if (!r.success) setDeleteError(r.error)
    })
  }

  return (
    <section className="flex max-w-2xl flex-col gap-4 rounded-lg border border-black/10 p-6 dark:border-white/10">
      <div>
        <h2 className="text-base font-semibold">Memory</h2>
        <p className="text-xs opacity-60">
          Notes the assistant keeps between conversations, shared by all admins. It adds them when you say “remember…” or
          mention a lasting preference, and reads them at the start of every chat. {notes.length}/{max} used.
        </p>
      </div>

      {deleteError && (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">{deleteError}</p>
      )}

      {notes.length === 0 ? (
        <p className="text-sm opacity-60">Nothing remembered yet.</p>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
              <div>
                <p className="whitespace-pre-wrap">{n.content}</p>
                <p className="mt-0.5 text-xs opacity-50">
                  {new Date(n.createdAt).toLocaleDateString('en-KE', { dateStyle: 'medium', timeZone: 'Africa/Nairobi' })}
                  {n.createdBy ? ` · ${n.createdBy}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(n.id)}
                disabled={deleting}
                className="shrink-0 text-xs underline opacity-60 hover:opacity-100 disabled:opacity-30"
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        {state?.success === false && (
          <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        <div className="flex items-start gap-2">
          <textarea
            name="content"
            rows={2}
            maxLength={maxLength}
            required
            placeholder="Add a note, e.g. Our main loafer supplier is Mama Njeri in Eastleigh; she delivers on Thursdays."
            className={field}
          />
          <button
            type="submit"
            disabled={saving}
            className="shrink-0 rounded-full border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/15"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </section>
  )
}
