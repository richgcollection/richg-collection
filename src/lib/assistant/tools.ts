import 'server-only'
import { z } from 'zod'
import type { OrderStatus, PaymentStatus, Prisma, StockMovementReason } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getAnalytics, RANGE_PRESETS, type RangeKey } from '@/lib/analytics'
import { getStockSummary, listStockMovements, NON_SALE_OUT_REASONS } from '@/lib/inventory'
import { todayInStoreTz } from '@/lib/dates'
import type { AssistantAction } from '@/lib/assistant/actions-schema'
import { ACTION_SCHEMAS } from '@/lib/assistant/actions-schema'

/**
 * Tools the assistant can call. Read tools query the store directly. Action
 * tools never change anything: they validate the request, resolve names, and
 * return a proposal that the admin confirms (or cancels) in the chat UI. The
 * confirmed proposal then runs through the same server actions the dashboard
 * forms use (see src/lib/actions/admin-assistant.ts).
 */

export type ToolContext = {
  /** Called by action tools to surface a confirmation card in the chat. */
  propose: (proposal: AssistantAction & { summary: string }) => void
}

type ToolDef<S extends z.ZodObject> = {
  name: string
  description: string
  schema: S
  action?: boolean
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>
}

function tool<S extends z.ZodObject>(def: ToolDef<S>): ToolDef<S> {
  return def
}

const RANGE_KEYS = Object.keys(RANGE_PRESETS) as [RangeKey, ...RangeKey[]]

const periodSchema = {
  range: z.enum(RANGE_KEYS).optional().describe('Rolling period. Default 90d. Ignored when year is given.'),
  year: z.number().int().optional().describe('Calendar year (Kenya time), e.g. 2026.'),
  month: z.number().int().min(1).max(12).optional().describe('1-12, only together with year.'),
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp

function loadPeriod(input: { range?: RangeKey; year?: number; month?: number }) {
  return getAnalytics({ range: input.range ?? '90d', year: input.year, month: input.year ? input.month : undefined })
}

function variantText(optionValues: { optionValue: { value: string; option: { name: string } } }[]): string | null {
  if (optionValues.length === 0) return null
  return optionValues.map((ov) => `${ov.optionValue.option.name}: ${ov.optionValue.value}`).join(' / ')
}

async function findOrderByNumber(orderNumber: string) {
  const clean = orderNumber.trim().replace(/^#/, '')
  return prisma.order.findFirst({
    where: { orderNumber: { equals: clean, mode: 'insensitive' } },
    select: { id: true, orderNumber: true, status: true, paymentStatus: true, totalKes: true },
  })
}

export const TOOLS = [
  tool({
    name: 'business_overview',
    description:
      'Headline numbers for a period: revenue, profit, margin, units, buyers, giveaways, restock spend, the same figures for the comparison period, a sales time series, top products and categories, buyer mix, customer sources, order status, inventory value and open carts. Sales come from the stock ledger (online + manual sales). Start here for "how is the business doing" questions.',
    schema: z.object(periodSchema),
    run: async (input) => {
      const a = await loadPeriod(input)
      return {
        period: a.range.label,
        from: a.range.from,
        to: a.range.to,
        comparedWith: a.range.comparisonLabel || null,
        kpis: a.kpis,
        previousKpis: a.prevKpis,
        series: a.series.map((b) => ({
          label: b.label,
          revenueKes: b.revenueKes,
          profitKes: b.profitKes,
          units: b.unitsSold,
          sales: b.transactions,
          onlineKes: b.onlineRevenueKes,
          manualKes: b.manualRevenueKes,
        })),
        topProducts: [...a.products]
          .sort((x, y) => y.revenueKes - x.revenueKes)
          .slice(0, 10)
          .map((p) => ({ name: p.name, revenueKes: p.revenueKes, profitKes: p.profitKes, units: p.unitsSold, stock: p.stockQty })),
        categories: a.categories.slice(0, 10),
        sizes: a.sizes.slice(0, 12),
        weekday: a.weekday,
        buyerMix: a.buyerMix,
        topBuyers: a.topBuyers.slice(0, 10),
        customerSources: a.customerSources.slice(0, 8),
        customerLocations: a.customerLocations.slice(0, 8),
        outByReason: a.outByReason,
        orderStatus: a.orderStatus,
        orderTotals: a.orderTotals,
        inventory: a.inventory,
        openCarts: { count: a.openCarts.count, units: a.openCarts.units, valueKes: a.openCarts.valueKes },
        pareto: a.pareto,
      }
    },
  }),

  tool({
    name: 'product_performance',
    description:
      'Per-product sales velocity for a period: units, revenue, profit, margin, units per week, stock on hand, days of stock cover, sell-through, days since last sale, trend vs the previous half of the period, and a velocity class (fast, steady, slow, dead, stockout). Use for best/worst sellers, dead stock, reorder planning.',
    schema: z.object({
      ...periodSchema,
      sort: z
        .enum(['revenue', 'units', 'profit', 'margin', 'slowest', 'lowest_cover'])
        .optional()
        .describe('Default revenue. slowest = fewest units sold; lowest_cover = fewest days of stock left.'),
      velocityClass: z.enum(['fast', 'steady', 'slow', 'dead', 'stockout']).optional(),
      limit: z.number().int().min(1).max(100).optional().describe('Default 20.'),
    }),
    run: async (input) => {
      const a = await loadPeriod(input)
      let rows = a.products
      if (input.velocityClass) rows = rows.filter((p) => p.velocityClass === input.velocityClass)
      const sorters: Record<string, (x: (typeof rows)[number], y: (typeof rows)[number]) => number> = {
        revenue: (x, y) => y.revenueKes - x.revenueKes,
        units: (x, y) => y.unitsSold - x.unitsSold,
        profit: (x, y) => y.profitKes - x.profitKes,
        margin: (x, y) => (y.marginPct ?? -Infinity) - (x.marginPct ?? -Infinity),
        slowest: (x, y) => x.unitsSold - y.unitsSold,
        lowest_cover: (x, y) => (x.daysOfCover ?? Infinity) - (y.daysOfCover ?? Infinity),
      }
      rows = [...rows].sort(sorters[input.sort ?? 'revenue'])
      return {
        period: a.range.label,
        totalProducts: a.products.length,
        products: rows.slice(0, input.limit ?? 20).map((p) => ({
          productId: p.productId,
          name: p.name,
          category: p.category,
          units: p.unitsSold,
          revenueKes: p.revenueKes,
          profitKes: p.profitKes,
          marginPct: p.marginPct === null ? null : round(p.marginPct),
          listPriceKes: p.listPriceKes,
          avgPriceKes: p.avgPriceKes,
          unitsPerWeek: round(p.unitsPerWeek, 2),
          stock: p.stockQty,
          stockCostKes: p.stockCostKes,
          daysOfCover: p.daysOfCover === null ? null : Math.round(p.daysOfCover),
          sellThroughPct: round(p.sellThroughPct),
          daysSinceLastSale: p.daysSinceLastSale,
          trendPct: p.trendPct === null ? null : round(p.trendPct),
          velocity: p.velocityClass,
        })),
      }
    },
  }),

  tool({
    name: 'find_products',
    description:
      'Search the catalogue by name or SKU. Returns ids, prices, cost, stock and variants (sizes etc.) with their own ids and stock. Use it to get the productId/variantId needed for stock actions.',
    schema: z.object({
      query: z.string().min(1).describe('Part of the product name or SKU.'),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    run: async ({ query, limit }) => {
      const products = await prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { sku: { contains: query, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: query, mode: 'insensitive' } } } },
          ],
        },
        take: limit ?? 10,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          sku: true,
          status: true,
          basePriceKes: true,
          salePriceKes: true,
          costPriceKes: true,
          stockQty: true,
          supplier: true,
          categories: { select: { category: { select: { name: true } } } },
          variants: {
            select: {
              id: true,
              sku: true,
              priceKes: true,
              salePriceKes: true,
              stockQty: true,
              optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
            },
          },
        },
      })
      return products.map((p) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        status: p.status,
        priceKes: p.basePriceKes,
        salePriceKes: p.salePriceKes,
        costPriceKes: p.costPriceKes,
        supplier: p.supplier,
        categories: p.categories.map((c) => c.category.name),
        stock: p.variants.length ? p.variants.reduce((s, v) => s + v.stockQty, 0) : p.stockQty,
        variants: p.variants.map((v) => ({
          variantId: v.id,
          label: variantText(v.optionValues),
          sku: v.sku,
          priceKes: v.salePriceKes ?? v.priceKes,
          stock: v.stockQty,
        })),
      }))
    },
  }),

  tool({
    name: 'stock_alerts',
    description: 'Products and variants that are out of stock or at/below their low-stock threshold right now.',
    schema: z.object({}),
    run: async () => {
      const rows = await getStockSummary()
      return rows
        .filter((r) => r.lowStock || r.stockQty <= 0)
        .map((r) => ({
          productId: r.productId,
          product: r.productName,
          variantId: r.variantId,
          variant: r.variantLabel,
          stock: r.stockQty,
          threshold: r.threshold,
        }))
    },
  }),

  tool({
    name: 'list_orders',
    description: 'Recent website/WhatsApp orders, newest first, with optional filters.',
    schema: z.object({
      status: z.enum(['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'FAILED']).optional(),
      paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
      days: z.number().int().min(1).max(730).optional().describe('Only orders from the last N days.'),
      limit: z.number().int().min(1).max(50).optional().describe('Default 20.'),
    }),
    run: async ({ status, paymentStatus, days, limit }) => {
      const where: Prisma.OrderWhereInput = {
        status: status as OrderStatus | undefined,
        paymentStatus: paymentStatus as PaymentStatus | undefined,
        createdAt: days ? { gte: new Date(Date.now() - days * 86_400_000) } : undefined,
      }
      const [count, orders] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit ?? 20,
          select: {
            orderNumber: true,
            createdAt: true,
            channel: true,
            status: true,
            paymentStatus: true,
            totalKes: true,
            guestEmail: true,
            customer: { select: { firstName: true, lastName: true, phone: true } },
            items: { select: { nameSnapshot: true, variantSnapshot: true, quantity: true } },
          },
        }),
      ])
      return {
        matching: count,
        orders: orders.map((o) => ({
          orderNumber: o.orderNumber,
          placedAt: o.createdAt.toISOString(),
          channel: o.channel,
          status: o.status,
          payment: o.paymentStatus,
          totalKes: o.totalKes,
          customer: o.customer ? `${o.customer.firstName} ${o.customer.lastName ?? ''}`.trim() : o.guestEmail,
          items: o.items.map((i) => `${i.quantity}× ${i.nameSnapshot}${i.variantSnapshot ? ` (${i.variantSnapshot})` : ''}`),
        })),
      }
    },
  }),

  tool({
    name: 'get_order',
    description: 'Full details of one order by its order number: items, totals, shipping address, status history, payment.',
    schema: z.object({ orderNumber: z.string().min(1) }),
    run: async ({ orderNumber }) => {
      const found = await findOrderByNumber(orderNumber)
      if (!found) return { error: `No order ${orderNumber}.` }
      const o = await prisma.order.findUniqueOrThrow({
        where: { id: found.id },
        include: {
          items: { select: { nameSnapshot: true, variantSnapshot: true, quantity: true, unitPriceKes: true, lineTotalKes: true } },
          statusEvents: { orderBy: { occurredAt: 'asc' }, select: { status: true, occurredAt: true } },
          customer: { select: { firstName: true, lastName: true, phone: true, email: true } },
          affiliate: { select: { name: true } },
        },
      })
      return {
        orderNumber: o.orderNumber,
        placedAt: o.createdAt.toISOString(),
        channel: o.channel,
        status: o.status,
        payment: o.paymentStatus,
        subtotalKes: o.subtotalKes,
        shippingKes: o.shippingKes,
        totalKes: o.totalKes,
        customer: o.customer,
        guestEmail: o.guestEmail,
        guestPhone: o.guestPhone,
        shippingAddress: o.shippingAddress,
        affiliate: o.affiliate?.name ?? null,
        items: o.items,
        statusHistory: o.statusEvents.map((e) => ({ status: e.status, at: e.occurredAt.toISOString() })),
      }
    },
  }),

  tool({
    name: 'find_customers',
    description: 'Search customers by name, phone or email. Returns contact details, source, location, order count, spend and notes.',
    schema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    run: async ({ query, limit }) => {
      const digits = query.replace(/\D/g, '')
      const customers = await prisma.customer.findMany({
        where: {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-9) } }] : []),
          ],
        },
        take: limit ?? 10,
        orderBy: { updatedAt: 'desc' },
      })
      return customers.map((c) => ({
        customerId: c.id,
        name: `${c.firstName} ${c.lastName ?? ''}`.trim(),
        phone: c.phone,
        email: c.email,
        location: c.location,
        source: c.source,
        totalOrders: c.totalOrders,
        totalSpentKes: c.totalSpentKes,
        lastProduct: c.lastProduct,
        notes: c.notes,
        since: c.createdAt.toISOString().slice(0, 10),
      }))
    },
  }),

  tool({
    name: 'stock_movements',
    description: 'Recent stock ledger entries (restocks, sales, giveaways, damage, adjustments), newest first.',
    schema: z.object({
      productId: z.string().optional(),
      reason: z.enum(['RESTOCK', 'ONLINE_SALE', 'MANUAL_SALE', 'DAMAGE', 'REWARD', 'INFLUENCER', 'ADJUSTMENT']).optional(),
      limit: z.number().int().min(1).max(100).optional().describe('Default 30.'),
    }),
    run: async ({ productId, reason, limit }) => {
      const rows = await listStockMovements({ productId, reason: reason as StockMovementReason | undefined }, limit ?? 30)
      return rows.map((m) => ({
        at: m.createdAt.toISOString(),
        product: m.product.name,
        variant: m.variant ? variantText(m.variant.optionValues) : null,
        direction: m.direction,
        reason: m.reason,
        quantity: m.quantity,
        unitPriceKes: m.unitPriceKes,
        unitCostKes: m.unitCostKes,
        discountKes: m.discountKes,
        counterparty: m.counterparty,
        supplier: m.supplier,
        note: m.note,
        by: m.createdBy?.name ?? m.createdBy?.email ?? null,
      }))
    },
  }),

  // ---------------------------------------------------------------- actions (proposals only)

  tool({
    name: 'propose_restock',
    action: true,
    description:
      'Propose recording stock received from a supplier. Does NOT change anything by itself: the admin sees a confirmation card and must click Confirm. Get productId/variantId from find_products first; products with variants need a variantId.',
    schema: ACTION_SCHEMAS.restock,
    run: async (input, ctx) => {
      const label = await describeLine(input.productId, input.variantId)
      if ('error' in label) return label
      if (label.needsVariant) return { error: `${label.text} has variants. Ask which size/variant and pass its variantId.` }
      const summary = `Restock ${input.quantity}× ${label.text}${input.unitCostKes != null ? ` at KES ${input.unitCostKes} each` : ''}${input.supplier ? ` from ${input.supplier}` : ''}`
      ctx.propose({ action: 'restock', input, summary })
      return { proposed: summary, status: 'Waiting for the admin to confirm on the card. Nothing has been recorded yet.' }
    },
  }),

  tool({
    name: 'propose_stock_out',
    action: true,
    description: `Propose recording stock that left outside the website: a manual sale (shop, WhatsApp, phone), a giveaway (REWARD, INFLUENCER), DAMAGE or an ADJUSTMENT. Reasons: ${NON_SALE_OUT_REASONS.join(', ')}. Does NOT change anything by itself: the admin confirms on a card. Get ids from find_products first. For MANUAL_SALE include unitPriceKes.`,
    schema: ACTION_SCHEMAS.stock_out,
    run: async (input, ctx) => {
      const lines: string[] = []
      for (const item of input.items) {
        const label = await describeLine(item.productId, item.variantId)
        if ('error' in label) return label
        if (label.needsVariant) return { error: `${label.text} has variants. Ask which size/variant and pass its variantId.` }
        if (label.stock < item.quantity) return { error: `Only ${label.stock} of ${label.text} in stock.` }
        lines.push(`${item.quantity}× ${label.text}${item.unitPriceKes != null ? ` @ KES ${item.unitPriceKes}` : ''}${item.discountKes ? ` (−KES ${item.discountKes})` : ''}`)
      }
      if (input.date && input.date > todayInStoreTz()) return { error: 'The date cannot be in the future.' }
      const summary = `${input.reason.replace('_', ' ').toLowerCase()}: ${lines.join(', ')}${input.counterparty ? ` — ${input.counterparty}` : ''} on ${input.date ?? todayInStoreTz()}`
      ctx.propose({ action: 'stock_out', input, summary })
      return { proposed: summary, status: 'Waiting for the admin to confirm on the card. Nothing has been recorded yet.' }
    },
  }),

  tool({
    name: 'propose_order_status',
    action: true,
    description:
      'Propose changing an order\'s fulfilment status (e.g. SHIPPED, COMPLETED, CANCELLED). Cancelling/refunding returns stock and voids affiliate commission. Does NOT change anything by itself: the admin confirms on a card.',
    schema: ACTION_SCHEMAS.order_status,
    run: async (input, ctx) => {
      const order = await findOrderByNumber(input.orderNumber)
      if (!order) return { error: `No order ${input.orderNumber}.` }
      if (order.status === input.status) return { error: `Order ${order.orderNumber} is already ${order.status}.` }
      const summary = `Change order ${order.orderNumber} from ${order.status} to ${input.status}`
      ctx.propose({ action: 'order_status', input: { ...input, orderNumber: order.orderNumber }, summary })
      return { proposed: summary, status: 'Waiting for the admin to confirm on the card. Nothing has changed yet.' }
    },
  }),

  tool({
    name: 'propose_mark_paid',
    action: true,
    description:
      'Propose marking an unpaid order as paid (e.g. paid by M-Pesa till or bank transfer). This also deducts its stock. Does NOT change anything by itself: the admin confirms on a card.',
    schema: ACTION_SCHEMAS.mark_paid,
    run: async (input, ctx) => {
      const order = await findOrderByNumber(input.orderNumber)
      if (!order) return { error: `No order ${input.orderNumber}.` }
      if (order.paymentStatus === 'PAID') return { error: `Order ${order.orderNumber} is already paid.` }
      const summary = `Mark order ${order.orderNumber} (KES ${order.totalKes}) as paid`
      ctx.propose({ action: 'mark_paid', input: { orderNumber: order.orderNumber }, summary })
      return { proposed: summary, status: 'Waiting for the admin to confirm on the card. Nothing has changed yet.' }
    },
  }),
] as const

type AnyTool = (typeof TOOLS)[number]

async function describeLine(productId: string, variantId?: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      name: true,
      stockQty: true,
      variants: {
        select: {
          id: true,
          stockQty: true,
          optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
        },
      },
    },
  })
  if (!product) return { error: `No product with id ${productId}. Use find_products to get the id.` }
  if (!variantId) {
    return { text: product.name, stock: product.stockQty, needsVariant: product.variants.length > 0 }
  }
  const variant = product.variants.find((v) => v.id === variantId)
  if (!variant) return { error: `Variant ${variantId} does not belong to ${product.name}.` }
  return { text: `${product.name} (${variantText(variant.optionValues)})`, stock: variant.stockQty, needsVariant: false }
}

/** Tools offered to the model, minus action tools when the admin has turned actions off. */
export function toolsFor(allowActions: boolean): readonly AnyTool[] {
  return allowActions ? TOOLS : TOOLS.filter((t) => !('action' in t && t.action))
}

/** JSON Schema for a tool's input, shared by every provider adapter. */
export function toolJsonSchema(t: AnyTool): Record<string, unknown> {
  // Drop the $schema marker and zod's ±MAX_SAFE_INTEGER bounds on ints; some OpenAI-compatible providers reject them.
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean)
    if (!node || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      if (key === '$schema') continue
      if ((key === 'maximum' || key === 'minimum') && Math.abs(value as number) === Number.MAX_SAFE_INTEGER) continue
      out[key] = clean(value)
    }
    return out
  }
  return clean(z.toJSONSchema(t.schema)) as Record<string, unknown>
}

/** Validates and runs a tool call. Errors come back as data so the model can recover. */
export async function runTool(
  tools: readonly AnyTool[],
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<{ ok: boolean; result: string }> {
  const t = tools.find((x) => x.name === name)
  if (!t) return { ok: false, result: `Unknown tool ${name}.` }
  const parsed = t.schema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    return { ok: false, result: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` }
  }
  try {
    // Each tool's run accepts its own schema's output; the union loses that link.
    const result = await (t.run as (input: unknown, ctx: ToolContext) => Promise<unknown>)(parsed.data, ctx)
    const isError = typeof result === 'object' && result !== null && 'error' in result
    return { ok: !isError, result: JSON.stringify(result) }
  } catch (err) {
    console.error(`[assistant] tool ${name} failed`, err)
    return { ok: false, result: 'The tool failed with a server error.' }
  }
}
