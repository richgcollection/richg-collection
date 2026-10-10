'use client'

import { useEffect, useState } from 'react'
import { PRIZES, type ChallengeLiveState } from '@/lib/pushup-challenge'
import { fireConfetti } from './confetti'

/**
 * Full-screen winner reveal with confetti, shown only when the announcement
 * arrives while the page is open. Visitors who load the page afterwards get
 * the static banner from the page instead.
 */
export function WinnerReveal({ winner }: { winner: ChallengeLiveState['winner'] }) {
  const [seenOnLoad] = useState(winner?.announcedAt ?? null)
  const [dismissed, setDismissed] = useState<number | null>(null)

  const announcedAt = winner?.announcedAt ?? null
  const show = winner !== null && announcedAt !== seenOnLoad && announcedAt !== dismissed

  useEffect(() => {
    if (!show) return
    fireConfetti()
    // A second wave a beat later makes the reveal land.
    const timeout = setTimeout(fireConfetti, 900)
    return () => clearTimeout(timeout)
  }, [show, announcedAt])

  if (!show || !winner) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="winner-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#d4af37]/40 bg-[#0a0a0a] p-8 text-center text-white sm:p-12">
        <div className="text-6xl">🏆</div>
        <div className="mt-4 text-xs font-semibold tracking-[0.3em] text-[#d4af37] uppercase">
          RICHG Push-Up Challenge
        </div>
        <h2 id="winner-title" className="mt-2 text-lg tracking-widest uppercase opacity-80">
          And the winner is
        </h2>
        <div className="mt-4 text-4xl font-black break-words sm:text-5xl">{winner.name}</div>
        <div className="mt-3 text-2xl font-semibold text-[#d4af37] tabular-nums">{winner.score} push-ups</div>
        <div className="mt-2 opacity-70">{PRIZES[0].amount} Prize</div>
        <button
          type="button"
          onClick={() => setDismissed(announcedAt)}
          className="mt-8 rounded-full border border-white/20 px-6 py-2 text-sm font-medium hover:bg-white/10"
        >
          Close
        </button>
      </div>
    </div>
  )
}
