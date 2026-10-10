// Shared by the admin manager (client) and the public leaderboard, so keep
// this free of server-only imports.

/** "Challenge about to begin" lead-in before the round. Also absorbs polling lag on other screens. */
export const COUNTDOWN_SECONDS = 10
export const ROUND_SECONDS = 60
export const MAX_SCORE = 300
export const LEADERBOARD_SIZE = 10
/** How often open pages check for timer, score and winner changes. */
export const LIVE_POLL_MS = 2000
export const MEDALS = ['🥇', '🥈', '🥉']
export const PRIZES = [
  { medal: '🥇', place: '1st Place', amount: 'KSh 15,500' },
  { medal: '🥈', place: '2nd Place', amount: 'KSh 9,700' },
  { medal: '🥉', place: '3rd Place', amount: 'KSh 6,800' },
]

export type PushupEntry = { id: string; name: string; score: number }

/** Timestamps are epoch milliseconds so the state survives JSON as-is. */
export type ChallengeLiveState = {
  /** Changes whenever a score is added, edited or removed. */
  version: string
  timer: { startedAt: number | null; pausedElapsedMs: number | null }
  winner: { name: string; score: number; announcedAt: number } | null
  serverNow: number
}

export type TimerPhase =
  | { phase: 'idle' }
  | { phase: 'countdown' | 'running'; secondsLeft: number; paused: boolean }
  | { phase: 'finished' }

export function getTimerPhase(timer: ChallengeLiveState['timer'], now: number): TimerPhase {
  if (timer.startedAt === null) return { phase: 'idle' }

  const paused = timer.pausedElapsedMs !== null
  const elapsed = timer.pausedElapsedMs ?? Math.max(0, now - timer.startedAt)
  const countdownMs = COUNTDOWN_SECONDS * 1000
  const totalMs = countdownMs + ROUND_SECONDS * 1000

  if (elapsed < countdownMs) {
    return { phase: 'countdown', secondsLeft: Math.ceil((countdownMs - elapsed) / 1000), paused }
  }
  if (elapsed < totalMs) {
    return { phase: 'running', secondsLeft: Math.ceil((totalMs - elapsed) / 1000), paused }
  }
  return { phase: 'finished' }
}
