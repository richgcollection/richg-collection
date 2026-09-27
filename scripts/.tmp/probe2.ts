import 'dotenv/config'
import { getAnalytics } from '../../src/lib/analytics'
import { prisma } from '../../src/lib/prisma'
async function main() {
  for (const range of ['90d', 'all'] as const) {
    const t = Date.now()
    const a = await getAnalytics({ range })
    console.log(range, 'ms', Date.now() - t, a.granularity, a.range, a.series.length, 'buckets')
    console.log(a.kpis, a.prevKpis?.revenueKes)
    console.log(a.outByReason, a.reasonKeys, a.sizes, a.weekday)
    console.log(a.categories.slice(0, 4), a.inventory, a.pareto, a.buyerMix, a.openCarts, a.orderStatus)
    console.log(a.products.slice(0, 3).map(({ spark, ...p }) => p))
    console.log(a.series.slice(-3).map(({ label, revenueKes, unitsSold, unitsOutByReason, unitsIn }) => ({ label, revenueKes, unitsSold, unitsOutByReason, unitsIn })))
    console.log('classes', a.products.reduce((m, p) => ({ ...m, [p.velocityClass]: ((m as any)[p.velocityClass] ?? 0) + 1 }), {}))
  }
}
main().finally(() => prisma.$disconnect())
