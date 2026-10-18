import type { OrderStatus, PaymentStatus } from '@prisma/client'

/** Orders in these statuses hold no stock: moving an order into one returns what it deducted. */
export const STOCK_RETURNED_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'REFUNDED', 'FAILED']

export function isStockReturnedStatus(status: OrderStatus): boolean {
  return STOCK_RETURNED_STATUSES.includes(status)
}

/** Net units an order's linked StockMovements have taken out of stock. */
export function netDeductedUnits(movements: { direction: 'IN' | 'OUT'; quantity: number }[]): number {
  return movements.reduce((sum, m) => sum + (m.direction === 'OUT' ? m.quantity : -m.quantity), 0)
}

function units(n: number) {
  return n === 1 ? '1 unit' : `${n} units`
}

/**
 * Describes what a status change will do to stock, mirroring
 * updateOrderStatusAction. `linkedUnits` is the net quantity the order
 * currently has deducted; `itemUnits` the total quantity on its lines.
 */
export function statusChangeStockNote(input: {
  from: OrderStatus
  to: OrderStatus
  paymentStatus: PaymentStatus
  linkedUnits: number
  itemUnits: number
}): string | null {
  const wasReturned = isStockReturnedStatus(input.from)
  const isReturned = isStockReturnedStatus(input.to)
  if (!wasReturned && isReturned && input.linkedUnits > 0) {
    return `This returns ${units(input.linkedUnits)} to stock and removes the sale from analytics.`
  }
  if (wasReturned && !isReturned && input.paymentStatus === 'PAID' && input.linkedUnits === 0 && input.itemUnits > 0) {
    return `This deducts ${units(input.itemUnits)} from stock again.`
  }
  return null
}
