'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import type { ActionResult } from '@/lib/actions/cart'
import { MAX_SCORE } from '@/lib/pushup-challenge'

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

export async function clearPushupEntriesAction(): Promise<ActionResult> {
  await requireAdmin()

  await prisma.pushupEntry.deleteMany()
  revalidateChallenge()
  return { success: true }
}

function revalidateChallenge() {
  revalidatePath('/admin/pushup-challenge')
  revalidatePath('/pushup-challenge')
}
