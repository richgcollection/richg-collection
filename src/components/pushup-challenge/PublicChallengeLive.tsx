'use client'

import type { ChallengeLiveState } from '@/lib/pushup-challenge'
import { ChallengeClock } from './ChallengeClock'
import { useChallengeLive } from './useChallengeLive'
import { WinnerReveal } from './WinnerReveal'

/**
 * The live parts of the public leaderboard page: synced timer (with the names
 * of participants still waiting for a score), winner banner and reveal.
 */
export function PublicChallengeLive({ initial, roundNames }: { initial: ChallengeLiveState; roundNames: string[] }) {
  const { live, phase } = useChallengeLive(initial)

  return (
    <>
      <WinnerReveal winner={live.winner} />

      {live.winner && (
        <div className="mt-12 rounded-lg border border-[#d4af37]/50 bg-surface p-6 text-center">
          <div className="text-4xl">🏆</div>
          <div className="mt-2 text-xs font-semibold tracking-[0.3em] text-[#b8942a] uppercase dark:text-[#d4af37]">
            Winner
          </div>
          <div className="mt-1 text-2xl font-black break-words">{live.winner.name}</div>
          <div className="opacity-70 tabular-nums">{live.winner.score} push-ups</div>
        </div>
      )}

      {phase.phase !== 'idle' && (
        <div className="mt-12 rounded-lg border border-black/10 px-6 py-10 dark:border-white/10">
          <ChallengeClock phase={phase} size="lg" />
          {roundNames.length > 0 && (
            <div className="mt-8 text-center">
              <div className="text-xs tracking-widest uppercase opacity-60">In this round</div>
              <div className="mt-2 text-lg font-semibold">{roundNames.join(' · ')}</div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
