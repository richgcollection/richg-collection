import 'server-only'
import { upsertCustomerFromOrder } from '@/lib/customers'
import { generateOrderNumber } from '@/lib/orders'
import { initializeTransaction, isPaystackConfigured } from '@/lib/paystack'
import { prisma } from '@/lib/prisma'
import { getShippingRateForTown } from '@/lib/shipping'
import { siteUrl } from '@/lib/site-url'
import { availableUnits, reservedUnits, stockKey, unitPriceKes, variantShortLabel, variantSnapshot } from './catalog'

export type BotCartLine = { productId: string; variantId: string | null; quantity: number }

export type PricedLine = BotCartLine & {
  name: string
  variantLabel: string | null
  snapshot: string | null
  unitPriceKes: number
  lineTotalKes: number
  available: number
}

const LINE_SELECT = {
  id: true,
  name: true,
  status: true,
  basePriceKes: true,
  salePriceKes: true,
  stockQty: true,
  manageStock: true,
  costPriceKes: true,
  variants: {
    select: {
      id: true,
      priceKes: true,
      salePriceKes: true,
      stockQty: true,
      optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
    },
  },
} as const

type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0] | typeof prisma

/** Current prices and availability for the bot cart. Lines whose product was unpublished or deleted are dropped. */
export async function priceLines(lines: BotCartLine[], db: Db = prisma) {
  const ids = [...new Set(lines.map((l) => l.productId))]
  const [products, reserved] = await Promise.all([
    db.product.findMany({ where: { id: { in: ids } }, select: LINE_SELECT }),
    reservedUnits(db),
  ])
  const byId = new Map(products.map((p) => [p.id, p]))

  const priced: PricedLine[] = []
  for (const line of lines) {
    const product = byId.get(line.productId)
    if (!product || product.status !== 'published') continue
    const variant = line.variantId ? product.variants.find((v) => v.id === line.variantId) ?? null : null
    if (line.variantId && !variant) continue
    const unit = unitPriceKes(product, variant)
    priced.push({
      ...line,
      name: product.name,
      variantLabel: variant ? variantShortLabel(variant.optionValues) : null,
      snapshot: variant ? variantSnapshot(variant.optionValues) : null,
      unitPriceKes: unit,
      lineTotalKes: unit * line.quantity,
      available: availableUnits(product, variant, reserved),
    })
  }
  return { lines: priced, subtotalKes: priced.reduce((sum, l) => sum + l.lineTotalKes, 0) }
}

export type BotCheckoutInput = {
  phone: string
  fullName: string
  email: string
  town: string
  line2?: string
  lines: BotCartLine[]
}

export type BotCheckoutResult =
  | { ok: true; orderNumber: string; subtotalKes: number; shippingKes: number; totalKes: number; paymentUrl: string | null }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'stock'; shortages: { name: string; variantLabel: string | null; available: number }[] }

class StockShortage extends Error {
  constructor(public shortages: { name: string; variantLabel: string | null; available: number }[]) {
    super('stock')
  }
}

/**
 * Creates a PENDING order exactly like the website checkout does (same order
 * number format, address shape and Paystack reference), so the existing
 * Paystack webhook and markOrderPaid confirm it, deduct stock and record the
 * sale. Stock is checked against current reservations under a transaction
 * lock, so two bot customers can't both be sent a link for the last unit.
 */
export async function createBotOrder(input: BotCheckoutInput): Promise<BotCheckoutResult> {
  // Merge duplicate lines so a product added twice is checked as one quantity.
  const merged = new Map<string, BotCartLine>()
  for (const line of input.lines) {
    const key = stockKey(line.productId, line.variantId)
    const existing = merged.get(key)
    merged.set(key, { ...line, quantity: (existing?.quantity ?? 0) + line.quantity })
  }
  if (merged.size === 0) return { ok: false, reason: 'empty' }

  const shippingKes = await getShippingRateForTown(input.town)
  const shippingAddress = {
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    town: input.town,
    line1: input.town,
    line2: input.line2 || undefined,
  }

  let order: { id: string; orderNumber: string; subtotalKes: number; totalKes: number; productNames: string; units: number }
  try {
    order = await prisma.$transaction(async (tx) => {
      // Serialise bot checkouts; released automatically when the transaction ends.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('richg-bot-checkout'))) AS l`

      const priced = await priceLines([...merged.values()], tx)
      if (priced.lines.length === 0) throw new StockShortage([])
      const short = priced.lines.filter((l) => l.quantity > l.available)
      if (short.length > 0) {
        throw new StockShortage(short.map((l) => ({ name: l.name, variantLabel: l.variantLabel, available: l.available })))
      }

      const orderNumber = generateOrderNumber()
      const created = await tx.order.create({
        data: {
          orderNumber,
          channel: 'WHATSAPP',
          paymentRef: orderNumber,
          guestEmail: input.email,
          guestPhone: input.phone,
          subtotalKes: priced.subtotalKes,
          shippingKes,
          totalKes: priced.subtotalKes + shippingKes,
          shippingAddress,
          items: {
            create: priced.lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId ?? undefined,
              nameSnapshot: l.name,
              variantSnapshot: l.snapshot,
              unitPriceKes: l.unitPriceKes,
              quantity: l.quantity,
              lineTotalKes: l.lineTotalKes,
            })),
          },
        },
        select: { id: true, orderNumber: true, subtotalKes: true, totalKes: true },
      })
      return {
        ...created,
        productNames: priced.lines.map((l) => l.name).join(', '),
        units: priced.lines.reduce((sum, l) => sum + l.quantity, 0),
      }
    })
  } catch (err) {
    if (err instanceof StockShortage) {
      return err.shortages.length === 0 ? { ok: false, reason: 'empty' } : { ok: false, reason: 'stock', shortages: err.shortages }
    }
    throw err
  }

  // Same customer bookkeeping as the website checkout, tagged with the WhatsApp source.
  const customer = await upsertCustomerFromOrder({
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    town: input.town,
    productName: order.productNames,
    quantity: order.units,
    orderValueKes: order.totalKes,
    source: 'WhatsApp',
  })
  if (customer) {
    await prisma.order.update({ where: { id: order.id }, data: { customerId: customer.id } })
  }

  let paymentUrl: string | null = null
  if (await isPaystackConfigured()) {
    try {
      const transaction = await initializeTransaction({
        email: input.email,
        amountKes: order.totalKes,
        reference: order.orderNumber,
        callbackUrl: `${siteUrl()}/checkout/success`,
        metadata: { orderNumber: order.orderNumber, channel: 'whatsapp' },
      })
      paymentUrl = transaction.data.authorization_url
    } catch (err) {
      console.error('Paystack initialize failed for bot order', order.orderNumber, err)
    }
  }

  return {
    ok: true,
    orderNumber: order.orderNumber,
    subtotalKes: order.subtotalKes,
    shippingKes,
    totalKes: order.totalKes,
    paymentUrl,
  }
}
