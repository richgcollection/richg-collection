import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatKes } from '@/lib/money'
import type { OrderStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const STATUS_FILTERS: Array<{ label: string; value: OrderStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Shipped', value: 'SHIPPED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const activeStatus = STATUS_FILTERS.some((f) => f.value === status) ? (status as OrderStatus) : undefined

  const orders = await prisma.order.findMany({
    where: activeStatus ? { status: activeStatus } : undefined,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      guestEmail: true,
      totalKes: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
    },
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === 'ALL' ? '/admin/orders' : `/admin/orders?status=${filter.value}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              (activeStatus ?? 'ALL') === filter.value
                ? 'border-foreground'
                : 'border-black/10 dark:border-white/10'
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
            <th className="py-2">Order</th>
            <th className="py-2">Customer</th>
            <th className="py-2">Total</th>
            <th className="py-2">Payment</th>
            <th className="py-2">Status</th>
            <th className="py-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-3">
                <Link href={`/admin/orders/${order.id}`} className="font-medium hover:opacity-70">
                  {order.orderNumber}
                </Link>
              </td>
              <td className="py-3 opacity-80">{order.guestEmail}</td>
              <td className="py-3">{formatKes(order.totalKes)}</td>
              <td className="py-3">
                <StatusPill value={order.paymentStatus} />
              </td>
              <td className="py-3">
                <StatusPill value={order.status} />
              </td>
              <td className="py-3 opacity-60">{order.createdAt.toLocaleDateString('en-KE')}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center opacity-60">
                No orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-surface px-2 py-1 text-xs font-medium tracking-wide uppercase">
      {value}
    </span>
  )
}
