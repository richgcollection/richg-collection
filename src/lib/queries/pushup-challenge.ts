import { prisma } from '@/lib/prisma'
import type { PushupEntry } from '@/lib/pushup-challenge'

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
