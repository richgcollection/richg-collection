import { prisma } from '@/lib/prisma'
import type { ChallengeLiveState, PushupEntry } from '@/lib/pushup-challenge'

export const CHALLENGE_STATE_ID = 'default'

/** Highest score first; ties go to whoever posted the score earliest. */
export function getPushupEntries(take?: number): Promise<PushupEntry[]> {
  return prisma.pushupEntry.findMany({
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, score: true },
    take,
  })
}

export function countPushupEntries(): Promise<number> {
  return prisma.pushupEntry.count()
}

/**
 * Everything an open page needs to stay in sync: the timer, the announced
 * winner, and a version stamp that changes whenever an entry is added
 * (count + latest updatedAt), edited (latest updatedAt) or removed (count).
 */
export async function getChallengeLiveState(): Promise<ChallengeLiveState> {
  const [{ _count, _max }, state] = await Promise.all([
    prisma.pushupEntry.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.pushupChallengeState.findUnique({ where: { id: CHALLENGE_STATE_ID } }),
  ])

  const winner =
    state?.winnerName && state.winnerScore !== null && state.winnerAnnouncedAt
      ? { name: state.winnerName, score: state.winnerScore, announcedAt: state.winnerAnnouncedAt.getTime() }
      : null

  return {
    version: `${_count}:${_max.updatedAt?.getTime() ?? 0}`,
    timer: {
      startedAt: state?.timerStartedAt?.getTime() ?? null,
      pausedElapsedMs: state?.timerPausedElapsedMs ?? null,
    },
    winner,
    serverNow: Date.now(),
  }
}
