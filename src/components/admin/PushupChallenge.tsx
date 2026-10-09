'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import {
  addPushupEntryAction,
  clearPushupEntriesAction,
  deletePushupEntryAction,
  updatePushupScoreAction,
} from '@/lib/actions/admin-pushup-challenge'
import {
  LEADERBOARD_SIZE,
  MAX_SCORE,
  MEDALS,
  PRIZES,
  ROUND_SECONDS,
  type PushupEntry as Entry,
} from '@/lib/pushup-challenge'

const inputClass =
  'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'
const labelClass = 'mb-1 block text-xs font-medium tracking-wide uppercase opacity-70'
const primaryButtonClass =
  'rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50'
const secondaryButtonClass =
  'rounded-full border border-black/10 px-5 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/10'

export function PushupChallenge({ entries }: { entries: Entry[] }) {
  return (
    <div className="flex flex-col gap-6">
      <Timer />

      <div className="grid gap-3 sm:grid-cols-3">
        {PRIZES.map((prize) => (
          <div key={prize.place} className="rounded-lg border border-black/10 p-4 text-center dark:border-white/10">
            <div className="text-2xl">{prize.medal}</div>
            <div className="mt-1 text-sm font-semibold tracking-wide uppercase">{prize.place}</div>
            <div className="text-sm opacity-60">{prize.amount} Prize</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <AddEntryForm total={entries.length} />
        <Leaderboard entries={entries} />
      </div>
    </div>
  )
}

function Timer() {
  const [remaining, setRemaining] = useState(ROUND_SECONDS)
  const [running, setRunning] = useState(false)

  // The clock stops on its own at zero; Reset is what puts it back to 60.
  const active = running && remaining > 0

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => setRemaining((prev) => Math.max(0, prev - 1)), 1000)
    return () => clearInterval(interval)
  }, [active])

  function reset() {
    setRunning(false)
    setRemaining(ROUND_SECONDS)
  }

  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-black/10 p-5 sm:flex-row sm:items-center dark:border-white/10">
      <div>
        <div className="text-xs font-semibold tracking-widest text-[#b8942a] uppercase dark:text-[#d4af37]">
          RICHG
        </div>
        <div className="text-lg font-semibold">60-Second Push-Up Challenge</div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={remaining === 0}
            onClick={() => setRunning((r) => !r)}
            className={primaryButtonClass}
          >
            {active ? 'Pause' : remaining === ROUND_SECONDS ? 'Start Challenge' : 'Resume'}
          </button>
          <button type="button" onClick={reset} className={secondaryButtonClass}>
            Reset Timer
          </button>
        </div>
      </div>
      <div className="text-right">
        <div
          className={`text-6xl font-black tabular-nums ${remaining === 0 ? 'text-red-600 dark:text-red-400' : ''}`}
          aria-live="polite"
        >
          {remaining === 0 ? 'TIME' : remaining}
        </div>
        <div className="text-xs tracking-widest uppercase opacity-60">Seconds</div>
      </div>
    </div>
  )
}

function AddEntryForm({ total }: { total: number }) {
  const [state, formAction, isPending] = useActionState(addPushupEntryAction, undefined)
  const [clearError, setClearError] = useState<string | null>(null)
  const [isClearing, startClear] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // Clear the form after a successful add so the next participant can be entered straight away.
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
      nameRef.current?.focus()
    }
  }, [state])

  function handleClear() {
    if (!confirm('Clear all participants? This cannot be undone.')) return
    setClearError(null)
    startClear(async () => {
      const result = await clearPushupEntriesAction()
      if (!result.success) setClearError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-4 self-start rounded-lg border border-black/10 p-5 dark:border-white/10">
      <form ref={formRef} action={formAction} className="flex flex-col gap-3">
        <h2 className="font-semibold">Add Participant</h2>
        <div>
          <label htmlFor="pushup-name" className={labelClass}>
            Name
          </label>
          <input ref={nameRef} id="pushup-name" name="name" required maxLength={50} className={inputClass} />
        </div>
        <div>
          <label htmlFor="pushup-score" className={labelClass}>
            Valid push-ups
          </label>
          <input
            id="pushup-score"
            name="score"
            type="number"
            required
            min={0}
            max={MAX_SCORE}
            step={1}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? 'Saving…' : 'Add Score'}
        </button>
        {state?.success === false && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      </form>

      <div className="border-t border-black/10 pt-4 dark:border-white/10">
        <div className="text-xs tracking-wide uppercase opacity-60">Total participants</div>
        <div className="text-4xl font-black tabular-nums">{total}</div>
        <button
          type="button"
          disabled={total === 0 || isClearing}
          onClick={handleClear}
          className={`${secondaryButtonClass} mt-3`}
        >
          {isClearing ? 'Clearing…' : 'Clear All'}
        </button>
        {clearError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{clearError}</p>}
      </div>
    </div>
  )
}

function Leaderboard({ entries }: { entries: Entry[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? entries : entries.slice(0, LEADERBOARD_SIZE)

  return (
    <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">Live Leaderboard — {showAll ? 'All' : `Top ${LEADERBOARD_SIZE}`}</h2>
        {entries.length > LEADERBOARD_SIZE && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            {showAll ? `Show top ${LEADERBOARD_SIZE}` : `Show all ${entries.length}`}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm opacity-60">No scores yet.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {visible.map((entry, i) => (
            <LeaderboardRow key={entry.id} entry={entry} rank={i + 1} />
          ))}
        </ol>
      )}
    </div>
  )
}

function LeaderboardRow({ entry, rank }: { entry: Entry; rank: number }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(entry.score))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await updatePushupScoreAction(entry.id, Number(draft))
      if (result.success) setEditing(false)
      else setError(result.error)
    })
  }

  function remove() {
    if (!confirm(`Remove ${entry.name} from the leaderboard?`)) return
    setError(null)
    startTransition(async () => {
      const result = await deletePushupEntryAction(entry.id)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <li
      className={`rounded-md border border-black/10 px-4 py-3 dark:border-white/10 ${
        rank <= 3 ? 'bg-surface' : ''
      } ${isPending ? 'opacity-50' : ''}`}
    >
      <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3">
        <span className="font-semibold tabular-nums">{MEDALS[rank - 1] ?? `#${rank}`}</span>
        <span className="truncate font-medium">{entry.name}</span>
        <span className="text-2xl font-black tabular-nums">{entry.score}</span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs">
        {editing ? (
          <>
            <input
              type="number"
              min={0}
              max={MAX_SCORE}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              autoFocus
              className="w-24 rounded-md border border-black/10 bg-transparent px-2 py-1 dark:border-white/10"
            />
            <button type="button" disabled={isPending} onClick={save} className="font-medium hover:underline">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft(String(entry.score))
                setError(null)
              }}
              className="opacity-60 hover:opacity-100"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setDraft(String(entry.score))
                setEditing(true)
              }}
              className="opacity-60 hover:opacity-100"
            >
              Edit
            </button>
            <button type="button" disabled={isPending} onClick={remove} className="opacity-60 hover:opacity-100">
              Remove
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  )
}
