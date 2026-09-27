/**
 * Adds a customer profile for every buyer who appears on sales in the stock
 * ledger (by name) but has no customer record — people whose purchases were
 * logged in the stock tracker but who were never entered on its customer
 * sheets. They are created without a phone so one can be added later from
 * the Customers page ("Missing phone" filter).
 *
 * A buyer is skipped when their name already matches a customer's full name,
 * or matches a customer's first name (likely the same person recorded with
 * just a first name — merging those is left to a human).
 *
 * Dry run by default; pass --apply to write. Safe to re-run: buyers added by
 * an earlier run now match by full name and are skipped.
 *
 *   npx tsx scripts/add-sales-record-customers.ts [--apply]
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

const APPLY = process.argv.includes('--apply')
const SOURCE = 'Sales record'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' })

async function main() {
  const [customers, sales] = await Promise.all([
    prisma.customer.findMany({ select: { firstName: true, lastName: true } }),
    prisma.stockMovement.findMany({
      where: { direction: 'OUT', reason: { in: ['MANUAL_SALE', 'ONLINE_SALE'] }, counterparty: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { counterparty: true, quantity: true, unitPriceKes: true, createdAt: true, product: { select: { name: true } } },
    }),
  ])

  const fullNames = new Set(customers.map((c) => norm(`${c.firstName} ${c.lastName ?? ''}`)))
  const firstNames = new Set(customers.map((c) => norm(c.firstName)))

  type Buyer = {
    name: string
    spendKes: number
    units: number
    days: Map<string, { products: string[]; units: number; valueKes: number }>
    first: Date
    last: Date
  }
  const buyers = new Map<string, Buyer>()
  for (const s of sales) {
    const key = norm(s.counterparty!)
    if (!key || fullNames.has(key) || firstNames.has(key)) continue
    const b = buyers.get(key) ?? { name: s.counterparty!.trim(), spendKes: 0, units: 0, days: new Map(), first: s.createdAt, last: s.createdAt }
    const value = (s.unitPriceKes ?? 0) * s.quantity
    b.spendKes += value
    b.units += s.quantity
    if (s.createdAt > b.last) b.last = s.createdAt
    const day = b.days.get(dayKey(s.createdAt)) ?? { products: [], units: 0, valueKes: 0 }
    day.products.push(s.quantity > 1 ? `${s.product.name} ×${s.quantity}` : s.product.name)
    day.units += s.quantity
    day.valueKes += value
    b.days.set(dayKey(s.createdAt), day)
    buyers.set(key, b)
  }

  const plan = [...buyers.values()].sort((a, b) => b.spendKes - a.spendKes)
  console.log(`${plan.length} buyers on sales records have no customer profile${APPLY ? '' : ' (dry run — pass --apply to write)'}:\n`)
  for (const b of plan) {
    console.log(`  ${b.name.padEnd(28)} KES ${String(b.spendKes).padStart(7)}  ${b.units} units, ${b.days.size} visit(s), last ${fmtDate(b.last)}`)
  }
  if (!APPLY || plan.length === 0) return

  // A single INSERT: all-or-nothing, without an interactive transaction that
  // can outlive Prisma's 5s timeout over a remote connection.
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
  console.log(`\nAdded ${plan.length} customers.`)
}

main().finally(() => prisma.$disconnect())
