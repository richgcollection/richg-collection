'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import type { ActionResult } from '@/lib/actions/cart'
import { getTimerPhase, MAX_SCORE } from '@/lib/pushup-challenge'
import { CHALLENGE_STATE_ID, getPushupEntries } from '@/lib/queries/pushup-challenge'

const scoreSchema = z.coerce
  .number()
  .int('Push-ups must be a whole number.')
  .min(0, 'Push-ups must be zero or more.')
  .max(MAX_SCORE, `Push-ups can't exceed ${MAX_SCORE}.`)

const entrySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(50, 'Name must be 50 characters or fewer.'),
  score: scoreSchema,
})

export async function addPushupEntryAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()

  const parsed = entrySchema.safeParse({
    name: formData.get('name'),
    score: formData.get('score'),
  })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  await prisma.pushupEntry.create({ data: parsed.data })
  revalidateChallenge()
  return { success: true }
}

export async function updatePushupScoreAction(id: string, score: number): Promise<ActionResult> {
  await requireAdmin()

  const parsed = scoreSchema.safeParse(score)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  await prisma.pushupEntry.update({ where: { id }, data: { score: parsed.data } })
  revalidateChallenge()
  return { success: true }
}

export async function deletePushupEntryAction(id: string): Promise<ActionResult> {
  await requireAdmin()

  await prisma.pushupEntry.delete({ where: { id } })
  revalidateChallenge()
  return { success: true }
}

/** Wipes the board and resets the timer and winner, ready for a new competition. */
export async function clearPushupEntriesAction(): Promise<ActionResult> {
  await requireAdmin()

  await prisma.$transaction([
    prisma.pushupEntry.deleteMany(),
    prisma.pushupChallengeState.deleteMany({ where: { id: CHALLENGE_STATE_ID } }),
  ])
  revalidateChallenge()
  return { success: true }
}

/** Starts the "about to begin" countdown, which rolls straight into the round. */
export async function startChallengeTimerAction(): Promise<ActionResult> {
  await requireAdmin()

  await saveState({ timerStartedAt: new Date(), timerPausedElapsedMs: null })
  return { success: true }
}

export async function pauseChallengeTimerAction(): Promise<ActionResult> {
  await requireAdmin()

  const state = await prisma.pushupChallengeState.findUnique({ where: { id: CHALLENGE_STATE_ID } })
  const startedAt = state?.timerStartedAt?.getTime() ?? null
  const phase = getTimerPhase({ startedAt, pausedElapsedMs: state?.timerPausedElapsedMs ?? null }, Date.now())
  if (startedAt === null || (phase.phase !== 'countdown' && phase.phase !== 'running') || phase.paused) {
    return { success: false, error: 'The timer is not running.' }
  }

  await saveState({ timerPausedElapsedMs: Date.now() - startedAt })
  return { success: true }
}

export async function resumeChallengeTimerAction(): Promise<ActionResult> {
  await requireAdmin()

  const state = await prisma.pushupChallengeState.findUnique({ where: { id: CHALLENGE_STATE_ID } })
  if (state?.timerPausedElapsedMs == null) {
    return { success: false, error: 'The timer is not paused.' }
  }

  // Shift the start forward by the time spent paused, so elapsed picks up where it stopped.
  await saveState({
    timerStartedAt: new Date(Date.now() - state.timerPausedElapsedMs),
    timerPausedElapsedMs: null,
  })
  return { success: true }
}

export async function resetChallengeTimerAction(): Promise<ActionResult> {
  await requireAdmin()

  await saveState({ timerStartedAt: null, timerPausedElapsedMs: null })
  return { success: true }
}

/** Snapshots the current #1 as the winner and triggers the reveal on open pages. */
export async function announceWinnerAction(): Promise<ActionResult> {
  await requireAdmin()

  const [leader] = await getPushupEntries(1)
  if (!leader) {
    return { success: false, error: 'There are no scores to announce yet.' }
  }

  await saveState({ winnerName: leader.name, winnerScore: leader.score, winnerAnnouncedAt: new Date() })
  revalidateChallenge()
  return { success: true }
}

export async function hideWinnerAction(): Promise<ActionResult> {
  await requireAdmin()

  await saveState({ winnerName: null, winnerScore: null, winnerAnnouncedAt: null })
  revalidateChallenge()
  return { success: true }
}

function saveState(data: Prisma.PushupChallengeStateUpdateInput) {
  return prisma.pushupChallengeState.upsert({
    where: { id: CHALLENGE_STATE_ID },
    update: data,
    create: { id: CHALLENGE_STATE_ID, ...(data as Prisma.PushupChallengeStateCreateInput) },
  })
}

function revalidateChallenge() {
  revalidatePath('/admin/pushup-challenge')
  revalidatePath('/pushup-challenge')
}
