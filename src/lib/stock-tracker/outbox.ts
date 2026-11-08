import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { SHEET_NAMES, SHEET_TYPE_BY_REASON, SITE_ID_COLUMN, dayKey, sheetProduct, str } from '@/lib/stock-tracker/mapping'

/**
 * Site → sheet: stock entries made on the site (paid online orders, admin
 * stock in/out) that haven't been written to the sheet yet. The Apps Script
 * appends each as a row (with its SITE ID) and then acknowledges them, which
 * stamps `sheetExportedAt` so they aren't sent again.
 */

export type OutboxRow = { id: string; sheet: string; values: Record<string, string | number | null> }

const OUTBOX_WHERE: Prisma.StockMovementWhereInput = {
  sheetExportedAt: null,
  reason: { in: ['RESTOCK', 'MANUAL_SALE', 'ONLINE_SALE', 'INFLUENCER', 'REWARD', 'DAMAGE'] },
  OR: [{ orderId: { not: null } }, { createdById: { not: null } }],
}

function orderBuyer(order: { orderNumber: string; shippingAddress: unknown; customer: { firstName: string; lastName: string | null } | null }) {
  const address = order.shippingAddress as { fullName?: unknown } | null
  const name = order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}` : str(address?.fullName)
  return `${name.trim().toUpperCase() || 'ONLINE CUSTOMER'} (#${order.orderNumber})`
}

export async function listOutbox(): Promise<OutboxRow[]> {
  const entries = await prisma.stockMovement.findMany({
    where: OUTBOX_WHERE,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 200,
    select: {
      id: true, direction: true, reason: true, quantity: true, unitCostKes: true, unitPriceKes: true,
      discountKes: true, supplier: true, counterparty: true, createdAt: true,
      product: { select: { name: true, basePriceKes: true } },
      variant: { select: { optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } } } },
      order: { select: { orderNumber: true, shippingAddress: true, customer: { select: { firstName: true, lastName: true } } } },
    },
  })

  return entries.map((e) => {
    const p = sheetProduct(e.product.name)
    const size = e.variant?.optionValues.find((o) => o.optionValue.option.name === 'Size')?.optionValue.value ?? ''
    const common = {
      DATE: dayKey(e.createdAt),
      ITEM: p?.item ?? '',
      CATEGORY: p?.category ?? e.product.name.toUpperCase(),
      SIZE: size,
      COLOR: p?.color ?? '',
      [SITE_ID_COLUMN]: e.id,
    }
    if (e.direction === 'IN')
      return {
        id: e.id,
        sheet: SHEET_NAMES.in,
        values: { ...common, 'QUANTITY IN': e.quantity, 'COST PER UNIT': e.unitCostKes, SUPPIER: e.supplier?.toUpperCase() ?? null, 'SELLING COST': e.product.basePriceKes },
      }
    // What the buyer actually paid per unit, after any discount.
    const price = e.unitPriceKes == null ? 0 : Math.round((e.unitPriceKes * e.quantity - (e.discountKes ?? 0)) / e.quantity)
    return {
      id: e.id,
      sheet: SHEET_NAMES.out,
      values: {
        ...common,
        'QUANTITY OUT': e.quantity,
        TYPE: SHEET_TYPE_BY_REASON[e.reason] ?? e.reason,
        'CUSTOMER/ INFLUENCER': e.order ? orderBuyer(e.order) : (e.counterparty?.toUpperCase() ?? ''),
        'PRICE PER UNIT': price,
      },
    }
  })
}

/** Marks entries as written to the sheet. Only outbox entries are touched. */
export async function ackOutbox(ids: string[]) {
  if (!ids.length) return 0
  const { count } = await prisma.stockMovement.updateMany({
    where: { ...OUTBOX_WHERE, id: { in: ids } },
    data: { sheetExportedAt: new Date() },
  })
  return count
}
