import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'

// Meta Conversions API: reports purchases server-side so they're counted even
// when the browser pixel is blocked or the customer never reaches the success
// page. `event_id` is the order number — the browser Purchase uses the same
// eventID, so Meta deduplicates the two.
const GRAPH_API_VERSION = 'v24.0'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Kenyan numbers to E.164 digits without '+' (0712345678 → 254712345678), as Meta expects. */
function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`
  return digits.length >= 7 ? digits : null
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function normalizeCity(city: string): string {
  return city.toLowerCase().replace(/[^a-z]/g, '')
}

type ShippingAddress = { fullName?: string; town?: string; email?: string; phone?: string }

/** Sends a Purchase event for a paid order. Never throws — tracking must not break payment flows. */
export async function sendMetaPurchaseEvent(orderId: string): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN
  if (!pixelId || !accessToken) return

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } })
    if (!order) return

    const address = (order.shippingAddress ?? {}) as ShippingAddress
    const email = (order.guestEmail ?? address.email)?.trim().toLowerCase()
    const phone = normalizePhone(order.guestPhone ?? address.phone ?? '')
    const [firstName, ...rest] = (address.fullName ?? '').trim().split(/\s+/)
    const lastName = rest.at(-1)
    const city = address.town ? normalizeCity(address.town) : ''

    const userData: Record<string, string[]> = { country: [sha256('ke')] }
    if (email) userData.em = [sha256(email)]
    if (phone) userData.ph = [sha256(phone)]
    if (firstName) userData.fn = [sha256(normalizeName(firstName))]
    if (lastName) userData.ln = [sha256(normalizeName(lastName))]
    if (city) userData.ct = [sha256(city)]
    const externalId = order.customerId ?? email
    if (externalId) userData.external_id = [sha256(externalId)]

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.richgcollection.com'

    const body = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: order.orderNumber,
          action_source: 'website',
          event_source_url: `${siteUrl}/checkout/success`,
          user_data: userData,
          custom_data: {
            currency: 'KES',
            value: order.totalKes,
            order_id: order.orderNumber,
            content_type: 'product',
            content_ids: [...new Set(order.items.map((item) => item.productId))],
            contents: order.items.map((item) => ({
              id: item.productId,
              quantity: item.quantity,
              item_price: item.unitPriceKes,
            })),
            num_items: order.items.reduce((sum, item) => sum + item.quantity, 0),
          },
        },
      ],
      ...(process.env.META_CAPI_TEST_EVENT_CODE ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE } : {}),
    }

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )
    if (!response.ok) {
      console.error(`Meta CAPI Purchase failed for ${order.orderNumber}:`, response.status, await response.text())
    }
  } catch (error) {
    console.error('Meta CAPI Purchase error:', error)
  }
}
