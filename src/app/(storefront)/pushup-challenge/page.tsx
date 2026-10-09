import type { Metadata } from 'next'
import { AutoRefresh } from '@/components/storefront/AutoRefresh'
import { LEADERBOARD_SIZE, MEDALS, PRIZES, ROUND_SECONDS } from '@/lib/pushup-challenge'
import { countPushupEntries, getPushupEntries } from '@/lib/queries/pushup-challenge'

export const metadata: Metadata = {
  title: 'Push-Up Challenge Leaderboard',
  description: `The RICHG ${ROUND_SECONDS}-second push-up challenge. Live leaderboard, top score wins.`,
}

export default async function PushupChallengePage() {
  const [entries, total] = await Promise.all([getPushupEntries(LEADERBOARD_SIZE), countPushupEntries()])

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
      <AutoRefresh seconds={15} />

      <div className="text-center">
        <div className="text-xs font-semibold tracking-[0.3em] text-[#b8942a] uppercase dark:text-[#d4af37]">
          RICHG Challenge
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {ROUND_SECONDS}-Second Push-Up Challenge
        </h1>
        <p className="mt-3 opacity-70">One competition · One leaderboard · Top score wins</p>
      </div>

      <div className="mt-12 grid gap-3 sm:grid-cols-3">
        {PRIZES.map((prize) => (
          <div key={prize.place} className="rounded-lg border border-black/10 p-5 text-center dark:border-white/10">
            <div className="text-3xl">{prize.medal}</div>
            <div className="mt-2 text-sm font-semibold tracking-wide uppercase">{prize.place}</div>
            <div className="mt-1 opacity-70">{prize.amount} Prize</div>
          </div>
        ))}
      </div>

      <section className="mt-12 rounded-lg border border-black/10 p-5 sm:p-8 dark:border-white/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Live Leaderboard — Top {LEADERBOARD_SIZE}</h2>
          <span className="flex items-center gap-2 text-xs opacity-60">
            <span className="size-2 animate-pulse rounded-full bg-red-600" aria-hidden />
            {total} {total === 1 ? 'participant' : 'participants'}
          </span>
        </div>

        {entries.length === 0 ? (
          <p className="mt-6 opacity-60">No scores yet. Be the first on the board.</p>
        ) : (
          <ol className="mt-6 flex flex-col gap-2">
            {entries.map((entry, i) => (
              <li
                key={entry.id}
                className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-md border border-black/10 px-4 py-3 dark:border-white/10 ${
                  i < 3 ? 'bg-surface' : ''
                }`}
              >
                <span className="font-semibold tabular-nums">{MEDALS[i] ?? `#${i + 1}`}</span>
                <span className="truncate font-medium">{entry.name}</span>
                <span className="text-2xl font-black tabular-nums">{entry.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
