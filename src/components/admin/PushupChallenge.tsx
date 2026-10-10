'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { ChallengeClock } from '@/components/pushup-challenge/ChallengeClock'
import { useChallengeLive } from '@/components/pushup-challenge/useChallengeLive'
import {
  addParticipantAction,
  announceWinnerAction,
  clearPushupEntriesAction,
  deletePushupEntryAction,
  hideWinnerAction,
  pauseChallengeTimerAction,
  resetChallengeTimerAction,
  resumeChallengeTimerAction,
  startChallengeTimerAction,
  submitPushupScoreAction,
  updatePushupScoreAction,
} from '@/lib/actions/admin-pushup-challenge'
import type { ActionResult } from '@/lib/actions/cart'
import {
  COUNTDOWN_SECONDS,
  LEADERBOARD_SIZE,
  MAX_SCORE,
  MEDALS,
  PRIZES,
  ROUND_SECONDS,
  type ChallengeLiveState,
  type PendingParticipant,
  type TimerPhase,
  type PushupEntry as Entry,
} from '@/lib/pushup-challenge'

const inputClass =
  'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'
const labelClass = 'mb-1 block text-xs font-medium tracking-wide uppercase opacity-70'
const primaryButtonClass =
  'rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50'
const secondaryButtonClass =
  'rounded-full border border-black/10 px-5 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/10'

export function PushupChallenge({
  entries,
  pending,
  live: initialLive,
}: {
  entries: Entry[]
  pending: PendingParticipant[]
  live: ChallengeLiveState
}) {
  const { live, phase, refreshNow } = useChallengeLive(initialLive)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  /** Runs a timer/winner action, then re-reads the shared state so this screen updates at once. */
  function run(action: () => Promise<ActionResult>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.success) setError(result.error)
      await refreshNow()
    })
  }

  const leader = entries[0]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-black/10 p-5 sm:flex-row sm:items-center dark:border-white/10">
        <div>
          <div className="text-xs font-semibold tracking-widest text-[#b8942a] uppercase dark:text-[#d4af37]">
            RICHG
          </div>
          <div className="text-lg font-semibold">{ROUND_SECONDS}-Second Push-Up Challenge</div>
          <p className="mt-1 text-xs opacity-60">
            Start shows a {COUNTDOWN_SECONDS}-second &quot;about to begin&quot; countdown on every screen, then
            the {ROUND_SECONDS}-second round.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {phase.phase === 'idle' && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(startChallengeTimerAction)}
                className={primaryButtonClass}
              >
                Start Challenge
              </button>
            )}
            {(phase.phase === 'countdown' || phase.phase === 'running') && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(phase.paused ? resumeChallengeTimerAction : pauseChallengeTimerAction)}
                className={primaryButtonClass}
              >
                {phase.paused ? 'Resume' : 'Pause'}
              </button>
            )}
            {phase.phase !== 'idle' && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  // Scores lock again once the timer is reset, so check nobody from this round was missed.
                  if (
                    phase.phase === 'finished' &&
                    pending.length > 0 &&
                    !confirm(
                      `${pending.length} participant(s) still have no score. Scores can only be entered after a round, so they will need to do the next one. Reset anyway?`,
                    )
                  ) {
                    return
                  }
                  run(resetChallengeTimerAction)
                }}
                className={secondaryButtonClass}
              >
                Reset Timer
              </button>
            )}
          </div>
        </div>
        <div className="sm:text-right">
          {phase.phase === 'idle' ? (
            <div className="text-center">
              <div className="text-6xl font-black tabular-nums opacity-40">{ROUND_SECONDS}</div>
              <div className="text-xs tracking-widest uppercase opacity-60">Ready</div>
            </div>
          ) : (
            <ChallengeClock phase={phase} />
          )}
        </div>
      </div>

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
        <div className="flex flex-col gap-6">
          <AddParticipantForm total={entries.length + pending.length} onCleared={refreshNow} />
          <PendingScores pending={pending} phase={phase} />

          <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-5 dark:border-white/10">
            <h2 className="font-semibold">Winner</h2>
            {live.winner ? (
              <>
                <p className="text-sm">
                  🏆 <span className="font-semibold">{live.winner.name}</span> ({live.winner.score}) is announced on
                  the public leaderboard.
                </p>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(hideWinnerAction)}
                  className={secondaryButtonClass}
                >
                  Hide Announcement
                </button>
              </>
            ) : (
              <>
                <p className="text-sm opacity-70">
                  {leader
                    ? `Reveals ${leader.name} (${leader.score}) with confetti on every open leaderboard screen.`
                    : 'Add scores first, then announce the #1 at the end of the competition.'}
                </p>
                <button
                  type="button"
                  disabled={!leader || isPending}
                  onClick={() => {
                    if (leader && confirm(`Announce ${leader.name} as the winner?`)) run(announceWinnerAction)
                  }}
                  className={primaryButtonClass}
                >
                  Announce Winner
                </button>
              </>
            )}
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <Leaderboard entries={entries} />
      </div>
    </div>
  )
}

function AddParticipantForm({ total, onCleared }: { total: number; onCleared: () => Promise<void> }) {
  const [state, formAction, isPending] = useActionState(addParticipantAction, undefined)
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
    if (!confirm('Clear all participants? This also resets the timer and winner, and cannot be undone.')) return
    setClearError(null)
    startClear(async () => {
      const result = await clearPushupEntriesAction()
      if (!result.success) setClearError(result.error)
      await onCleared()
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
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? 'Adding…' : 'Add Participant'}
        </button>
        <p className="text-xs opacity-60">Add everyone in the round, then enter their push-ups once the timer ends.</p>
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

function PendingScores({ pending, phase }: { pending: PendingParticipant[]; phase: TimerPhase }) {
  const scoresOpen = phase.phase === 'finished'
  const hint =
    phase.phase === 'idle'
      ? 'Start the challenge. Scores open when the timer reaches TIME.'
      : phase.phase === 'finished'
        ? 'Round over. Enter each participant’s valid push-ups.'
        : 'Round in progress. Scores open when the timer reaches TIME.'

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-5 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Waiting for Score</h2>
        <span className="text-xs tabular-nums opacity-60">{pending.length}</span>
      </div>
      {pending.length === 0 ? (
        <p className="text-sm opacity-60">No one is waiting. Add participants above.</p>
      ) : (
        <>
          <p className={`text-xs ${scoresOpen ? 'font-medium text-[#b8942a] dark:text-[#d4af37]' : 'opacity-60'}`}>
            {hint}
          </p>
          <ul className="flex flex-col gap-2">
            {pending.map((participant) => (
              <PendingRow key={participant.id} participant={participant} scoresOpen={scoresOpen} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function PendingRow({ participant, scoresOpen }: { participant: PendingParticipant; scoresOpen: boolean }) {
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    if (score === '') return
    setError(null)
    startTransition(async () => {
      const result = await submitPushupScoreAction(participant.id, Number(score))
      if (!result.success) setError(result.error)
    })
  }

  function remove() {
    if (!confirm(`Remove ${participant.name}?`)) return
    setError(null)
    startTransition(async () => {
      const result = await deletePushupEntryAction(participant.id)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <li className={`rounded-md border border-black/10 px-3 py-2 dark:border-white/10 ${isPending ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{participant.name}</span>
        <input
          type="number"
          aria-label={`Push-ups for ${participant.name}`}
          placeholder="Reps"
          min={0}
          max={MAX_SCORE}
          step={1}
          value={score}
          disabled={!scoresOpen || isPending}
          onChange={(e) => setScore(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-20 rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm disabled:opacity-40 dark:border-white/10"
        />
        <button
          type="button"
          disabled={!scoresOpen || score === '' || isPending}
          onClick={save}
          className="text-xs font-medium hover:underline disabled:opacity-30 disabled:hover:no-underline"
        >
          Save
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={remove}
          aria-label={`Remove ${participant.name}`}
          className="text-xs opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
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
