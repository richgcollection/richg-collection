import { prisma } from '@/lib/prisma'

export async function getShippingRateForTown(town: string): Promise<number> {
  const rate = await prisma.shippingRate.findUnique({ where: { town } })
  if (rate) return rate.rateKes

  const fallback = await prisma.shippingRate.findUnique({ where: { town: 'DEFAULT' } })
  return fallback?.rateKes ?? 0
}

export async function getTowns(): Promise<string[]> {
  const rates = await prisma.shippingRate.findMany({
    where: { town: { not: 'DEFAULT' } },
    orderBy: { town: 'asc' },
    select: { town: true },
  })
  return rates.map((r) => r.town)
}
