import { prisma } from '@/lib/prisma'
import type { ChallengeLiveState, PendingParticipant, PushupEntry } from '@/lib/pushup-challenge'

export const CHALLENGE_STATE_ID = 'default'

/** Scored participants, highest score first; ties go to whoever was scored earliest. */
export async function getPushupEntries(take?: number): Promise<PushupEntry[]> {
  const rows = await prisma.pushupEntry.findMany({
    where: { score: { not: null } },
    orderBy: [{ score: 'desc' }, { scoredAt: 'asc' }],
    select: { id: true, name: true, score: true },
    take,
  })
  return rows.map((row) => ({ ...row, score: row.score ?? 0 }))
}

/** Registered participants still waiting for a score, in the order they signed up. */
export function getPendingParticipants(): Promise<PendingParticipant[]> {
  return prisma.pushupEntry.findMany({
    where: { score: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
}

/** Everyone registered, scored or not. */
export function countPushupEntries(): Promise<number> {
  return prisma.pushupEntry.count()
}

/**
 * Everything an open page needs to stay in sync: the timer, the announced
 * winner, and a version stamp that changes whenever a participant is added
 * (count + latest updatedAt), scored or edited (latest updatedAt) or removed (count).
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
