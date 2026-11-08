import 'server-only'
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sortVariantsBySize } from '@/lib/sizes'

type Db = PrismaClient | Prisma.TransactionClient

/** Products per list page. A WhatsApp list holds 10 rows; the rest are "More" / "Back". */
export const PAGE_SIZE = 8

/** How long an unpaid order holds its stock, in minutes (BOT_RESERVATION_MINUTES, default 30). */
export function reservationMinutes(): number {
  const n = Number(process.env.BOT_RESERVATION_MINUTES)
  return Number.isFinite(n) && n > 0 ? n : 30
}

export const stockKey = (productId: string, variantId: string | null | undefined) => `${productId}:${variantId ?? ''}`

/**
 * Units held by unpaid orders (website or WhatsApp) placed within the
 * reservation window. Stock is only deducted when an order is paid
 * (markOrderPaid), so without this two shoppers could both be sent a payment
 * link for the last unit. Once the window passes the hold simply lapses.
 */
export async function reservedUnits(db: Db = prisma): Promise<Map<string, number>> {
  const since = new Date(Date.now() - reservationMinutes() * 60_000)
  const items = await db.orderItem.findMany({
    where: { order: { status: 'PENDING', paymentStatus: 'PENDING', createdAt: { gte: since } } },
    select: { productId: true, variantId: true, quantity: true },
  })
  const map = new Map<string, number>()
  for (const item of items) {
    const key = stockKey(item.productId, item.variantId)
    map.set(key, (map.get(key) ?? 0) + item.quantity)
  }
  return map
}

/** Same pricing rule as the website cart (lib/cart.ts). */
export function unitPriceKes(
  product: { basePriceKes: number; salePriceKes: number | null },
  variant: { priceKes: number | null; salePriceKes: number | null } | null,
): number {
  if (variant?.priceKes != null) return variant.salePriceKes ?? variant.priceKes
  return product.salePriceKes ?? product.basePriceKes
}

type OptionValues = { optionValue: { value: string; option: { name: string } } }[]

/** Snapshot label stored on order lines, matching the website: "Size: M / Colour: Black". */
export function variantSnapshot(optionValues: OptionValues): string | null {
  if (optionValues.length === 0) return null
  return optionValues.map((ov) => `${ov.optionValue.option.name}: ${ov.optionValue.value}`).join(' / ')
}

/** Short label for chat lists: "M / Black". */
export function variantShortLabel(optionValues: OptionValues): string {
  return optionValues.map((ov) => ov.optionValue.value).join(' / ') || 'Standard'
}

/** Units that can still be sold; Infinity for products that don't track stock. */
export function availableUnits(
  product: { id: string; manageStock: boolean; stockQty: number },
  variant: { id: string; stockQty: number } | null,
  reserved: Map<string, number>,
): number {
  if (!product.manageStock) return Number.POSITIVE_INFINITY
  const onHand = variant ? variant.stockQty : product.stockQty
  return Math.max(0, onHand - (reserved.get(stockKey(product.id, variant?.id)) ?? 0))
}

const OPTION_VALUES_SELECT = {
  select: { optionValue: { select: { value: true, option: { select: { name: true } } } } },
} as const

const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  basePriceKes: true,
  salePriceKes: true,
  stockQty: true,
  manageStock: true,
  images: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
  variants: {
    select: { id: true, priceKes: true, salePriceKes: true, stockQty: true, optionValues: OPTION_VALUES_SELECT },
  },
} satisfies Prisma.ProductSelect

type BotProductRecord = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>

export type BotVariant = { id: string; label: string; snapshot: string | null; priceKes: number; available: number }

export type BotProduct = {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  imageUrl: string | null
  /** Lowest price across in-stock options. */
  priceKes: number
  /** True when options are priced differently, so the list shows "from". */
  priceVaries: boolean
  /** Empty for products without options; then `available` applies to the product itself. */
  variants: BotVariant[]
  available: number
}

function absoluteUrl(url: string | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http')) return url
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://richgcollection.com').replace(/\/$/, '')
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`
}

function toBotProduct(product: BotProductRecord, reserved: Map<string, number>): BotProduct {
  const variants = sortVariantsBySize(product.variants).map((v) => ({
    id: v.id,
    label: variantShortLabel(v.optionValues),
    snapshot: variantSnapshot(v.optionValues),
    priceKes: unitPriceKes(product, v),
    available: availableUnits(product, v, reserved),
  }))
  const inStock = variants.filter((v) => v.available > 0)
  const prices = (inStock.length > 0 ? inStock : variants).map((v) => v.priceKes)
  const basePrice = unitPriceKes(product, null)

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    imageUrl: absoluteUrl(product.images[0]?.url),
    priceKes: prices.length > 0 ? Math.min(...prices) : basePrice,
    priceVaries: new Set(prices).size > 1,
    variants,
    available:
      variants.length > 0
        ? inStock.reduce((sum, v) => sum + v.available, 0)
        : availableUnits(product, null, reserved),
  }
}

const categoryFilter = (slug: string): Prisma.ProductWhereInput => ({
  categories: { some: { category: { OR: [{ slug }, { parent: { slug } }] } } },
})

/** Top-level categories that have at least one in-stock product, with how many. */
export async function listCategories(): Promise<{ slug: string; name: string; count: number }[]> {
  const [categories, reserved] = await Promise.all([
    prisma.category.findMany({ where: { parentId: null }, orderBy: { name: 'asc' }, select: { slug: true, name: true } }),
    reservedUnits(),
  ])
  const products = await prisma.product.findMany({
    where: { status: 'published' },
    select: {
      ...PRODUCT_SELECT,
      categories: { select: { category: { select: { slug: true, parent: { select: { slug: true } } } } } },
    },
  })

  const counts = new Map<string, number>()
  for (const product of products) {
    if (toBotProduct(product, reserved).available <= 0) continue
    const slugs = new Set(product.categories.flatMap((pc) => [pc.category.slug, pc.category.parent?.slug]))
    for (const slug of slugs) if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }

  return categories
    .map((c) => ({ ...c, count: counts.get(c.slug) ?? 0 }))
    .filter((c) => c.count > 0)
}

/** In-stock products in a category or matching a search, newest first, one page at a time. */
export async function listProducts(params: { categorySlug?: string; query?: string; page?: number }) {
  const where: Prisma.ProductWhereInput = { status: 'published' }
  if (params.categorySlug) Object.assign(where, categoryFilter(params.categorySlug))
  if (params.query) where.name = { contains: params.query, mode: 'insensitive' }

  const [products, reserved] = await Promise.all([
    prisma.product.findMany({ where, select: PRODUCT_SELECT, orderBy: { createdAt: 'desc' } }),
    reservedUnits(),
  ])
  const inStock = products.map((p) => toBotProduct(p, reserved)).filter((p) => p.available > 0)
  const page = Math.max(0, params.page ?? 0)
  return {
    items: inStock.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    total: inStock.length,
    hasMore: (page + 1) * PAGE_SIZE < inStock.length,
    page,
  }
}

export async function getBotProduct(id: string): Promise<BotProduct | null> {
  const [product, reserved] = await Promise.all([
    prisma.product.findFirst({ where: { id, status: 'published' }, select: PRODUCT_SELECT }),
    reservedUnits(),
  ])
  return product ? toBotProduct(product, reserved) : null
}

/** Delivery towns matching what the customer typed, best matches first. */
export async function matchTowns(input: string, limit = 8): Promise<{ town: string; rateKes: number }[]> {
  const needle = input.trim().toLowerCase()
  if (!needle) return []
  const rates = await prisma.shippingRate.findMany({
    where: { town: { not: 'DEFAULT' } },
    select: { town: true, rateKes: true },
  })
  const score = (town: string) => {
    const t = town.toLowerCase()
    if (t === needle) return 0
    if (t.startsWith(needle)) return 1
    if (t.split(/[\s/-]+/).some((word) => word.startsWith(needle))) return 2
    if (t.includes(needle) || needle.includes(t)) return 3
    return 99
  }
  return rates
    .map((r) => ({ ...r, s: score(r.town) }))
    .filter((r) => r.s < 99)
    .sort((a, b) => a.s - b.s || a.town.localeCompare(b.town))
    .slice(0, limit)
    .map(({ town, rateKes }) => ({ town, rateKes }))
}
