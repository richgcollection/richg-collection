import { prisma } from '@/lib/prisma'
import { dayKey, fmtDate, titleCase } from '@/lib/stock-tracker/mapping'

const SOURCE = 'Sales record'
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export type PlannedBuyer = {
  name: string
  spendKes: number
  units: number
  visits: number
  first: Date
  last: Date
}

/**
 * Adds a customer profile for every buyer who appears on manual sales in the
 * stock ledger (by name) but has no customer record. They are created without
 * a phone so one can be added later from the Customers page ("Missing phone").
 *
 * A buyer is skipped when their name matches a customer's full name, or a
 * customer's first name (likely the same person recorded with just a first
 * name; merging those is left to a human). Safe to re-run.
 */
export async function addSalesRecordCustomers({ apply }: { apply: boolean }): Promise<PlannedBuyer[]> {
  const [customers, sales] = await Promise.all([
    prisma.customer.findMany({ select: { firstName: true, lastName: true } }),
    prisma.stockMovement.findMany({
      where: { direction: 'OUT', reason: 'MANUAL_SALE', counterparty: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { counterparty: true, quantity: true, unitPriceKes: true, discountKes: true, createdAt: true, product: { select: { name: true } } },
    }),
  ])

  const fullNames = new Set(customers.map((c) => norm(`${c.firstName} ${c.lastName ?? ''}`)))
  const firstNames = new Set(customers.map((c) => norm(c.firstName)))

  type Buyer = PlannedBuyer & { days: Map<string, { products: string[]; units: number; valueKes: number }> }
  const buyers = new Map<string, Buyer>()
  for (const s of sales) {
    const key = norm(s.counterparty!)
    if (!key || fullNames.has(key) || firstNames.has(key)) continue
    const b = buyers.get(key) ?? { name: s.counterparty!.trim(), spendKes: 0, units: 0, visits: 0, days: new Map(), first: s.createdAt, last: s.createdAt }
    const value = (s.unitPriceKes ?? 0) * s.quantity - (s.discountKes ?? 0)
    b.spendKes += value
    b.units += s.quantity
    if (s.createdAt > b.last) b.last = s.createdAt
    const day = b.days.get(dayKey(s.createdAt)) ?? { products: [], units: 0, valueKes: 0 }
    day.products.push(s.quantity > 1 ? `${s.product.name} ×${s.quantity}` : s.product.name)
    day.units += s.quantity
    day.valueKes += value
    b.days.set(dayKey(s.createdAt), day)
    b.visits = b.days.size
    buyers.set(key, b)
  }

  const plan = [...buyers.values()].sort((a, b) => b.spendKes - a.spendKes)
  if (apply && plan.length)
    // A single INSERT: all-or-nothing, without an interactive transaction.
    await prisma.customer.createMany({
      data: plan.map((b) => {
        const [firstName, ...rest] = titleCase(b.name).split(/\s+/)
        const lastVisit = [...b.days.values()].at(-1)!
        return {
          firstName,
          lastName: rest.join(' ') || null,
          phone: null,
          source: SOURCE,
          lastProduct: lastVisit.products.join(', '),
          lastQuantity: lastVisit.units,
          lastOrderValueKes: lastVisit.valueKes,
          totalOrders: b.days.size,
          totalSpentKes: b.spendKes,
          notes: `Added from sales records: bought ${b.units} unit(s) across ${b.days.size} visit(s) between ${fmtDate(b.first)} and ${fmtDate(b.last)}. No phone on record yet.`,
          createdAt: b.first,
        }
      }),
    })
  return plan.map(({ name, spendKes, units, visits, first, last }) => ({ name, spendKes, units, visits, first, last }))
}
