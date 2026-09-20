import 'server-only'
import type { Prisma, StockDirection, StockMovementReason } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const DEFAULT_LOW_STOCK_THRESHOLD = 5

export function effectiveLowStockThreshold(product: { lowStockThreshold: number | null }): number {
  return product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD
}

type TxClient = Prisma.TransactionClient

/**
 * Decrements stock for a paid order and records one ONLINE_SALE StockMovement
 * per line item, snapshotting the product's cost price so profit can be
 * computed later even if the cost price changes afterwards. Shared by the
 * Paystack webhook and the "mark paid manually" admin action so stock is
 * never decremented without a matching ledger entry.
 */
export async function applyOrderStockOut(tx: TxClient, orderId: string) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { product: { select: { costPriceKes: true } } },
  })

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

    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        variantId: item.variantId,
        direction: 'OUT',
        reason: 'ONLINE_SALE',
        quantity: item.quantity,
        unitCostKes: item.product.costPriceKes,
        unitPriceKes: item.unitPriceKes,
        orderId,
      },
    })
  }
}

export type StockActionResult = { success: true } | { success: false; error: string }

class InsufficientStockError extends Error {}

export async function recordStockIn(input: {
  productId: string
  variantId?: string | null
  quantity: number
  unitCostKes?: number | null
  supplier?: string | null
  note?: string | null
  createdById?: string | null
}): Promise<StockActionResult> {
  if (input.quantity <= 0) {
    return { success: false, error: 'Quantity must be greater than zero.' }
  }

  await prisma.$transaction(async (tx) => {
    if (input.variantId) {
      await tx.productVariant.update({
        where: { id: input.variantId },
        data: { stockQty: { increment: input.quantity } },
      })
    } else {
      await tx.product.update({
        where: { id: input.productId },
        data: { stockQty: { increment: input.quantity } },
      })
    }

    await tx.stockMovement.create({
      data: {
        productId: input.productId,
        variantId: input.variantId ?? null,
        direction: 'IN',
        reason: 'RESTOCK',
        quantity: input.quantity,
        unitCostKes: input.unitCostKes ?? null,
        supplier: input.supplier ?? null,
        note: input.note ?? null,
        createdById: input.createdById ?? null,
      },
    })
  })

  return { success: true }
}

export const NON_SALE_OUT_REASONS = ['MANUAL_SALE', 'DAMAGE', 'REWARD', 'INFLUENCER', 'ADJUSTMENT'] as const
export type ManualStockOutReason = (typeof NON_SALE_OUT_REASONS)[number]

export async function recordStockOut(input: {
  productId: string
  variantId?: string | null
  quantity: number
  reason: ManualStockOutReason
  unitPriceKes?: number | null
  counterparty?: string | null
  note?: string | null
  createdById?: string | null
}): Promise<StockActionResult> {
  if (input.quantity <= 0) {
    return { success: false, error: 'Quantity must be greater than zero.' }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const current = input.variantId
        ? await tx.productVariant.findUniqueOrThrow({
            where: { id: input.variantId },
            select: { stockQty: true },
          })
        : await tx.product.findUniqueOrThrow({
            where: { id: input.productId },
            select: { stockQty: true },
          })

      if (current.stockQty < input.quantity) {
        throw new InsufficientStockError()
      }

      const product = await tx.product.findUniqueOrThrow({
        where: { id: input.productId },
        select: { costPriceKes: true },
      })

      if (input.variantId) {
        await tx.productVariant.update({
          where: { id: input.variantId },
          data: { stockQty: { decrement: input.quantity } },
        })
      } else {
        await tx.product.update({
          where: { id: input.productId },
          data: { stockQty: { decrement: input.quantity } },
        })
      }

      await tx.stockMovement.create({
        data: {
          productId: input.productId,
          variantId: input.variantId ?? null,
          direction: 'OUT',
          reason: input.reason,
          quantity: input.quantity,
          unitPriceKes: input.unitPriceKes ?? null,
          unitCostKes: product.costPriceKes,
          counterparty: input.counterparty ?? null,
          note: input.note ?? null,
          createdById: input.createdById ?? null,
        },
      })
    })
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return { success: false, error: 'Not enough stock available for this item.' }
    }
    throw err
  }

  return { success: true }
}

function variantLabel(optionValues: { optionValue: { value: string; option: { name: string } } }[]): string | null {
  if (optionValues.length === 0) return null
  return optionValues.map((ov) => `${ov.optionValue.option.name}: ${ov.optionValue.value}`).join(' / ')
}

export type StockSummaryRow = {
  productId: string
  productName: string
  variantId: string | null
  variantLabel: string | null
  stockQty: number
  threshold: number
  lowStock: boolean
}

export async function getStockSummary(): Promise<StockSummaryRow[]> {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      stockQty: true,
      lowStockThreshold: true,
      variants: {
        select: {
          id: true,
          stockQty: true,
          optionValues: {
            select: { optionValue: { select: { value: true, option: { select: { name: true } } } } },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const rows: StockSummaryRow[] = []
  for (const product of products) {
    const threshold = effectiveLowStockThreshold(product)
    if (product.variants.length > 0) {
      for (const variant of product.variants) {
        rows.push({
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantLabel: variantLabel(variant.optionValues),
          stockQty: variant.stockQty,
          threshold,
          lowStock: variant.stockQty <= threshold,
        })
      }
    } else {
      rows.push({
        productId: product.id,
        productName: product.name,
        variantId: null,
        variantLabel: null,
        stockQty: product.stockQty,
        threshold,
        lowStock: product.stockQty <= threshold,
      })
    }
  }
  return rows
}

export type ProfitSummary = {
  revenueKes: number
  costKes: number
  profitKes: number
  marginPct: number
  byCategory: Array<{ categoryId: string; categoryName: string; revenueKes: number; profitKes: number }>
}

export async function getProfitSummary(range?: { from?: Date; to?: Date }): Promise<ProfitSummary> {
  const movements = await prisma.stockMovement.findMany({
    where: {
      direction: 'OUT',
      unitPriceKes: { not: null },
      unitCostKes: { not: null },
      createdAt: range ? { gte: range.from, lte: range.to } : undefined,
    },
    select: {
      quantity: true,
      unitPriceKes: true,
      unitCostKes: true,
      product: { select: { categories: { select: { category: { select: { id: true, name: true } } } } } },
    },
  })

  let revenueKes = 0
  let costKes = 0
  const byCategoryMap = new Map<string, { categoryName: string; revenueKes: number; profitKes: number }>()

  for (const m of movements) {
    const revenue = (m.unitPriceKes ?? 0) * m.quantity
    const cost = (m.unitCostKes ?? 0) * m.quantity
    revenueKes += revenue
    costKes += cost

    const categories = m.product.categories.map((pc) => pc.category)
    const targets = categories.length > 0 ? categories : [{ id: 'uncategorized', name: 'Uncategorized' }]
    for (const cat of targets) {
      const entry = byCategoryMap.get(cat.id) ?? { categoryName: cat.name, revenueKes: 0, profitKes: 0 }
      entry.revenueKes += revenue
      entry.profitKes += revenue - cost
      byCategoryMap.set(cat.id, entry)
    }
  }

  const profitKes = revenueKes - costKes
  const marginPct = revenueKes > 0 ? (profitKes / revenueKes) * 100 : 0

  return {
    revenueKes,
    costKes,
    profitKes,
    marginPct,
    byCategory: Array.from(byCategoryMap.entries())
      .map(([categoryId, v]) => ({ categoryId, ...v }))
      .sort((a, b) => b.profitKes - a.profitKes),
  }
}

export type MovementFilter = { productId?: string; reason?: StockMovementReason; direction?: StockDirection }

export async function listStockMovements(filter: MovementFilter = {}, take = 100) {
  return prisma.stockMovement.findMany({
    where: {
      productId: filter.productId,
      reason: filter.reason,
      direction: filter.direction,
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      product: { select: { name: true } },
      variant: {
        select: {
          optionValues: {
            select: { optionValue: { select: { value: true, option: { select: { name: true } } } } },
          },
        },
      },
      createdBy: { select: { name: true, email: true } },
    },
  })
}
