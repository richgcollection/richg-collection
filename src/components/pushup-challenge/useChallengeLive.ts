'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getTimerPhase, LIVE_POLL_MS, type ChallengeLiveState } from '@/lib/pushup-challenge'

/**
 * Follows the challenge's shared state (timer, winner, leaderboard version) by
 * polling while the tab is visible. Timer seconds are computed locally against
 * a server-clock offset, so every screen counts down together even if a
 * device's clock is off. When scores change, the server-rendered page is
 * refreshed so the leaderboard updates.
 */
export function useChallengeLive(initial: ChallengeLiveState) {
  const router = useRouter()
  const [live, setLive] = useState(initial)
  // Starts at the server's render time so server and client markup match;
  // the first tick below switches to the real (offset-corrected) clock.
  const [now, setNow] = useState(initial.serverNow)
  const offsetRef = useRef(0)
  const versionRef = useRef(initial.version)

  const poll = useCallback(async () => {
    try {
      const sentAt = Date.now()
      const res = await fetch('/api/pushup-challenge/live', { cache: 'no-store' })
      if (!res.ok) return
      const next: ChallengeLiveState = await res.json()
      const receivedAt = Date.now()
      offsetRef.current = next.serverNow - (sentAt + receivedAt) / 2

      setLive(next)
      setNow(Date.now() + offsetRef.current)
      if (next.version !== versionRef.current) {
        versionRef.current = next.version
        router.refresh()
      }
    } catch {
      // Network blip; the next poll will catch up.
    }
  }, [router])

  useEffect(() => {
    function pollIfVisible() {
      if (document.visibilityState === 'visible') poll()
    }

    pollIfVisible()
    const interval = setInterval(pollIfVisible, LIVE_POLL_MS)
    document.addEventListener('visibilitychange', pollIfVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', pollIfVisible)
    }
  }, [poll])

  const phase = getTimerPhase(live.timer, now)
  const ticking = (phase.phase === 'countdown' || phase.phase === 'running') && !phase.paused

  useEffect(() => {
    if (!ticking) return
    const interval = setInterval(() => setNow(Date.now() + offsetRef.current), 250)
    return () => clearInterval(interval)
  }, [ticking])

  return { live, phase, refreshNow: poll }
}
