import 'server-only'
import { formatKes } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { buttons } from './whatsapp'

/**
 * Tells a WhatsApp customer their payment went through. Called after
 * markOrderPaid (Paystack webhook, success page, admin "mark paid" or the
 * bot's own "I've paid" check), so it fires once per order. n8n receives the
 * messages at N8N_WHATSAPP_NOTIFY_URL and sends them. Never throws: a failed
 * notification must not affect the payment.
 */
export async function notifyWhatsAppOrderPaid(orderId: string): Promise<void> {
  const url = process.env.N8N_WHATSAPP_NOTIFY_URL
  const key = process.env.BOT_API_KEY
  if (!url || !key) return

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, channel: true, guestPhone: true, totalKes: true, shippingAddress: true },
    })
    if (!order || order.channel !== 'WHATSAPP' || !order.guestPhone) return

    const town = (order.shippingAddress as { town?: string } | null)?.town
    const messages = [
      buttons(
        `✅ Payment of ${formatKes(order.totalKes)} received for order *${order.orderNumber}*. Thank you!\n\nWe’re preparing your order${town ? ` for delivery to ${town}` : ''} and will update you when it’s on the way.`,
        [{ id: 'menu', title: 'Shop more' }],
      ),
    ]

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'order.paid', orderNumber: order.orderNumber, to: order.guestPhone, messages }),
    })
    if (!response.ok) console.error('n8n notify failed', order.orderNumber, response.status)
  } catch (err) {
    console.error('n8n notify error', orderId, err)
  }
}
