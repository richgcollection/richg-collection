import { prisma } from '@/lib/prisma'
import { formatKes } from '@/lib/money'
import { getStockSummary, getProfitSummary } from '@/lib/inventory'

export const dynamic = 'force-dynamic'

async function getDashboardStats() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [ordersToday, ordersThisMonth, revenueThisMonth, stockSummary, pendingOrders, profitThisMonth] =
    await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfMonth }, paymentStatus: 'PAID' },
        _sum: { totalKes: true },
      }),
      getStockSummary(),
      prisma.order.count({ where: { paymentStatus: 'PENDING' } }),
      getProfitSummary({ from: startOfMonth }),
    ])

  return {
    ordersToday,
    ordersThisMonth,
    revenueThisMonth: revenueThisMonth._sum.totalKes ?? 0,
    lowStockCount: stockSummary.filter((r) => r.lowStock).length,
    pendingOrders,
    profitThisMonth: profitThisMonth.profitKes,
  }
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats()

  const cards = [
    { label: 'Orders Today', value: stats.ordersToday },
    { label: 'Orders This Month', value: stats.ordersThisMonth },
    { label: 'Revenue This Month', value: formatKes(stats.revenueThisMonth) },
    { label: 'Profit This Month', value: formatKes(stats.profitThisMonth) },
    { label: 'Pending Payments', value: stats.pendingOrders },
    { label: 'Low Stock Items', value: stats.lowStockCount },
  ]

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10">
            <p className="text-xs font-medium tracking-wide uppercase opacity-60">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
