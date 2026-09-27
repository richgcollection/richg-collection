import 'server-only'
import type { OrderStatus, StockMovementReason } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { effectiveLowStockThreshold } from '@/lib/inventory'

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
  range: { key: RangeKey; label: string; from: string; to: string; days: number }
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
      direction: true,
      reason: true,
      quantity: true,
      unitCostKes: true,
      unitPriceKes: true,
      counterparty: true,
      createdAt: true,
      order: { select: { guestEmail: true } },
      product: { select: { costPriceKes: true } },
      variant: {
        select: {
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
      const revenue = (m.unitPriceKes ?? 0) * m.quantity
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

function sizeOf(m: LedgerRow): string | null {
  const ov = m.variant?.optionValues.find((v) => /size/i.test(v.optionValue.option.name))
  return ov ? ov.optionValue.value.toUpperCase().replace(/s*,s*/g, ' / ') : null
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', '4XL', '5XL']
function compareSizes(a: string, b: string) {
  const ia = SIZE_ORDER.indexOf(a)
  const ib = SIZE_ORDER.indexOf(b)
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a.localeCompare(b)
}

function classify(p: { unitsSold: number; stockQty: number; daysOfCover: number | null }): VelocityClass {
  if (p.unitsSold === 0) return 'dead'
  if (p.stockQty <= 0) return 'stockout'
  const cover = p.daysOfCover ?? Infinity
  if (cover <= 30) return 'fast'
  if (cover <= 90) return 'steady'
  return 'slow'
}

// ---------------------------------------------------------------- main

export async function getAnalytics(opts: { range: RangeKey; granularity?: Granularity }): Promise<Analytics> {
  const now = new Date()
  const to = new Date(startOfEatDay(now).getTime() + DAY_MS) // end of today, exclusive
  const preset = RANGE_PRESETS[opts.range]

  let from: Date
  if (preset.days === null) {
    const first = await prisma.stockMovement.aggregate({ _min: { createdAt: true } })
    from = startOfEatDay(first._min.createdAt ?? new Date(to.getTime() - 30 * DAY_MS))
  } else {
    from = new Date(to.getTime() - preset.days * DAY_MS)
  }
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS))
  const granularity = opts.granularity ?? autoGranularity(days)
  const prevFrom = preset.days === null ? null : new Date(from.getTime() - preset.days * DAY_MS)

  const [ledger, prevLedger, priorBuyerRows, products, customers, orders, carts] = await Promise.all([
    loadLedger(from, to),
    prevFrom ? loadLedger(prevFrom, from) : Promise.resolve([] as LedgerRow[]),
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
        variants: { select: { stockQty: true, priceKes: true, salePriceKes: true } },
      },
    }),
    prisma.customer.findMany({ select: { source: true, location: true } }),
    prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { status: true, paymentStatus: true, totalKes: true },
    }),
    prisma.cart.findMany({
      where: { items: { some: {} } },
      select: {
        items: {
          select: {
            quantity: true,
            product: { select: { basePriceKes: true, salePriceKes: true } },
            variant: { select: { priceKes: true, salePriceKes: true } },
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

    const revenue = (m.unitPriceKes ?? 0) * m.quantity
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
  for (const prod of products) {
    const threshold = effectiveLowStockThreshold(prod)
    const list = prod.salePriceKes ?? prod.basePriceKes
    const units = prod.variants.length > 0 ? prod.variants : [{ stockQty: prod.stockQty, priceKes: null, salePriceKes: null }]
    for (const v of units) {
      const q = Math.max(0, v.stockQty)
      skus++
      if (q === 0) outSkus++
      else if (q <= threshold) lowSkus++
      invUnits += q
      invCost += q * (prod.costPriceKes ?? 0)
      invRetail += q * (v.salePriceKes ?? v.priceKes ?? list)
    }
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

  // ---- carts
  let cartUnits = 0
  let cartValue = 0
  for (const c of carts) {
    for (const it of c.items) {
      const price =
        it.variant?.salePriceKes ?? it.variant?.priceKes ?? it.product.salePriceKes ?? it.product.basePriceKes
      cartUnits += it.quantity
      cartValue += price * it.quantity
    }
  }

  const countBy = (values: Array<string | null>) => {
    const map = new Map<string, number>()
    for (const v of values) {
      const k = v?.trim() || 'Unknown'
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }

  const allDays: Array<{ date: string; units: number; revenueKes: number }> = []
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
    const k = dayKey(new Date(t))
    allDays.push({ date: k, ...(daily.get(k) ?? { units: 0, revenueKes: 0 }) })
  }

  return {
    range: { key: opts.range, label: preset.label, from: from.toISOString(), to: to.toISOString(), days },
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
  }
}
