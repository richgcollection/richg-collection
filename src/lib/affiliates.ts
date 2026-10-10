import 'server-only'
import { cookies } from 'next/headers'
import type { CommissionStatus, CommissionType, OrderStatus, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { REFERRAL_COOKIE, normalizeReferralCode } from '@/lib/referral'
import { computeCommissionKes, monthEndExclusive, monthKey, shiftMonth } from '@/lib/affiliate-terms'

type TxClient = Prisma.TransactionClient

/** Orders in these states earn nothing: their commissions are voided (and revived if the order recovers). */
export const VOIDING_ORDER_STATUSES: OrderStatus[] = ['CANCELLED', 'REFUNDED', 'FAILED']
const VOIDING_PAYMENT_STATUSES: PaymentStatus[] = ['REFUNDED', 'FAILED']
const MANUAL_VOID = 'MANUAL'

/** Database-side twin of LedgerCommission.effective. */
export const effectiveCommissionWhere = {
  status: { not: 'VOID' },
  order: { paymentStatus: 'PAID', status: { notIn: VOIDING_ORDER_STATUSES } },
} satisfies Prisma.AffiliateCommissionWhereInput

function orderVoidReason(order: { status: OrderStatus; paymentStatus: PaymentStatus }): string | null {
  if (VOIDING_PAYMENT_STATUSES.includes(order.paymentStatus)) return `ORDER_${order.paymentStatus}`
  if (VOIDING_ORDER_STATUSES.includes(order.status)) return `ORDER_${order.status}`
  return null
}

/** Readable, unique code like "JANE4821". */
export async function generateReferralCode(name: string, db: TxClient = prisma): Promise<string> {
  const base =
    name
      .normalize('NFKD')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 8) || 'RICHG'
  for (let attempt = 0; attempt < 10; attempt++) {
    const digits = attempt < 5 ? 4 : 6
    const suffix = String(Math.floor(Math.random() * 10 ** digits)).padStart(digits, '0')
    const code = `${base}${suffix}`
    if (!(await db.affiliate.findUnique({ where: { referralCode: code }, select: { id: true } }))) return code
  }
  return `${base}${crypto.randomUUID().split('-')[0].toUpperCase()}`
}

/**
 * Voids every live commission on an order. Order deletion doesn't need this
 * (commissions cascade with the order), but it's here for flows that keep the
 * order row, e.g. cancellations and refunds.
 */
export async function voidCommissionsForOrder(tx: TxClient, orderId: string, reason = 'ORDER_VOIDED') {
  await tx.affiliateCommission.updateMany({
    where: { orderId, status: { not: 'VOID' } },
    data: { status: 'VOID', voidReason: reason },
  })
}

/**
 * Brings an order's commission rows in line with its current state. Safe to
 * call repeatedly; call it inside the transaction that changes the order.
 *
 * - Not paid → nothing. Cancelled / refunded / failed → everything voided.
 * - Credit moved off an affiliate → their unpaid rows are deleted, paid-out rows voided (a clawback).
 * - Otherwise each line for a product assigned to the order's (ACTIVE) affiliate gets one row,
 *   with the commission terms snapshotted at that moment. Existing rows are never recalculated,
 *   and rows an admin voided by hand stay voided.
 * - A COMPLETED order approves its pending rows.
 */
export async function syncAffiliateCommissions(tx: TxClient, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      paymentStatus: true,
      affiliateId: true,
      items: { select: { id: true, productId: true, quantity: true, lineTotalKes: true } },
    },
  })
  if (!order) return

  const voidReason = orderVoidReason(order)
  if (voidReason) {
    await voidCommissionsForOrder(tx, orderId, voidReason)
    return
  }
  if (order.paymentStatus !== 'PAID') return

  const existing = await tx.affiliateCommission.findMany({
    where: { orderId },
    select: { id: true, affiliateId: true, orderItemId: true, status: true, voidReason: true, payoutId: true },
  })

  const stale = existing.filter((c) => c.affiliateId !== order.affiliateId)
  const staleUnpaid = stale.filter((c) => !c.payoutId).map((c) => c.id)
  const stalePaid = stale.filter((c) => c.payoutId && c.status !== 'VOID').map((c) => c.id)
  if (staleUnpaid.length > 0) await tx.affiliateCommission.deleteMany({ where: { id: { in: staleUnpaid } } })
  if (stalePaid.length > 0) {
    await tx.affiliateCommission.updateMany({
      where: { id: { in: stalePaid } },
      data: { status: 'VOID', voidReason: 'UNATTRIBUTED' },
    })
  }
  if (!order.affiliateId) return

  const current = existing.filter((c) => c.affiliateId === order.affiliateId)
  const revivable = current.filter((c) => c.status === 'VOID' && c.voidReason !== MANUAL_VOID).map((c) => c.id)
  if (revivable.length > 0) {
    await tx.affiliateCommission.updateMany({
      where: { id: { in: revivable } },
      data: { status: 'PENDING', voidReason: null },
    })
  }

  const affiliate = await tx.affiliate.findUnique({
    where: { id: order.affiliateId },
    select: {
      status: true,
      commissionType: true,
      commissionValue: true,
      products: {
        where: { productId: { in: order.items.map((item) => item.productId) } },
        select: { productId: true, commissionType: true, commissionValue: true },
      },
    },
  })

  if (affiliate?.status === 'ACTIVE') {
    const covered = new Set(current.map((c) => c.orderItemId))
    const assignments = new Map(affiliate.products.map((p) => [p.productId, p]))
    const periodMonth = monthKey()
    const rows: Prisma.AffiliateCommissionCreateManyInput[] = []

    for (const item of order.items) {
      const assignment = assignments.get(item.productId)
      if (!assignment || covered.has(item.id)) continue
      // A per-product override needs both parts; otherwise the affiliate's default applies.
      const hasOverride = assignment.commissionType !== null && assignment.commissionValue !== null
      const commissionType = hasOverride ? assignment.commissionType! : affiliate.commissionType
      const rateValue = hasOverride ? assignment.commissionValue! : affiliate.commissionValue
      rows.push({
        affiliateId: order.affiliateId,
        orderId,
        orderItemId: item.id,
        productId: item.productId,
        quantity: item.quantity,
        saleAmountKes: item.lineTotalKes,
        commissionType,
        rateValue,
        amountKes: computeCommissionKes({
          type: commissionType,
          value: rateValue,
          quantity: item.quantity,
          lineTotalKes: item.lineTotalKes,
        }),
        periodMonth,
      })
    }
    if (rows.length > 0) await tx.affiliateCommission.createMany({ data: rows, skipDuplicates: true })
  }

  if (order.status === 'COMPLETED') {
    await tx.affiliateCommission.updateMany({
      where: { orderId, affiliateId: order.affiliateId, status: 'PENDING' },
      data: { status: 'APPROVED' },
    })
  }
}

/**
 * Credits a freshly placed order to the affiliate in the visitor's referral
 * cookie. Never throws: a bad cookie must not break checkout. Affiliates
 * can't earn on their own purchases.
 */
export async function attributeOrderFromReferral(orderId: string) {
  try {
    const cookieStore = await cookies()
    const code = normalizeReferralCode(cookieStore.get(REFERRAL_COOKIE)?.value)
    if (!code) return

    const affiliate = await prisma.affiliate.findUnique({
      where: { referralCode: code },
      select: { id: true, status: true, email: true },
    })
    if (!affiliate || affiliate.status !== 'ACTIVE') return

    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { guestEmail: true } })
    if (!order || order.guestEmail?.trim().toLowerCase() === affiliate.email) return

    await prisma.order.updateMany({
      where: { id: orderId, affiliateId: null },
      data: { affiliateId: affiliate.id },
    })
  } catch (error) {
    console.error('Affiliate attribution failed', error)
  }
}

// ---------------------------------------------------------------------------
// Ledger: the single source for every affiliate figure, shared by the admin
// pages and the affiliate dashboard so both always show the same "owed".
// ---------------------------------------------------------------------------

export type CommissionDisplayStatus = CommissionStatus | 'PAID'

export type LedgerCommission = {
  id: string
  affiliateId: string
  orderId: string
  orderNumber: string
  orderCreatedAt: Date
  productName: string
  variantLabel: string | null
  quantity: number
  saleAmountKes: number
  commissionType: CommissionType
  rateValue: number
  amountKes: number
  status: CommissionStatus
  voidReason: string | null
  periodMonth: string
  payoutId: string | null
  /** Counts toward earnings: not voided and the order is still a good sale. */
  effective: boolean
  displayStatus: CommissionDisplayStatus
}

export type LedgerPayout = {
  id: string
  affiliateId: string
  periodMonth: string
  amountKes: number
  paidAt: Date
  reference: string | null
  note: string | null
}

export type Ledger = { commissions: LedgerCommission[]; payouts: LedgerPayout[] }

export async function getLedger(affiliateId?: string): Promise<Ledger> {
  const where = affiliateId ? { affiliateId } : {}
  const [commissions, payouts] = await Promise.all([
    prisma.affiliateCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        affiliateId: true,
        orderId: true,
        quantity: true,
        saleAmountKes: true,
        commissionType: true,
        rateValue: true,
        amountKes: true,
        status: true,
        voidReason: true,
        periodMonth: true,
        payoutId: true,
        // Only non-identifying order fields: this feeds the affiliate's own view.
        order: { select: { orderNumber: true, createdAt: true, status: true, paymentStatus: true } },
        orderItem: { select: { nameSnapshot: true, variantSnapshot: true } },
      },
    }),
    prisma.affiliatePayout.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      select: { id: true, affiliateId: true, periodMonth: true, amountKes: true, paidAt: true, reference: true, note: true },
    }),
  ])

  return {
    commissions: commissions.map(({ order, orderItem, ...c }) => {
      const effective = c.status !== 'VOID' && order.paymentStatus === 'PAID' && !orderVoidReason(order)
      return {
        ...c,
        orderNumber: order.orderNumber,
        orderCreatedAt: order.createdAt,
        productName: orderItem.nameSnapshot,
        variantLabel: orderItem.variantSnapshot,
        effective,
        displayStatus: !effective ? 'VOID' : c.payoutId ? 'PAID' : c.status,
      }
    }),
    payouts,
  }
}

export type PeriodStats = { orders: number; units: number; salesKes: number; earnedKes: number }

function periodStats(commissions: LedgerCommission[]): PeriodStats {
  const live = commissions.filter((c) => c.effective)
  return {
    orders: new Set(live.map((c) => c.orderId)).size,
    units: live.reduce((sum, c) => sum + c.quantity, 0),
    salesKes: live.reduce((sum, c) => sum + c.saleAmountKes, 0),
    earnedKes: live.reduce((sum, c) => sum + c.amountKes, 0),
  }
}

export type MonthStatement = PeriodStats & { month: string; paidKes: number; owedKes: number }

/** One row per month with activity, newest first. Owed = earned in that month − paid out against it. */
export function buildMonthlyStatement(ledger: Ledger): MonthStatement[] {
  const months = new Set([...ledger.commissions.map((c) => c.periodMonth), ...ledger.payouts.map((p) => p.periodMonth)])
  return [...months]
    .sort((a, b) => b.localeCompare(a))
    .map((month) => {
      const stats = periodStats(ledger.commissions.filter((c) => c.periodMonth === month))
      const paidKes = ledger.payouts.filter((p) => p.periodMonth === month).reduce((sum, p) => sum + p.amountKes, 0)
      return { month, ...stats, paidKes, owedKes: stats.earnedKes - paidKes }
    })
}

export type LedgerSummary = {
  thisMonth: PeriodStats
  lastMonth: PeriodStats
  lifetime: PeriodStats
  paidKes: number
  owedKes: number
}

export function summarizeLedger(ledger: Ledger, now = new Date()): LedgerSummary {
  const current = monthKey(now)
  const previous = shiftMonth(current, -1)
  const lifetime = periodStats(ledger.commissions)
  const paidKes = ledger.payouts.reduce((sum, p) => sum + p.amountKes, 0)
  return {
    thisMonth: periodStats(ledger.commissions.filter((c) => c.periodMonth === current)),
    lastMonth: periodStats(ledger.commissions.filter((c) => c.periodMonth === previous)),
    lifetime,
    paidKes,
    owedKes: lifetime.earnedKes - paidKes,
  }
}

export type MonthEndPosition = PeriodStats & {
  /** Earned in all months up to and including `month`. */
  earnedToDateKes: number
  /** Paid out on or before the last day of `month`. */
  paidToDateKes: number
  owedAtMonthEndKes: number
}

/** What the business owed the affiliate when `month` closed, plus that month's own activity. */
export function positionAtMonthEnd(ledger: Ledger, month: string): MonthEndPosition {
  const end = monthEndExclusive(month).getTime()
  const earnedToDateKes = periodStats(ledger.commissions.filter((c) => c.periodMonth <= month)).earnedKes
  const paidToDateKes = ledger.payouts.filter((p) => p.paidAt.getTime() < end).reduce((sum, p) => sum + p.amountKes, 0)
  return {
    ...periodStats(ledger.commissions.filter((c) => c.periodMonth === month)),
    earnedToDateKes,
    paidToDateKes,
    owedAtMonthEndKes: earnedToDateKes - paidToDateKes,
  }
}

/** Splits a combined ledger into one per affiliate. */
export function ledgersByAffiliate(ledger: Ledger): Map<string, Ledger> {
  const map = new Map<string, Ledger>()
  const get = (id: string) => {
    let entry = map.get(id)
    if (!entry) map.set(id, (entry = { commissions: [], payouts: [] }))
    return entry
  }
  for (const c of ledger.commissions) get(c.affiliateId).commissions.push(c)
  for (const p of ledger.payouts) get(p.affiliateId).payouts.push(p)
  return map
}
