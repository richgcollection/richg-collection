import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TrackEvent } from '@/components/analytics/TrackEvent'
import { prisma } from '@/lib/prisma'
import { isPaystackConfigured, verifyTransaction } from '@/lib/paystack'

export const dynamic = 'force-dynamic'

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; payment?: string; reference?: string; trxref?: string }>
}) {
  const params = await searchParams
  const orderNumber = params.reference ?? params.trxref ?? params.order
  if (!orderNumber) notFound()

  let order = await prisma.order.findUnique({ where: { orderNumber }, include: { items: true } })
  if (!order) notFound()

  // The redirect back from Paystack can arrive before the webhook does —
  // verify directly here so the customer sees an immediate confirmation
  // instead of "processing" if the payment already succeeded.
  if (order.paymentStatus !== 'PAID' && (params.reference || params.trxref) && (await isPaystackConfigured())) {
    try {
      const verification = await verifyTransaction(orderNumber)
      if (verification.data.status === 'success') {
        order = await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'PAID', status: 'PROCESSING' },
          include: { items: true },
        })
      }
    } catch {
      // Fall through and show the "processing" state — the webhook will catch up.
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      {order.paymentStatus === 'PAID' ? (
        <>
          <TrackEvent
            event="Purchase"
            params={{
              value: order.totalKes,
              currency: 'KES',
              // Product IDs (not the order number) so Meta can match the purchase to catalog items.
              content_ids: [...new Set(order.items.map((item) => item.productId))],
              content_type: 'product',
              contents: order.items.map((item) => ({
                id: item.productId,
                quantity: item.quantity,
                item_price: item.unitPriceKes,
              })),
              num_items: order.items.reduce((sum, item) => sum + item.quantity, 0),
              order_id: order.orderNumber,
            }}
          />
          <h1 className="text-3xl font-semibold tracking-tight">Thank you for your order!</h1>
          <p className="mt-4 opacity-70">
            Order <strong>{order.orderNumber}</strong> is confirmed. We&apos;ll email you when it ships.
          </p>
        </>
      ) : params.payment === 'pending-setup' ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Order received</h1>
          <p className="mt-4 opacity-70">
            Order <strong>{order.orderNumber}</strong> has been saved. Online payment is still being set
            up, we&apos;ll contact you shortly to arrange payment.
          </p>
        </>
      ) : params.payment === 'error' ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">We couldn&apos;t start payment</h1>
          <p className="mt-4 opacity-70">
            Order <strong>{order.orderNumber}</strong> was saved, but we couldn&apos;t start the payment
            process. Please contact us and we&apos;ll help you complete it.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Processing your payment</h1>
          <p className="mt-4 opacity-70">
            Order <strong>{order.orderNumber}</strong> is being confirmed. This page will update
            automatically once payment clears, you&apos;ll also get an email confirmation.
          </p>
        </>
      )}

      <Link
        href="/shop"
        className="mt-8 inline-block rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
      >
        Continue Shopping
      </Link>
    </div>
  )
}
