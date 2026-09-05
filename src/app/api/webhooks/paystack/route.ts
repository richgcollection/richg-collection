import { prisma } from '@/lib/prisma'
import { verifyWebhookSignature } from '@/lib/paystack'

type PaystackChargeEvent = {
  event: string
  data: {
    reference: string
    amount: number
    currency: string
    status: string
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return new Response('Invalid signature', { status: 401 })
  }

  const event = JSON.parse(rawBody) as PaystackChargeEvent

  if (event.event !== 'charge.success') {
    return Response.json({ received: true })
  }

  const { reference, amount } = event.data

  const order = await prisma.order.findUnique({ where: { paymentRef: reference } })
  if (!order) {
    return new Response('Order not found', { status: 404 })
  }

  // Idempotent: Paystack may retry webhook delivery — skip if already processed.
  if (order.paymentStatus === 'PAID') {
    return Response.json({ received: true })
  }

  const expectedAmount = Math.round(order.totalKes * 100)
  if (amount !== expectedAmount) {
    return new Response('Amount mismatch', { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PAID', status: 'PROCESSING' },
    })

    const items = await tx.orderItem.findMany({ where: { orderId: order.id } })
    for (const item of items) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { decrement: item.quantity } },
        })
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { decrement: item.quantity } },
        })
      }
    }
  })

  return Response.json({ received: true })
}
