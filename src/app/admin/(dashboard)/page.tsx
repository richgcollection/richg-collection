import { prisma } from '@/lib/prisma'
import { formatKes } from '@/lib/money'

export const dynamic = 'force-dynamic'

async function getDashboardStats() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [ordersToday, ordersThisMonth, revenueThisMonth, lowStockVariants, pendingOrders] =
    await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfMonth }, paymentStatus: 'PAID' },
        _sum: { totalKes: true },
      }),
      prisma.productVariant.count({ where: { stockQty: { lte: 3 } } }),
      prisma.order.count({ where: { paymentStatus: 'PENDING' } }),
    ])

  return {
    ordersToday,
    ordersThisMonth,
    revenueThisMonth: revenueThisMonth._sum.totalKes ?? 0,
    lowStockVariants,
    pendingOrders,
  }
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats()

  const cards = [
    { label: 'Orders Today', value: stats.ordersToday },
    { label: 'Orders This Month', value: stats.ordersThisMonth },
    { label: 'Revenue This Month', value: formatKes(stats.revenueThisMonth) },
    { label: 'Pending Payments', value: stats.pendingOrders },
    { label: 'Low Stock Variants', value: stats.lowStockVariants },
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
