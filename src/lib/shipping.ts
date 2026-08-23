import { prisma } from '@/lib/prisma'

export async function getShippingRateForCounty(county: string): Promise<number> {
  const rate = await prisma.shippingRate.findUnique({ where: { county } })
  if (rate) return rate.rateKes

  const fallback = await prisma.shippingRate.findUnique({ where: { county: 'DEFAULT' } })
  return fallback?.rateKes ?? 0
}

export async function getCounties(): Promise<string[]> {
  const rates = await prisma.shippingRate.findMany({
    where: { county: { not: 'DEFAULT' } },
    orderBy: { county: 'asc' },
    select: { county: true },
  })
  return rates.map((r) => r.county)
}
