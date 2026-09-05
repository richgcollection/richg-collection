import { notFound } from 'next/navigation'
import { OrderActions } from '@/components/admin/OrderActions'
import { prisma } from '@/lib/prisma'
import { formatKes } from '@/lib/money'
import type { ShippingAddressInput } from '@/lib/orders'

export const dynamic = 'force-dynamic'

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!order) notFound()

  const shippingAddress = order.shippingAddress as unknown as ShippingAddressInput

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
        <span className="text-sm opacity-60">{order.createdAt.toLocaleString('en-KE')}</span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
                  <th className="p-4">Item</th>
                  <th className="p-4">Qty</th>
                  <th className="p-4">Unit Price</th>
                  <th className="p-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="p-4">
                      <p>{item.nameSnapshot}</p>
                      {item.variantSnapshot && <p className="text-xs opacity-60">{item.variantSnapshot}</p>}
                    </td>
                    <td className="p-4">{item.quantity}</td>
                    <td className="p-4">{formatKes(item.unitPriceKes)}</td>
                    <td className="p-4">{formatKes(item.lineTotalKes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
            <p className="mb-2 font-medium tracking-wide uppercase opacity-70">Shipping Address</p>
            <p>{shippingAddress.fullName}</p>
            <p>{shippingAddress.phone}</p>
            <p>{shippingAddress.email}</p>
            <p>
              {shippingAddress.line1}
              {shippingAddress.line2 ? `, ${shippingAddress.line2}` : ''}
            </p>
            <p>{shippingAddress.town}</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
            <div className="flex justify-between">
              <span className="opacity-70">Subtotal</span>
              <span>{formatKes(order.subtotalKes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">Shipping</span>
              <span>{formatKes(order.shippingKes)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-black/10 pt-2 font-medium dark:border-white/10">
              <span>Total</span>
              <span>{formatKes(order.totalKes)}</span>
            </div>
            <div className="mt-3 text-xs opacity-60">
              Payment ref: {order.paymentRef} · Payment status: {order.paymentStatus}
            </div>
          </div>

          <OrderActions orderId={order.id} status={order.status} paymentStatus={order.paymentStatus} />
        </div>
      </div>
    </div>
  )
}
