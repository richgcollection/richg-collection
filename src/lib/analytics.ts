import 'server-only'
import type { OrderStatus, Prisma, StockMovementReason } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { effectiveLowStockThreshold, saleRevenueKes } from '@/lib/inventory'
import { compareSizes } from '@/lib/sizes'
import { getLedgerByCustomer, normalizePhone } from '@/lib/customers'

/**
 * Admin analytics. Sales are read from the stock ledger (ONLINE_SALE +
 * MANUAL_SALE movements) rather than from orders, because the ledger is the
 * only place manual/imported sales exist and every paid online order also
 * writes an ONLINE_SALE movement (see applyOrderStockOut) — so it is the one
 * complete record of what sold, when, and at what price and cost.
 *
 * All calendar bucketing is done in Kenya time (EAT, UTC+3, no DST).
 */

const DAY_MS = 86_400_000
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000

export const RANGE_PRESETS = {
  '30d': { label: '30 days', days: 30 },
  '90d': { label: '90 days', days: 90 },
  '180d': { label: '6 months', days: 180 },
  '365d': { label: '12 months', days: 365 },
  all: { label: 'All time', days: null },
} as const
export type RangeKey = keyof typeof RANGE_PRESETS
export const DEFAULT_RANGE: RangeKey = '90d'

export type Granularity = 'day' | 'week' | 'month'

const SALE_REASONS: StockMovementReason[] = ['ONLINE_SALE', 'MANUAL_SALE']
const GIVEAWAY_REASONS: StockMovementReason[] = ['REWARD', 'INFLUENCER', 'DAMAGE', 'ADJUSTMENT']

export const OUT_REASON_LABELS: Record<Exclude<StockMovementReason, 'RESTOCK'>, string> = {
  ONLINE_SALE: 'Online sale',
  MANUAL_SALE: 'Manual sale',
  INFLUENCER: 'Influencer',
  REWARD: 'Reward',
  DAMAGE: 'Damage',
  ADJUSTMENT: 'Adjustment',
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ---------------------------------------------------------------- dates

/** Shifts a UTC instant so its UTC getters read Kenya wall-clock time. */
const toEat = (d: Date) => new Date(d.getTime() + EAT_OFFSET_MS)
const fromEat = (d: Date) => new Date(d.getTime() - EAT_OFFSET_MS)

function startOfEatDay(d: Date): Date {
  const e = toEat(d)
  return fromEat(new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())))
}

function bucketStart(d: Date, g: Granularity): Date {
  const e = toEat(d)
  const y = e.getUTCFullYear()
  const m = e.getUTCMonth()
  if (g === 'month') return fromEat(new Date(Date.UTC(y, m, 1)))
  const day = new Date(Date.UTC(y, m, e.getUTCDate()))
  if (g === 'week') {
    const dow = (day.getUTCDay() + 6) % 7 // Monday = 0
    day.setUTCDate(day.getUTCDate() - dow)
  }
  return fromEat(day)
}

function nextBucket(d: Date, g: Granularity): Date {
  const e = toEat(d)
  if (g === 'month') return fromEat(new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 1)))
  return new Date(d.getTime() + (g === 'week' ? 7 : 1) * DAY_MS)
}

function bucketLabel(d: Date, g: Granularity): string {
  const e = toEat(d)
  if (g === 'month') return e.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  return e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export const dayKey = (d: Date) => toEat(d).toISOString().slice(0, 10)
const weekdayIndex = (d: Date) => (toEat(d).getUTCDay() + 6) % 7

export function autoGranularity(days: number): Granularity {
  if (days <= 45) return 'day'
  if (days <= 240) return 'week'
  return 'month'
}

// ---------------------------------------------------------------- types

export type Bucket = {
  key: string
  label: string
  start: string
  revenueKes: number
  costKes: number
  profitKes: number
  unitsSold: number
  transactions: number
  onlineRevenueKes: number
  manualRevenueKes: number
  unitsIn: number
  restockSpendKes: number
  unitsOutByReason: Record<string, number>
  buyers: number
}

export type Kpis = {
  revenueKes: number
  profitKes: number
  marginPct: number
  unitsSold: number
  transactions: number
  avgSaleKes: number
  avgUnitPriceKes: number
  buyers: number
  giveawayUnits: number
  giveawayCostKes: number
  unitsIn: number
  restockSpendKes: number
}

export type VelocityClass = 'fast' | 'steady' | 'slow' | 'dead' | 'stockout'

export type ProductVelocity = {
  productId: string
  name: string
  category: string
  unitsSold: number
  revenueKes: number
  profitKes: number
  marginPct: number | null
  avgPriceKes: number | null
  listPriceKes: number
  unitsPerWeek: number
  stockQty: number
  stockCostKes: number
  daysOfCover: number | null
  sellThroughPct: number
  lastSoldAt: string | null
  daysSinceLastSale: number | null
  trendPct: number | null
  spark: number[]
  velocityClass: VelocityClass
}

export type Named = { name: string; value: number; secondary?: number }

export type Analytics = {
  range: {
    key: RangeKey
    label: string
    from: string
    to: string
    days: number
    /** Set when a calendar year (and optionally month) is selected instead of a rolling range. */
    calendar: { year: number; month: number | null; /** 1–12, months of that year that have started. */ months: number[] } | null
    /** What the "previous" KPI figures cover, e.g. "the previous 90 days". */
    comparisonLabel: string
  }
  /** Calendar years with stock records, newest first. */
  availableYears: number[]
  granularity: Granularity
  kpis: Kpis
  prevKpis: Kpis | null
  series: Bucket[]
  reasonKeys: string[]
  outByReason: Named[]
  products: ProductVelocity[]
  categories: Array<{ name: string; revenueKes: number; profitKes: number; unitsSold: number }>
  sizes: Named[]
  weekday: Array<{ name: string; revenueKes: number; unitsSold: number }>
  daily: Array<{ date: string; units: number; revenueKes: number }>
  topBuyers: Named[]
  buyerMix: { newBuyers: number; returningBuyers: number; repeatWithinRange: number }
  customerSources: Named[]
  customerLocations: Named[]
  orderStatus: Named[]
  orderTotals: { count: number; paidCount: number; paidRevenueKes: number }
  inventory: {
    units: number
    costValueKes: number
    retailValueKes: number
    skus: number
    outOfStockSkus: number
    lowStockSkus: number
    deadStockCostKes: number
    coverHistogram: Named[]
  }
  openCarts: { count: number; units: number; valueKes: number }
  pareto: { productsFor80Pct: number; totalProductsSold: number }
  details: AnalyticsDetails
}

export type ChannelDetail = {
  name: string
  revenueKes: number
  profitKes: number
  unitsSold: number
  transactions: number
  buyers: number
  discountKes: number
  topProducts: Named[]
}

export type Basket = {
  key: string
  buyer: string | null
  date: string
  channels: string[]
  units: number
  lines: number
  valueKes: number
  orders: Array<{ id: string; orderNumber: string }>
}

export type BuyerDetail = {
  name: string
  revenueKes: number
  units: number
  baskets: number
  lastAt: string
  returning: boolean
  channels: string[]
}

export type ProductAmount = { productId: string; name: string; units: number; valueKes: number; count?: number }

export type SkuRow = { productId: string; name: string; variant: string | null; stockQty: number; threshold: number }

export type CartLine = {
  productId: string
  slug: string
  name: string
  variant: string | null
  quantity: number
  unitPriceKes: number
  lineKes: number
}

export type OpenCart = {
  id: string
  updatedAt: string
  email: string | null
  sessionId: string | null
  user: { id: string; name: string | null; email: string; phone: string | null; createdAt: string } | null
  customer: {
    id: string
    name: string
    phone: string | null
    email: string | null
    location: string | null
    source: string
    createdAt: string
    /** Lifetime spend and sale lines from the stock ledger (online + manual), see getLedgerByCustomer. */
    ledgerSpendKes: number
    ledgerSales: number
  } | null
  history: { orders: number; paidOrders: number; paidSpendKes: number; lastOrderAt: string | null }
  units: number
  valueKes: number
  items: CartLine[]
}

export type AnalyticsDetails = {
  channels: ChannelDetail[]
  discounts: { totalKes: number; grossKes: number; lines: number; byProduct: ProductAmount[]; byBuyer: Named[] }
  belowCost: Array<ProductAmount & { costKes: number }>
  variants: Array<{ productId: string; name: string; variant: string | null; unitsSold: number; revenueKes: number; stockQty: number | null }>
  baskets: { recent: Basket[]; largest: Basket[]; sizeBands: Named[]; valueBands: Named[] }
  buyers: BuyerDetail[]
  buyerRevenueSplit: { newKes: number; returningKes: number; anonymousKes: number }
  restocks: {
    byProduct: ProductAmount[]
    bySupplier: Named[]
    recent: Array<{ productId: string; name: string; variant: string | null; units: number; unitCostKes: number | null; supplier: string | null; at: string }>
  }
  giveaways: {
    byReason: Array<{ name: string; units: number; costKes: number }>
    byProduct: ProductAmount[]
    byRecipient: Array<{ name: string; reason: string; units: number; costKes: number }>
  }
  outReasonProducts: Record<string, Named[]>
  skus: { low: SkuRow[]; out: SkuRow[] }
  stockByCategory: Array<{ name: string; units: number; costKes: number; retailKes: number }>
  topStock: Array<{ productId: string; name: string; units: number; costKes: number; retailKes: number }>
  sizeTable: Array<{ name: string; unitsSold: number; revenueKes: number; inStock: number }>
  topDays: Array<{ date: string; revenueKes: number; units: number; transactions: number }>
  categoryProducts: Record<string, ProductAmount[]>
  orders: {
    recent: Array<{ id: string; orderNumber: string; at: string; status: string; paymentStatus: string; totalKes: number; who: string; items: number }>
    byStatus: Array<{ name: string; count: number; valueKes: number }>
    byPayment: Array<{ name: string; count: number; valueKes: number }>
  }
  newCustomers: {
    total: number
    bySource: Named[]
    recent: Array<{ id: string; name: string; source: string; location: string | null; at: string }>
  }
  allLocations: Named[]
  unknownLocations: number
  carts: OpenCart[]
}

// ---------------------------------------------------------------- helpers

function emptyKpis(): Kpis {
  return {
    revenueKes: 0,
    profitKes: 0,
    marginPct: 0,
    unitsSold: 0,
    transactions: 0,
    avgSaleKes: 0,
    avgUnitPriceKes: 0,
    buyers: 0,
    giveawayUnits: 0,
    giveawayCostKes: 0,
    unitsIn: 0,
    restockSpendKes: 0,
  }
}

type LedgerRow = Awaited<ReturnType<typeof loadLedger>>[number]

function loadLedger(from: Date | undefined, to: Date) {
  return prisma.stockMovement.findMany({
    where: { createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: 'asc' },
    select: {
      productId: true,
      variantId: true,
      direction: true,
      reason: true,
      quantity: true,
      unitCostKes: true,
      unitPriceKes: true,
      discountKes: true,
      counterparty: true,
      supplier: true,
      createdAt: true,
      order: { select: { id: true, orderNumber: true, guestEmail: true } },
      product: { select: { costPriceKes: true } },
      variant: {
        select: {
          stockQty: true,
          optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
        },
      },
    },
  })
}

const isSale = (m: LedgerRow) => m.direction === 'OUT' && SALE_REASONS.includes(m.reason)
const buyerKey = (m: LedgerRow) => (m.counterparty ?? m.order?.guestEmail ?? '').trim().toLowerCase() || null
const unitCost = (m: LedgerRow) => m.unitCostKes ?? m.product.costPriceKes ?? 0

/**
 * Transactions = distinct (buyer, day) pairs, so a customer buying three
 * items in one visit counts as one sale rather than three ledger lines.
 */
function transactionKey(m: LedgerRow) {
  return `${buyerKey(m) ?? `anon-${m.createdAt.getTime()}`}|${dayKey(m.createdAt)}`
}

function summarize(rows: LedgerRow[]): Kpis {
  const k = emptyKpis()
  const tx = new Set<string>()
  const buyers = new Set<string>()
  for (const m of rows) {
    if (m.direction === 'IN') {
      k.unitsIn += m.quantity
      k.restockSpendKes += (m.unitCostKes ?? 0) * m.quantity
    } else if (isSale(m)) {
      const revenue = saleRevenueKes(m)
      k.revenueKes += revenue
      k.profitKes += revenue - unitCost(m) * m.quantity
      k.unitsSold += m.quantity
      tx.add(transactionKey(m))
      const b = buyerKey(m)
      if (b) buyers.add(b)
    } else if (GIVEAWAY_REASONS.includes(m.reason)) {
      k.giveawayUnits += m.quantity
      k.giveawayCostKes += unitCost(m) * m.quantity
    }
  }
  k.transactions = tx.size
  k.buyers = buyers.size
  k.marginPct = k.revenueKes > 0 ? (k.profitKes / k.revenueKes) * 100 : 0
  k.avgSaleKes = k.transactions > 0 ? k.revenueKes / k.transactions : 0
  k.avgUnitPriceKes = k.unitsSold > 0 ? k.revenueKes / k.unitsSold : 0
  return k
}

type OptionValues = Array<{ optionValue: { value: string; option: { name: string } } }>

function sizeFrom(optionValues: OptionValues | undefined): string | null {
  const ov = optionValues?.find((v) => /size/i.test(v.optionValue.option.name))
  return ov ? ov.optionValue.value.toUpperCase().replace(/\s*,\s*/g, ' / ') : null
}

const sizeOf = (m: LedgerRow) => sizeFrom(m.variant?.optionValues)
const variantLabel = (optionValues: OptionValues | undefined) => optionValues?.map((v) => v.optionValue.value).join(' / ') || null

/** Adds to a keyed tally, creating the entry on first sight. */
function tally<T>(map: Map<string, T>, key: string, init: () => T, add: (e: T) => void) {
  const e = map.get(key) ?? init()
  add(e)
  map.set(key, e)
}

const byValueDesc = <T extends { valueKes: number }>(a: T, b: T) => b.valueKes - a.valueKes
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

function classify(p: { unitsSold: number; stockQty: number; daysOfCover: number | null }): VelocityClass {
  if (p.unitsSold === 0) return 'dead'
  if (p.stockQty <= 0) return 'stockout'
  const cover = p.daysOfCover ?? Infinity
  if (cover <= 30) return 'fast'
  if (cover <= 90) return 'steady'
  return 'slow'
}

type CartRow = {
  id: string
  email: string | null
  sessionId: string | null
  updatedAt: Date
  user: { id: string; name: string | null; email: string; phone: string | null; createdAt: Date } | null
  items: Array<{
    quantity: number
    product: { id: string; name: string; slug: string; basePriceKes: number; salePriceKes: number | null }
    variant: { priceKes: number | null; salePriceKes: number | null; optionValues: OptionValues } | null
  }>
}

type CustomerRow = {
  id: string
  firstName: string
  lastName: string | null
  phone: string | null
  email: string | null
  source: string
  location: string | null
  createdAt: Date
}

/**
 * Each open cart with whoever it belongs to: the signed-in user, the CRM
 * customer matched by email (or the user's phone), and that person's order
 * history. Lifetime spend comes from the stock ledger, which is only loaded
 * when at least one cart matched a customer.
 */
async function loadCartDetails(carts: CartRow[], customers: CustomerRow[]): Promise<OpenCart[]> {
  if (carts.length === 0) return []
  const byEmail = new Map<string, CustomerRow>()
  const byPhone = new Map<string, CustomerRow>()
  for (const c of customers) {
    const e = c.email?.trim().toLowerCase()
    if (e && !byEmail.has(e)) byEmail.set(e, c)
    const p = normalizePhone(c.phone)
    if (p) byPhone.set(p, c)
  }
  const emailsOf = (c: CartRow) =>
    Array.from(new Set([c.email, c.user?.email].map((e) => e?.trim().toLowerCase()).filter((e): e is string => Boolean(e))))
  const matched = carts.map((c) => {
    const phone = normalizePhone(c.user?.phone)
    return emailsOf(c).map((e) => byEmail.get(e)).find(Boolean) ?? (phone ? byPhone.get(phone) : undefined) ?? null
  })

  const userIds = carts.flatMap((c) => (c.user ? [c.user.id] : []))
  const customerIds = matched.flatMap((c) => (c ? [c.id] : []))
  const emails = Array.from(new Set(carts.flatMap(emailsOf)))
  const or: Prisma.OrderWhereInput[] = [
    ...(userIds.length ? [{ userId: { in: userIds } }] : []),
    ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
    ...emails.map((e) => ({ guestEmail: { equals: e, mode: 'insensitive' as const } })),
  ]
  const orders = or.length
    ? await prisma.order.findMany({
        where: { OR: or },
        select: { userId: true, customerId: true, guestEmail: true, paymentStatus: true, totalKes: true, createdAt: true },
      })
    : []
  const isMine = (c: CartRow, customerId: string | null, o: (typeof orders)[number]) =>
    Boolean(
      (c.user && o.userId === c.user.id) ||
        (customerId && o.customerId === customerId) ||
        (o.guestEmail && emailsOf(c).includes(o.guestEmail.trim().toLowerCase())),
    )
  // No direct match: fall back to the customer record their past orders were filed under.
  const customerById = new Map(customers.map((c) => [c.id, c]))
  const resolved = carts.map(
    (c, i) =>
      matched[i] ??
      customerById.get(orders.find((o) => o.customerId && isMine(c, null, o))?.customerId ?? '') ??
      null,
  )
  const ledger = resolved.some(Boolean) ? await getLedgerByCustomer() : null

  return carts.map((c, i) => {
    const customer = resolved[i]
    const mine = orders.filter((o) => isMine(c, customer?.id ?? null, o))
    const paidOrders = mine.filter((o) => o.paymentStatus === 'PAID')
    const last = mine.reduce<Date | null>((d, o) => (!d || o.createdAt > d ? o.createdAt : d), null)
    const items: CartLine[] = c.items.map((it) => {
      const price = it.variant?.salePriceKes ?? it.variant?.priceKes ?? it.product.salePriceKes ?? it.product.basePriceKes
      return {
        productId: it.product.id,
        slug: it.product.slug,
        name: it.product.name,
        variant: variantLabel(it.variant?.optionValues),
        quantity: it.quantity,
        unitPriceKes: price,
        lineKes: price * it.quantity,
      }
    })
    const ledgerEntry = customer ? ledger?.get(customer.id) : undefined
    return {
      id: c.id,
      updatedAt: c.updatedAt.toISOString(),
      email: c.email,
      sessionId: c.sessionId,
      user: c.user ? { ...c.user, createdAt: c.user.createdAt.toISOString() } : null,
      customer: customer
        ? {
            id: customer.id,
            name: `${customer.firstName} ${customer.lastName ?? ''}`.trim(),
            phone: customer.phone,
            email: customer.email,
            location: customer.location,
            source: customer.source,
            createdAt: customer.createdAt.toISOString(),
            ledgerSpendKes: ledgerEntry?.spendKes ?? 0,
            ledgerSales: ledgerEntry?.sales.length ?? 0,
          }
        : null,
      history: {
        orders: mine.length,
        paidOrders: paidOrders.length,
        paidSpendKes: paidOrders.reduce((s, o) => s + o.totalKes, 0),
        lastOrderAt: last?.toISOString() ?? null,
      },
      units: items.reduce((s, it) => s + it.quantity, 0),
      valueKes: items.reduce((s, it) => s + it.lineKes, 0),
      items,
    }
  })
}

// ---------------------------------------------------------------- main

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Start of a calendar month in Kenya time; `month` is 0-based and may overflow into the next/previous year. */
const startOfEatMonth = (year: number, month: number) => fromEat(new Date(Date.UTC(year, month, 1)))

export async function getAnalytics(opts: {
  range: RangeKey
  granularity?: Granularity
  /** Calendar year (Kenya time). Takes precedence over `range`. */
  year?: number
  /** 1–12, only with `year`. */
  month?: number
}): Promise<Analytics> {
  const now = new Date()
  const endOfToday = new Date(startOfEatDay(now).getTime() + DAY_MS) // exclusive
  const preset = RANGE_PRESETS[opts.range]
  const first = await prisma.stockMovement.aggregate({ _min: { createdAt: true } })
  const firstYear = toEat(first._min.createdAt ?? now).getUTCFullYear()
  const currentYear = toEat(now).getUTCFullYear()
  const availableYears = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => currentYear - i)

  let from: Date
  let to = endOfToday
  let prevFrom: Date | null
  let prevTo: Date
  let label: string = preset.label
  let comparisonLabel: string
  // A year that hasn't started falls back to the rolling range; a month that hasn't started, to its whole year.
  const startedMonths = opts.year
    ? Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => startOfEatMonth(opts.year!, m - 1) < endOfToday)
    : []
  const calendar =
    opts.year && startedMonths.length > 0
      ? {
          year: opts.year,
          month: opts.month && startedMonths.includes(opts.month) ? opts.month : null,
          months: startedMonths,
        }
      : null

  if (calendar) {
    const { year, month } = calendar
    from = month ? startOfEatMonth(year, month - 1) : startOfEatMonth(year, 0)
    const periodEnd = month ? startOfEatMonth(year, month) : startOfEatMonth(year + 1, 0)
    to = periodEnd < endOfToday ? periodEnd : endOfToday // the current month/year runs to today
    // Compare with the same stretch of the previous month/year (e.g. 1–4 Oct vs 1–4 Sep).
    prevFrom = month ? startOfEatMonth(year, month - 2) : startOfEatMonth(year - 1, 0)
    prevTo = new Date(Math.min(from.getTime(), prevFrom.getTime() + (to.getTime() - from.getTime())))
    label = month ? `${MONTH_NAMES[month - 1]} ${year}` : String(year)
    comparisonLabel = month ? `the same days of ${MONTH_NAMES[(month + 10) % 12]}` : `the same stretch of ${year - 1}`
  } else if (preset.days === null) {
    from = startOfEatDay(first._min.createdAt ?? new Date(to.getTime() - 30 * DAY_MS))
    prevFrom = null
    prevTo = from
    comparisonLabel = ''
  } else {
    from = new Date(to.getTime() - preset.days * DAY_MS)
    prevFrom = new Date(from.getTime() - preset.days * DAY_MS)
    prevTo = from
    comparisonLabel = `the previous ${preset.days} days`
  }
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS))
  const granularity = opts.granularity ?? autoGranularity(days)

  const [ledger, prevLedger, priorBuyerRows, products, customers, orders, carts] = await Promise.all([
    loadLedger(from, to),
    prevFrom ? loadLedger(prevFrom, prevTo) : Promise.resolve([] as LedgerRow[]),
    prisma.stockMovement.findMany({
      where: { createdAt: { lt: from }, direction: 'OUT', reason: { in: SALE_REASONS } },
      select: { counterparty: true, order: { select: { guestEmail: true } } },
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        basePriceKes: true,
        salePriceKes: true,
        costPriceKes: true,
        stockQty: true,
        lowStockThreshold: true,
        categories: { select: { category: { select: { id: true, name: true, parentId: true } } } },
        variants: {
          select: {
            stockQty: true,
            priceKes: true,
            salePriceKes: true,
            optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
          },
        },
      },
    }),
    prisma.customer.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        source: true,
        location: true,
        createdAt: true,
      },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        totalKes: true,
        guestEmail: true,
        guestPhone: true,
        user: { select: { name: true, email: true } },
        customer: { select: { firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.cart.findMany({
      where: { items: { some: {} } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        email: true,
        sessionId: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
        items: {
          select: {
            quantity: true,
            product: { select: { id: true, name: true, slug: true, basePriceKes: true, salePriceKes: true } },
            variant: {
              select: {
                priceKes: true,
                salePriceKes: true,
                optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
              },
            },
          },
        },
      },
    }),
  ])

  // ---- time series
  const buckets: Bucket[] = []
  const bucketIndex = new Map<number, number>()
  for (let t = bucketStart(from, granularity); t < to; t = nextBucket(t, granularity)) {
    bucketIndex.set(t.getTime(), buckets.length)
    buckets.push({
      key: t.toISOString(),
      label: bucketLabel(t, granularity),
      start: t.toISOString(),
      revenueKes: 0,
      costKes: 0,
      profitKes: 0,
      unitsSold: 0,
      transactions: 0,
      onlineRevenueKes: 0,
      manualRevenueKes: 0,
      unitsIn: 0,
      restockSpendKes: 0,
      unitsOutByReason: {},
      buyers: 0,
    })
  }
  const bucketTx = buckets.map(() => new Set<string>())
  const bucketBuyers = buckets.map(() => new Set<string>())
  const reasonTotals = new Map<string, number>()

  // ---- per-product accumulators
  const bucketCount = buckets.length
  const byProduct = new Map<
    string,
    { units: number; revenue: number; cost: number; last: Date | null; firstHalf: number; secondHalf: number; spark: number[] }
  >()
  const midpoint = from.getTime() + (to.getTime() - from.getTime()) / 2
  const sizes = new Map<string, number>()
  const weekday = WEEKDAYS.map((name) => ({ name, revenueKes: 0, unitsSold: 0 }))
  const daily = new Map<string, { units: number; revenueKes: number }>()
  const buyerRevenue = new Map<string, { name: string; value: number; units: number }>()

  for (const m of ledger) {
    const bi = bucketIndex.get(bucketStart(m.createdAt, granularity).getTime())
    const b = bi === undefined ? null : buckets[bi]

    if (m.direction === 'IN') {
      if (b) {
        b.unitsIn += m.quantity
        b.restockSpendKes += (m.unitCostKes ?? 0) * m.quantity
      }
      continue
    }

    const reasonLabel = OUT_REASON_LABELS[m.reason as keyof typeof OUT_REASON_LABELS] ?? m.reason
    reasonTotals.set(reasonLabel, (reasonTotals.get(reasonLabel) ?? 0) + m.quantity)
    if (b) b.unitsOutByReason[reasonLabel] = (b.unitsOutByReason[reasonLabel] ?? 0) + m.quantity

    if (!isSale(m)) continue

    const revenue = saleRevenueKes(m)
    const cost = unitCost(m) * m.quantity
    if (b && bi !== undefined) {
      b.revenueKes += revenue
      b.costKes += cost
      b.profitKes += revenue - cost
      b.unitsSold += m.quantity
      if (m.reason === 'ONLINE_SALE') b.onlineRevenueKes += revenue
      else b.manualRevenueKes += revenue
      bucketTx[bi].add(transactionKey(m))
      const bk = buyerKey(m)
      if (bk) bucketBuyers[bi].add(bk)
    }

    const p = byProduct.get(m.productId) ?? {
      units: 0,
      revenue: 0,
      cost: 0,
      last: null,
      firstHalf: 0,
      secondHalf: 0,
      spark: new Array(bucketCount).fill(0),
    }
    p.units += m.quantity
    p.revenue += revenue
    p.cost += cost
    if (!p.last || m.createdAt > p.last) p.last = m.createdAt
    if (m.createdAt.getTime() < midpoint) p.firstHalf += m.quantity
    else p.secondHalf += m.quantity
    if (bi !== undefined) p.spark[bi] += m.quantity
    byProduct.set(m.productId, p)

    const size = sizeOf(m)
    if (size) sizes.set(size, (sizes.get(size) ?? 0) + m.quantity)

    const wd = weekday[weekdayIndex(m.createdAt)]
    wd.revenueKes += revenue
    wd.unitsSold += m.quantity

    const dk = dayKey(m.createdAt)
    const d = daily.get(dk) ?? { units: 0, revenueKes: 0 }
    d.units += m.quantity
    d.revenueKes += revenue
    daily.set(dk, d)

    const bk = buyerKey(m)
    if (bk) {
      const e = buyerRevenue.get(bk) ?? { name: m.counterparty ?? m.order?.guestEmail ?? bk, value: 0, units: 0 }
      e.value += revenue
      e.units += m.quantity
      buyerRevenue.set(bk, e)
    }
  }
  buckets.forEach((b, i) => {
    b.transactions = bucketTx[i].size
    b.buyers = bucketBuyers[i].size
  })

  // ---- products
  const productRows: ProductVelocity[] = products.map((prod) => {
    const s = byProduct.get(prod.id)
    const stockQty =
      prod.variants.length > 0 ? prod.variants.reduce((sum, v) => sum + Math.max(0, v.stockQty), 0) : Math.max(0, prod.stockQty)
    const units = s?.units ?? 0
    const unitsPerDay = units / days
    const daysOfCover = unitsPerDay > 0 ? stockQty / unitsPerDay : null
    const leaf =
      prod.categories.find((c) => c.category.parentId !== null)?.category ?? prod.categories[0]?.category ?? null
    const trendPct = s && s.firstHalf > 0 ? ((s.secondHalf - s.firstHalf) / s.firstHalf) * 100 : s && s.secondHalf > 0 ? 100 : null
    const row = {
      productId: prod.id,
      name: prod.name,
      category: leaf?.name ?? 'Uncategorized',
      unitsSold: units,
      revenueKes: s?.revenue ?? 0,
      profitKes: (s?.revenue ?? 0) - (s?.cost ?? 0),
      marginPct: s && s.revenue > 0 ? ((s.revenue - s.cost) / s.revenue) * 100 : null,
      avgPriceKes: units > 0 ? (s?.revenue ?? 0) / units : null,
      listPriceKes: prod.salePriceKes ?? prod.basePriceKes,
      unitsPerWeek: unitsPerDay * 7,
      stockQty,
      stockCostKes: stockQty * (prod.costPriceKes ?? 0),
      daysOfCover,
      sellThroughPct: units + stockQty > 0 ? (units / (units + stockQty)) * 100 : 0,
      lastSoldAt: s?.last?.toISOString() ?? null,
      daysSinceLastSale: s?.last ? Math.floor((now.getTime() - s.last.getTime()) / DAY_MS) : null,
      trendPct,
      spark: s?.spark ?? new Array(bucketCount).fill(0),
    }
    return { ...row, velocityClass: classify(row) }
  })
  productRows.sort((a, b) => b.revenueKes - a.revenueKes || b.unitsSold - a.unitsSold)

  // ---- categories (leaf categories, so a product is not double-counted under its parent)
  const catMap = new Map<string, { name: string; revenueKes: number; profitKes: number; unitsSold: number }>()
  for (const p of productRows) {
    if (p.unitsSold === 0) continue
    const c = catMap.get(p.category) ?? { name: p.category, revenueKes: 0, profitKes: 0, unitsSold: 0 }
    c.revenueKes += p.revenueKes
    c.profitKes += p.profitKes
    c.unitsSold += p.unitsSold
    catMap.set(p.category, c)
  }

  // ---- buyers
  const priorBuyers = new Set(
    priorBuyerRows.map((r) => (r.counterparty ?? r.order?.guestEmail ?? '').trim().toLowerCase()).filter(Boolean),
  )
  const buyerDays = new Map<string, Set<string>>()
  for (const m of ledger) {
    if (!isSale(m)) continue
    const bk = buyerKey(m)
    if (!bk) continue
    const set = buyerDays.get(bk) ?? new Set<string>()
    set.add(dayKey(m.createdAt))
    buyerDays.set(bk, set)
  }
  let newBuyers = 0
  let returningBuyers = 0
  let repeatWithinRange = 0
  for (const [bk, ds] of buyerDays) {
    if (priorBuyers.has(bk)) returningBuyers++
    else newBuyers++
    if (ds.size > 1) repeatWithinRange++
  }

  // ---- inventory
  let invUnits = 0
  let invCost = 0
  let invRetail = 0
  let skus = 0
  let outSkus = 0
  let lowSkus = 0
  const categoryOf = new Map(productRows.map((p) => [p.productId, p.category]))
  const lowSkuRows: SkuRow[] = []
  const outSkuRows: SkuRow[] = []
  const stockByCategory = new Map<string, { name: string; units: number; costKes: number; retailKes: number }>()
  const topStock: AnalyticsDetails['topStock'] = []
  const sizeStock = new Map<string, number>()
  for (const prod of products) {
    const threshold = effectiveLowStockThreshold(prod)
    const list = prod.salePriceKes ?? prod.basePriceKes
    const units =
      prod.variants.length > 0 ? prod.variants : [{ stockQty: prod.stockQty, priceKes: null, salePriceKes: null, optionValues: [] }]
    const ps = { productId: prod.id, name: prod.name, units: 0, costKes: 0, retailKes: 0 }
    for (const v of units) {
      const q = Math.max(0, v.stockQty)
      const sku = { productId: prod.id, name: prod.name, variant: variantLabel(v.optionValues), stockQty: q, threshold }
      skus++
      if (q === 0) {
        outSkus++
        outSkuRows.push(sku)
      } else if (q <= threshold) {
        lowSkus++
        lowSkuRows.push(sku)
      }
      const cost = q * (prod.costPriceKes ?? 0)
      const retail = q * (v.salePriceKes ?? v.priceKes ?? list)
      invUnits += q
      invCost += cost
      invRetail += retail
      ps.units += q
      ps.costKes += cost
      ps.retailKes += retail
      const size = sizeFrom(v.optionValues)
      if (size && q > 0) sizeStock.set(size, (sizeStock.get(size) ?? 0) + q)
    }
    if (ps.units > 0) topStock.push(ps)
    const cat = categoryOf.get(prod.id) ?? 'Uncategorized'
    tally(stockByCategory, cat, () => ({ name: cat, units: 0, costKes: 0, retailKes: 0 }), (e) => {
      e.units += ps.units
      e.costKes += ps.costKes
      e.retailKes += ps.retailKes
    })
  }
  const coverBins: Array<{ name: string; test: (p: ProductVelocity) => boolean }> = [
    { name: 'Out of stock', test: (p) => p.stockQty === 0 },
    { name: '< 2 wks', test: (p) => p.daysOfCover !== null && p.daysOfCover < 14 },
    { name: '2–4 wks', test: (p) => p.daysOfCover !== null && p.daysOfCover >= 14 && p.daysOfCover < 30 },
    { name: '1–3 mo', test: (p) => p.daysOfCover !== null && p.daysOfCover >= 30 && p.daysOfCover < 90 },
    { name: '3–6 mo', test: (p) => p.daysOfCover !== null && p.daysOfCover >= 90 && p.daysOfCover < 180 },
    { name: '6 mo +', test: (p) => p.daysOfCover !== null && p.daysOfCover >= 180 },
    { name: 'No sales', test: (p) => p.stockQty > 0 && p.daysOfCover === null },
  ]

  // ---- pareto
  const sold = productRows.filter((p) => p.revenueKes > 0)
  const totalRev = sold.reduce((s, p) => s + p.revenueKes, 0)
  let running = 0
  let productsFor80Pct = 0
  for (const p of sold) {
    running += p.revenueKes
    productsFor80Pct++
    if (running >= totalRev * 0.8) break
  }

  // ---- orders
  const statusCounts = new Map<OrderStatus, number>()
  for (const o of orders) statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1)
  const paid = orders.filter((o) => o.paymentStatus === 'PAID')

  const countBy = (values: Array<string | null>) => {
    const map = new Map<string, number>()
    for (const v of values) {
      const k = v?.trim() || 'Unknown'
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }

  // ---- carts
  let cartUnits = 0
  let cartValue = 0
  const cartDetails = await loadCartDetails(carts, customers)
  for (const c of cartDetails) {
    cartUnits += c.units
    cartValue += c.valueKes
  }

  // ---- drill-down details (one more pass over the ledger)
  const productName = new Map(products.map((p) => [p.id, p.name]))
  const nameOf = (id: string) => productName.get(id) ?? 'Unknown product'
  const productAmount = (id: string): ProductAmount => ({ productId: id, name: nameOf(id), units: 0, valueKes: 0, count: 0 })
  const channelMap = new Map<
    string,
    { revenueKes: number; profitKes: number; unitsSold: number; tx: Set<string>; buyers: Set<string>; discountKes: number; products: Map<string, number> }
  >()
  const discountByProduct = new Map<string, ProductAmount>()
  const discountByBuyer = new Map<string, Named>()
  let discountTotal = 0
  let discountGross = 0
  let discountLines = 0
  const belowCost = new Map<string, ProductAmount & { costKes: number }>()
  const variantMap = new Map<string, AnalyticsDetails['variants'][number]>()
  const basketMap = new Map<string, Basket & { last: number }>()
  const buyerDetail = new Map<
    string,
    { name: string; revenueKes: number; units: number; days: Set<string>; last: Date; channels: Set<string> }
  >()
  const buyerRevenueSplit = { newKes: 0, returningKes: 0, anonymousKes: 0 }
  const restockByProduct = new Map<string, ProductAmount>()
  const restockBySupplier = new Map<string, Named>()
  const restockRecent: AnalyticsDetails['restocks']['recent'] = []
  const giveReason = new Map<string, { name: string; units: number; costKes: number }>()
  const giveProduct = new Map<string, ProductAmount>()
  const giveRecipient = new Map<string, { name: string; reason: string; units: number; costKes: number }>()
  const outReasonProducts = new Map<string, Map<string, number>>()
  const dayTx = new Map<string, Set<string>>()
  const sizeRevenue = new Map<string, number>()

  for (const m of ledger) {
    const q = m.quantity
    if (m.direction === 'IN') {
      const spend = (m.unitCostKes ?? 0) * q
      tally(restockByProduct, m.productId, () => productAmount(m.productId), (e) => {
        e.units += q
        e.valueKes += spend
        e.count = (e.count ?? 0) + 1
      })
      const supplier = m.supplier?.trim() || 'Not recorded'
      tally(restockBySupplier, supplier, () => ({ name: supplier, value: 0, secondary: 0 }), (e) => {
        e.value += spend
        e.secondary = (e.secondary ?? 0) + q
      })
      restockRecent.push({
        productId: m.productId,
        name: nameOf(m.productId),
        variant: variantLabel(m.variant?.optionValues),
        units: q,
        unitCostKes: m.unitCostKes,
        supplier: m.supplier,
        at: m.createdAt.toISOString(),
      })
      continue
    }

    const reasonLabel = OUT_REASON_LABELS[m.reason as keyof typeof OUT_REASON_LABELS] ?? m.reason
    const rp = outReasonProducts.get(reasonLabel) ?? new Map<string, number>()
    rp.set(m.productId, (rp.get(m.productId) ?? 0) + q)
    outReasonProducts.set(reasonLabel, rp)

    if (!isSale(m)) {
      if (!GIVEAWAY_REASONS.includes(m.reason)) continue
      const cost = unitCost(m) * q
      tally(giveReason, reasonLabel, () => ({ name: reasonLabel, units: 0, costKes: 0 }), (e) => {
        e.units += q
        e.costKes += cost
      })
      tally(giveProduct, m.productId, () => productAmount(m.productId), (e) => {
        e.units += q
        e.valueKes += cost
      })
      const who = m.counterparty?.trim() || 'Not recorded'
      tally(giveRecipient, `${reasonLabel}|${who.toLowerCase()}`, () => ({ name: who, reason: reasonLabel, units: 0, costKes: 0 }), (e) => {
        e.units += q
        e.costKes += cost
      })
      continue
    }

    const revenue = saleRevenueKes(m)
    const cost = unitCost(m) * q
    const gross = (m.unitPriceKes ?? 0) * q
    const discount = Math.min(gross, m.discountKes ?? 0)
    const bk = buyerKey(m)
    const buyerName = m.counterparty ?? m.order?.guestEmail ?? null
    const tk = transactionKey(m)
    const dk = dayKey(m.createdAt)

    tally(
      channelMap,
      reasonLabel,
      () => ({ revenueKes: 0, profitKes: 0, unitsSold: 0, tx: new Set(), buyers: new Set(), discountKes: 0, products: new Map() }),
      (e) => {
        e.revenueKes += revenue
        e.profitKes += revenue - cost
        e.unitsSold += q
        e.tx.add(tk)
        if (bk) e.buyers.add(bk)
        e.discountKes += discount
        e.products.set(m.productId, (e.products.get(m.productId) ?? 0) + revenue)
      },
    )

    if (discount > 0) {
      discountTotal += discount
      discountGross += gross
      discountLines++
      tally(discountByProduct, m.productId, () => productAmount(m.productId), (e) => {
        e.units += q
        e.valueKes += discount
        e.count = (e.count ?? 0) + 1
      })
      const label = buyerName ?? 'Unnamed buyer'
      tally(discountByBuyer, bk ?? '', () => ({ name: label, value: 0, secondary: 0 }), (e) => {
        e.value += discount
        e.secondary = (e.secondary ?? 0) + 1
      })
    }

    if (revenue < cost) {
      tally(belowCost, m.productId, () => ({ ...productAmount(m.productId), costKes: 0 }), (e) => {
        e.units += q
        e.valueKes += revenue
        e.costKes += cost
      })
    }

    tally(
      variantMap,
      `${m.productId}|${m.variantId ?? ''}`,
      () => ({
        productId: m.productId,
        name: nameOf(m.productId),
        variant: variantLabel(m.variant?.optionValues),
        unitsSold: 0,
        revenueKes: 0,
        stockQty: m.variant ? Math.max(0, m.variant.stockQty) : null,
      }),
      (e) => {
        e.unitsSold += q
        e.revenueKes += revenue
      },
    )

    tally(
      basketMap,
      tk,
      () => ({ key: tk, buyer: buyerName, date: dk, channels: [], units: 0, lines: 0, valueKes: 0, orders: [], last: 0 }),
      (e) => {
        e.units += q
        e.lines++
        e.valueKes += revenue
        e.last = Math.max(e.last, m.createdAt.getTime())
        if (!e.channels.includes(reasonLabel)) e.channels.push(reasonLabel)
        if (m.order && !e.orders.some((o) => o.id === m.order!.id)) e.orders.push({ id: m.order.id, orderNumber: m.order.orderNumber })
      },
    )

    if (bk) {
      tally(
        buyerDetail,
        bk,
        () => ({ name: buyerName ?? bk, revenueKes: 0, units: 0, days: new Set<string>(), last: m.createdAt, channels: new Set<string>() }),
        (e) => {
          e.revenueKes += revenue
          e.units += q
          e.days.add(dk)
          if (m.createdAt > e.last) e.last = m.createdAt
          e.channels.add(reasonLabel)
        },
      )
      if (priorBuyers.has(bk)) buyerRevenueSplit.returningKes += revenue
      else buyerRevenueSplit.newKes += revenue
    } else {
      buyerRevenueSplit.anonymousKes += revenue
    }

    const dt = dayTx.get(dk) ?? new Set<string>()
    dt.add(tk)
    dayTx.set(dk, dt)

    const size = sizeOf(m)
    if (size) sizeRevenue.set(size, (sizeRevenue.get(size) ?? 0) + revenue)
  }

  const baskets = Array.from(basketMap.values())
  const stripBasket = (b: Basket & { last: number }): Basket => ({ key: b.key, buyer: b.buyer, date: b.date, channels: b.channels, units: b.units, lines: b.lines, valueKes: b.valueKes, orders: b.orders })
  const band = <T>(items: T[], bands: Array<{ name: string; test: (x: T) => boolean }>) =>
    bands.map((bd) => ({ name: bd.name, value: items.filter(bd.test).length }))
  const productList = (map: Map<string, number>, limit = 5): Named[] =>
    Array.from(map, ([id, value]) => ({ name: nameOf(id), value }))
      .sort((x, y) => y.value - x.value)
      .slice(0, limit)

  const orderGroup = (key: (o: (typeof orders)[number]) => string) => {
    const map = new Map<string, { name: string; count: number; valueKes: number }>()
    for (const o of orders) {
      const k = titleCase(key(o))
      tally(map, k, () => ({ name: k, count: 0, valueKes: 0 }), (e) => {
        e.count++
        e.valueKes += o.totalKes
      })
    }
    return Array.from(map.values()).sort((x, y) => y.count - x.count)
  }
  const newCustomerRows = customers
    .filter((c) => c.createdAt >= from && c.createdAt < to)
    .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
  const allLocations = countBy(customers.map((c) => c.location))

  const details: AnalyticsDetails = {
    channels: Array.from(channelMap, ([name, c]) => ({
      name,
      revenueKes: c.revenueKes,
      profitKes: c.profitKes,
      unitsSold: c.unitsSold,
      transactions: c.tx.size,
      buyers: c.buyers.size,
      discountKes: c.discountKes,
      topProducts: productList(c.products),
    })).sort((x, y) => y.revenueKes - x.revenueKes),
    discounts: {
      totalKes: discountTotal,
      grossKes: discountGross,
      lines: discountLines,
      byProduct: Array.from(discountByProduct.values()).sort(byValueDesc).slice(0, 10),
      byBuyer: Array.from(discountByBuyer.values())
        .sort((x, y) => y.value - x.value)
        .slice(0, 10),
    },
    belowCost: Array.from(belowCost.values()).sort((x, y) => y.costKes - y.valueKes - (x.costKes - x.valueKes)),
    variants: Array.from(variantMap.values())
      .sort((x, y) => y.unitsSold - x.unitsSold || y.revenueKes - x.revenueKes)
      .slice(0, 15),
    baskets: {
      recent: [...baskets].sort((x, y) => y.last - x.last).slice(0, 12).map(stripBasket),
      largest: [...baskets].sort(byValueDesc).slice(0, 8).map(stripBasket),
      sizeBands: band(baskets, [
        { name: '1 unit', test: (b) => b.units === 1 },
        { name: '2 units', test: (b) => b.units === 2 },
        { name: '3–4 units', test: (b) => b.units >= 3 && b.units <= 4 },
        { name: '5+ units', test: (b) => b.units >= 5 },
      ]),
      valueBands: band(baskets, [
        { name: 'Under Ksh 1,000', test: (b) => b.valueKes < 1000 },
        { name: 'Ksh 1,000–2,999', test: (b) => b.valueKes >= 1000 && b.valueKes < 3000 },
        { name: 'Ksh 3,000–4,999', test: (b) => b.valueKes >= 3000 && b.valueKes < 5000 },
        { name: 'Ksh 5,000–9,999', test: (b) => b.valueKes >= 5000 && b.valueKes < 10000 },
        { name: 'Ksh 10,000+', test: (b) => b.valueKes >= 10000 },
      ]),
    },
    buyers: Array.from(buyerDetail, ([bk, b]) => ({
      name: b.name,
      revenueKes: b.revenueKes,
      units: b.units,
      baskets: b.days.size,
      lastAt: b.last.toISOString(),
      returning: priorBuyers.has(bk),
      channels: Array.from(b.channels),
    }))
      .sort((x, y) => y.revenueKes - x.revenueKes)
      .slice(0, 25),
    buyerRevenueSplit,
    restocks: {
      byProduct: Array.from(restockByProduct.values())
        .sort((x, y) => y.valueKes - x.valueKes || y.units - x.units)
        .slice(0, 10),
      bySupplier: Array.from(restockBySupplier.values()).sort((x, y) => y.value - x.value),
      recent: restockRecent.reverse().slice(0, 10),
    },
    giveaways: {
      byReason: Array.from(giveReason.values()).sort((x, y) => y.costKes - x.costKes),
      byProduct: Array.from(giveProduct.values()).sort(byValueDesc).slice(0, 10),
      byRecipient: Array.from(giveRecipient.values())
        .sort((x, y) => y.costKes - x.costKes)
        .slice(0, 10),
    },
    outReasonProducts: Object.fromEntries(Array.from(outReasonProducts, ([r, map]) => [r, productList(map)])),
    skus: {
      low: lowSkuRows.sort((x, y) => x.stockQty - y.stockQty),
      out: outSkuRows.sort((x, y) => x.name.localeCompare(y.name)),
    },
    stockByCategory: Array.from(stockByCategory.values())
      .filter((c) => c.units > 0)
      .sort((x, y) => y.costKes - x.costKes),
    topStock: topStock.sort((x, y) => y.costKes - x.costKes).slice(0, 10),
    sizeTable: Array.from(new Set([...sizes.keys(), ...sizeStock.keys()]))
      .sort(compareSizes)
      .map((name) => ({ name, unitsSold: sizes.get(name) ?? 0, revenueKes: sizeRevenue.get(name) ?? 0, inStock: sizeStock.get(name) ?? 0 })),
    topDays: Array.from(daily, ([date, d]) => ({ date, revenueKes: d.revenueKes, units: d.units, transactions: dayTx.get(date)?.size ?? 0 }))
      .sort((x, y) => y.revenueKes - x.revenueKes)
      .slice(0, 10),
    categoryProducts: Object.fromEntries(
      Array.from(catMap.keys(), (cat) => [
        cat,
        productRows
          .filter((p) => p.category === cat && p.unitsSold > 0)
          .slice(0, 5)
          .map((p) => ({ productId: p.productId, name: p.name, units: p.unitsSold, valueKes: p.revenueKes })),
      ]),
    ),
    orders: {
      recent: orders.slice(0, 15).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        at: o.createdAt.toISOString(),
        status: titleCase(o.status),
        paymentStatus: titleCase(o.paymentStatus),
        totalKes: o.totalKes,
        who:
          o.user?.name ||
          (o.customer ? `${o.customer.firstName} ${o.customer.lastName ?? ''}`.trim() : '') ||
          o.guestEmail ||
          o.user?.email ||
          o.guestPhone ||
          'Guest',
        items: o._count.items,
      })),
      byStatus: orderGroup((o) => o.status),
      byPayment: orderGroup((o) => o.paymentStatus),
    },
    newCustomers: {
      total: newCustomerRows.length,
      bySource: countBy(newCustomerRows.map((c) => c.source)),
      recent: newCustomerRows.slice(0, 10).map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName ?? ''}`.trim(),
        source: c.source,
        location: c.location,
        at: c.createdAt.toISOString(),
      })),
    },
    allLocations: allLocations.filter((l) => l.name !== 'Unknown'),
    unknownLocations: allLocations.find((l) => l.name === 'Unknown')?.value ?? 0,
    carts: cartDetails,
  }

  const allDays: Array<{ date: string; units: number; revenueKes: number }> = []
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
    const k = dayKey(new Date(t))
    allDays.push({ date: k, ...(daily.get(k) ?? { units: 0, revenueKes: 0 }) })
  }

  return {
    range: {
      key: opts.range,
      label,
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      calendar,
      comparisonLabel,
    },
    availableYears,
    granularity,
    kpis: summarize(ledger),
    prevKpis: prevFrom ? summarize(prevLedger) : null,
    series: buckets,
    reasonKeys: Object.values(OUT_REASON_LABELS).filter((r) => reasonTotals.has(r)),
    outByReason: Array.from(reasonTotals, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    products: productRows,
    categories: Array.from(catMap.values()).sort((a, b) => b.revenueKes - a.revenueKes),
    sizes: Array.from(sizes, ([name, value]) => ({ name, value })).sort((a, b) => compareSizes(a.name, b.name)),
    weekday,
    daily: allDays,
    topBuyers: Array.from(buyerRevenue.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((b) => ({ name: b.name, value: b.value, secondary: b.units })),
    buyerMix: { newBuyers, returningBuyers, repeatWithinRange },
    customerSources: countBy(customers.map((c) => c.source)),
    customerLocations: countBy(customers.map((c) => c.location)).filter((l) => l.name !== 'Unknown').slice(0, 10),
    orderStatus: Array.from(statusCounts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    orderTotals: {
      count: orders.length,
      paidCount: paid.length,
      paidRevenueKes: paid.reduce((s, o) => s + o.totalKes, 0),
    },
    inventory: {
      units: invUnits,
      costValueKes: invCost,
      retailValueKes: invRetail,
      skus,
      outOfStockSkus: outSkus,
      lowStockSkus: lowSkus,
      deadStockCostKes: productRows.filter((p) => p.velocityClass === 'dead').reduce((s, p) => s + p.stockCostKes, 0),
      coverHistogram: coverBins.map((bin) => ({ name: bin.name, value: productRows.filter(bin.test).length })),
    },
    openCarts: { count: carts.length, units: cartUnits, valueKes: cartValue },
    pareto: { productsFor80Pct, totalProductsSold: sold.length },
    details,
  }
}
