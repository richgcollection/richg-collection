/**
 * One-off import of the "RICH G COLLECTION - STOCK TRACKER" workbook into the
 * inventory ledger, product cost prices and customer CRM.
 *
 * Input is the workbook converted to JSON (sheet name -> { header, rows }).
 * Dry run by default; pass --apply to write.
 *
 *   npx tsx scripts/import-stock-tracker.ts <sheets.json> [--apply]
 *
 * The spreadsheet is treated as the source of truth for stock: every size it
 * mentions ends with stockQty = (stock in - stock out) from the sheet.
 * Anything the import had to guess at is flagged with a "Needs review:" note
 * that admins can edit on the Inventory page.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import type { StockMovementReason } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

type Row = Record<string, string | number | null> & { _row: number }
type Sheets = Record<string, { header: string[]; rows: Row[] }>

const [jsonPath, ...flags] = process.argv.slice(2)
const APPLY = flags.includes('--apply')
if (!jsonPath) throw new Error('Usage: import-stock-tracker.ts <sheets.json> [--apply]')
const sheets: Sheets = JSON.parse(readFileSync(jsonPath, 'utf8'))

const REVIEW = 'Needs review:'
// The sheet's history ends mid-September; any ledger entry dated before this
// means the import has already run.
const SHEET_ERA_END = new Date('2026-09-15T23:59:59+03:00')

// ---------------------------------------------------------------- helpers

const str = (v: unknown) => (v == null ? '' : String(v).trim())
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
const normSize = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/^XXL$/, '2XL')
const num = (v: unknown) => {
  const n = Number(v)
  return v !== null && v !== '' && Number.isFinite(n) ? Math.round(n) : null
}
const DAY = 86_400_000

function parseDate(v: unknown, fallback?: Date): Date {
  const s = str(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T09:00:00+03:00`)
  if (fallback) return fallback
  throw new Error(`Bad date: "${s}"`)
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// ---------------------------------------------------------------- catalog

const TYPE_BY_CATEGORY: Record<string, string> = {
  SHORTS: 'Gym Shorts',
  VEST: 'Gym Vest',
  'R TSHIRTS': 'Round Neck T-Shirt',
  'O TSHIRTS': 'Oversized T-Shirt',
  'L TSHIRTS': 'Long Sleeve T-Shirt',
  'COLLARLESS SHIRT': 'Collarless Shirt',
  OFFICIAL: 'Official Shirt',
  'SHORT SLEEVED SHIRT': 'Short Sleeved Shirt',
  'SIDE ADJUSTER': 'Side Adjuster Trousers',
  BELTED: 'Belted Trousers',
}

// PROFIT sheet item names -> product types they can refer to.
const TYPES_BY_PROFIT_ITEM: Record<string, string[]> = {
  'GYM SHORTS': ['Gym Shorts'],
  'GYM VEST': ['Gym Vest'],
  'R TSHIRTS': ['Round Neck T-Shirt'],
  'O TSHIRT': ['Oversized T-Shirt'],
  'L TSHIRT': ['Long Sleeve T-Shirt'],
  'C SHIRT': ['Collarless Shirt'],
  'O SHIRTS': ['Official Shirt'],
  TROUSERS: ['Side Adjuster Trousers', 'Belted Trousers'],
}

const COLOR_ALIASES: Record<string, string[]> = {
  STRIPPED: ['Striped'],
  BLUE: ['Blue', 'Navy Blue'],
}

type Variant = { key: string; productId: string; productName: string; type: string; variantId: string | null; size: string; stockQty: number }
type Product = { id: string; name: string; type: string; sizeOptionId: string | null; sizeValues: Map<string, string> }

async function loadCatalog() {
  const rows = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      options: { select: { id: true, name: true, values: { select: { id: true, value: true } } } },
      variants: {
        select: {
          id: true,
          stockQty: true,
          optionValues: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
        },
      },
    },
  })
  const products = new Map<string, Product>()
  const variants = new Map<string, Variant>()
  for (const p of rows) {
    const type = Object.values(TYPE_BY_CATEGORY).find((t) => p.name.endsWith(t)) ?? ''
    const sizeOption = p.options.find((o) => o.name === 'Size')
    products.set(p.name.toLowerCase(), {
      id: p.id,
      name: p.name,
      type,
      sizeOptionId: sizeOption?.id ?? null,
      sizeValues: new Map(sizeOption?.values.map((v) => [normSize(v.value), v.id]) ?? []),
    })
    for (const v of p.variants) {
      const size = v.optionValues.find((o) => o.optionValue.option.name === 'Size')?.optionValue.value
      if (!size) continue
      const key = `${p.name.toLowerCase()}|${normSize(size)}`
      variants.set(key, { key, productId: p.id, productName: p.name, type, variantId: v.id, size, stockQty: v.stockQty })
    }
  }
  return { products, variants }
}

type Resolved =
  | { kind: 'ok'; variant: Variant }
  | { kind: 'error'; message: string }

// Finds the variant a sheet row refers to. A missing size on an existing
// product is planned as a new variant; a missing product falls back to another
// colour of the same type and size, flagged and without touching its stock.
function makeResolver(catalog: Awaited<ReturnType<typeof loadCatalog>>) {
  const newVariants = new Map<string, Variant & { sizeOptionId: string | null; sizeValueId: string | null }>()
  return {
    newVariants,
    resolve(row: Row): Resolved & { flag?: string; substituted?: boolean } {
      const category = str(row.CATEGORY).toUpperCase()
      const type = TYPE_BY_CATEGORY[category]
      if (!type) return { kind: 'error', message: `unknown category "${category}"` }
      const colorRaw = str(row.COLOR).toUpperCase()
      const colors = COLOR_ALIASES[colorRaw] ?? [titleCase(colorRaw)]
      const sizeRaw = str(row.SIZE)
      const size = normSize(sizeRaw)

      for (const c of colors) {
        const name = `${c} ${type}`.toLowerCase()
        const hit = catalog.variants.get(`${name}|${size}`) ?? newVariants.get(`${name}|${size}`)
        if (hit) return { kind: 'ok', variant: hit }
        const product = catalog.products.get(name)
        if (product) {
          const v = {
            key: `${name}|${size}`,
            productId: product.id,
            productName: product.name,
            type,
            variantId: null,
            size: sizeRaw.replace(/\s*,\s*/, ', '),
            stockQty: 0,
            sizeOptionId: product.sizeOptionId,
            sizeValueId: product.sizeValues.get(size) ?? null,
          }
          newVariants.set(v.key, v)
          return {
            kind: 'ok',
            variant: v,
            flag: `${REVIEW} size ${v.size} didn't exist on ${product.name}, so it was added during the spreadsheet import. Check the size and stock are right.`,
          }
        }
      }

      const wanted = `${colors[0]} ${type}`
      const substitute = [...catalog.variants.values()].find((v) => v.type === type && normSize(v.size) === size)
      if (substitute)
        return {
          kind: 'ok',
          variant: substitute,
          substituted: true,
          flag: `${REVIEW} the spreadsheet lists this as ${wanted} ${sizeRaw}, which isn't on the site, so it's recorded against ${substitute.productName}. ${substitute.productName}'s stock count was not changed for it.`,
        }
      return { kind: 'error', message: `no product "${wanted}" and no other colour in size ${size}` }
    },
  }
}

// ---------------------------------------------------------------- stock

type Movement = {
  sheetRow: string
  variant: Variant
  direction: 'IN' | 'OUT'
  reason: StockMovementReason
  quantity: number
  unitCostKes: number | null
  unitPriceKes: number | null
  supplier: string | null
  counterparty: string | null
  note: string | null
  affectsStock: boolean
  createdAt: Date
}

const REASON_BY_TYPE: Record<string, StockMovementReason> = {
  SALE: 'MANUAL_SALE',
  INFLUENCER: 'INFLUENCER',
  REWARD: 'REWARD',
}

function planStock(resolver: ReturnType<typeof makeResolver>) {
  const problems: string[] = []
  const movements: Movement[] = []
  const costByVariant = new Map<string, number>()
  const costByProduct = new Map<string, { cost: number; supplier: string }>()

  for (const row of sheets['Stock In'].rows) {
    const r = resolver.resolve(row)
    const qty = num(row['QUANTITY IN'])
    if (r.kind === 'error') { problems.push(`Stock In row ${row._row}: ${r.message}, skipped`); continue }
    if (!qty || qty <= 0) { problems.push(`Stock In row ${row._row}: bad quantity "${row['QUANTITY IN']}", skipped`); continue }
    const cost = num(row['COST PER UNIT'])
    const supplier = titleCase(str(row.SUPPIER)) || null
    if (cost != null) costByVariant.set(r.variant.key, cost)
    if (cost != null && supplier) costByProduct.set(r.variant.productId, { cost, supplier })
    movements.push({
      sheetRow: `Stock In ${row._row}`,
      variant: r.variant,
      direction: 'IN',
      reason: 'RESTOCK',
      quantity: qty,
      unitCostKes: cost,
      unitPriceKes: null,
      supplier,
      counterparty: null,
      note: r.flag ?? null,
      affectsStock: !r.substituted,
      createdAt: parseDate(row.DATE),
    })
  }

  let lastDate: Date | undefined
  for (const row of sheets['Stock Out'].rows) {
    const r = resolver.resolve(row)
    const qty = num(row['QUANTITY OUT'])
    const type = str(row.TYPE).toUpperCase()
    const reason = REASON_BY_TYPE[type]
    if (r.kind === 'error') { problems.push(`Stock Out row ${row._row}: ${r.message}, skipped`); continue }
    if (!qty || qty <= 0) { problems.push(`Stock Out row ${row._row}: bad quantity "${row['QUANTITY OUT']}", skipped`); continue }
    if (!reason) { problems.push(`Stock Out row ${row._row}: unknown type "${type}", skipped`); continue }
    const price = num(row['PRICE PER UNIT'])
    let note = r.flag ?? null
    if (reason === 'MANUAL_SALE' && !price) {
      problems.push(`Stock Out row ${row._row}: sale with no price (${r.variant.productName} ${r.variant.size}), flagged`)
      note = `${REVIEW} this sale has no price in the spreadsheet, so it isn't counted in revenue or profit. Add the price in the note or record it again.`
    }
    lastDate = parseDate(row.DATE, lastDate)
    movements.push({
      sheetRow: `Stock Out ${row._row}`,
      variant: r.variant,
      direction: 'OUT',
      reason,
      quantity: qty,
      unitCostKes: costByVariant.get(r.variant.key) ?? costByProduct.get(r.variant.productId)?.cost ?? null,
      unitPriceKes: reason === 'MANUAL_SALE' && price ? price : null,
      supplier: null,
      counterparty: titleCase(str(row['CUSTOMER/ INFLUENCER'])) || null,
      note,
      affectsStock: !r.substituted,
      createdAt: lastDate,
    })
  }

  // Target stock per size = sheet in - out.
  const target = new Map<string, { variant: Variant; qty: number }>()
  for (const m of movements) {
    if (!m.affectsStock) continue
    const e = target.get(m.variant.key) ?? { variant: m.variant, qty: 0 }
    e.qty += m.direction === 'IN' ? m.quantity : -m.quantity
    target.set(m.variant.key, e)
  }
  for (const e of target.values())
    if (e.qty < 0) problems.push(`${e.variant.productName} ${e.variant.size}: spreadsheet balance is ${e.qty}, stock will be set to 0`)

  return { movements, problems, costByProduct, target }
}

// Applies PROFIT-sheet discounts to the matching Stock Out sales: same product
// type and list price, nearest date within a few days.
function applyDiscounts(movements: Movement[]) {
  const problems: string[] = []
  let applied = 0
  let wanted = 0
  const used = new Set<Movement>()
  const sales = movements.filter((m) => m.reason === 'MANUAL_SALE' && m.unitPriceKes)

  for (const row of sheets.PROFIT.rows) {
    const discount = num(row.DISCOUNT) ?? 0
    const qty = num(row.QUANTITY) ?? 0
    const price = num(row['SELLING PRICE'])
    if (discount <= 0 || qty <= 0 || !price) continue
    wanted += discount * qty
    const types = TYPES_BY_PROFIT_ITEM[str(row.ITEM).toUpperCase()]
    if (!types) { problems.push(`PROFIT row ${row._row}: unknown item "${row.ITEM}", discount not applied`); continue }
    const date = parseDate(row.DATE)
    let remaining = qty
    const candidates = sales
      .filter((m) => !used.has(m) && types.includes(m.variant.type) && m.unitPriceKes === price)
      .map((m) => ({ m, gap: Math.abs(m.createdAt.getTime() - date.getTime()) / DAY }))
      .filter((c) => c.gap <= 3)
      .sort((a, b) => a.gap - b.gap)
    for (const { m } of candidates) {
      if (remaining <= 0) break
      if (m.quantity > remaining) continue
      used.add(m)
      m.unitPriceKes = price - discount
      m.note = m.note ?? `Discount KES ${discount.toLocaleString()} per item (list price KES ${price.toLocaleString()})`
      applied += discount * m.quantity
      remaining -= m.quantity
    }
    if (remaining > 0)
      problems.push(`PROFIT row ${row._row} (${fmtDate(date)} ${row.ITEM} x${qty}, KES ${discount}/item off): no matching sale for ${remaining} item(s), discount not applied to them`)
  }
  return { applied, wanted, problems }
}

// ---------------------------------------------------------------- customers

type Customer = {
  phone: string | null
  firstName: string
  lastName: string | null
  gender: string | null
  location: string | null
  source: string
  lastProduct: string | null
  lastQuantity: number | null
  sizes: Set<string>
  sheetOrderValues: number[]
  purchases: Set<string>
  createdAt: Date
}

const CUSTOMER_SHEETS = ['Customer data base', 'META CUSTOMER DATA 1', 'META CUSTOMER DATA 2', 'Customer data']

function normalizePhone(raw: unknown): string | null {
  const digits = str(raw).replace(/[^\d]/g, '')
  if (!digits) return null
  if (digits.startsWith('254')) return digits
  if (digits.startsWith('0')) return `254${digits.slice(1)}`
  if (digits.length === 9) return `254${digits}`
  return digits
}

// Excel turned quantities like "1/2" into dates; recover them as day + month.
function parseQuantity(v: unknown): number | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(str(v))
  if (m) return Number(m[1]) + Number(m[2])
  const n = num(v)
  return n && n > 0 ? n : null
}

function planCustomers() {
  const problems: string[] = []
  const byKey = new Map<string, Customer>()

  for (const sheet of CUSTOMER_SHEETS) {
    for (const row of sheets[sheet]?.rows ?? []) {
      const first = titleCase(str(row['FIRST NAME']))
      const last = titleCase(str(row['LAST NAME'])) || null
      if (!first) { problems.push(`${sheet} row ${row._row}: no first name, skipped`); continue }
      const phone = normalizePhone(row['PHONE NUMBER'])
      // People without a phone are matched by name instead.
      const key = phone ?? `name:${first.toLowerCase()}`
      const createdAt = parseDate(row['DATE ADDED'], new Date('2026-02-01T09:00:00+03:00'))
      const product = titleCase(str(row['PRODUCT BOUGHT'])) || null

      let c = byKey.get(key)
      if (!c) {
        c = {
          phone,
          firstName: first,
          lastName: last,
          gender: null,
          location: null,
          source: 'Spreadsheet',
          lastProduct: null,
          lastQuantity: null,
          sizes: new Set(),
          sheetOrderValues: [],
          purchases: new Set(),
          createdAt,
        }
        byKey.set(key, c)
      }
      if (last && (!c.lastName || last.length > c.lastName.length)) c.lastName = last
      if (first.length > c.firstName.length) c.firstName = first
      const gender = titleCase(str(row.GENDER))
      if (gender) c.gender = gender
      const location = titleCase(str(row.LOCATION))
      if (location) c.location = location
      const source = titleCase(str(row.SOURCES))
      if (source) c.source = source === 'Referal' ? 'Referral' : source
      const size = str(row.SIZE)
      if (size) c.sizes.add(size)
      if (createdAt < c.createdAt) c.createdAt = createdAt
      if (product) {
        c.purchases.add(`${str(row['DATE ADDED'])}|${product.toLowerCase()}`)
        c.lastProduct = product
        c.lastQuantity = parseQuantity(row.QUANTITY)
      }
      const orderValue = num(row['ORDER VALUE'])
      if (orderValue) c.sheetOrderValues.push(orderValue)
    }
  }
  const customers = [...byKey.values()]
  return { customers, problems, noPhone: customers.filter((c) => !c.phone).length }
}

// ---------------------------------------------------------------- run

async function main() {
  const catalog = await loadCatalog()
  const resolver = makeResolver(catalog)
  const stock = planStock(resolver)
  const discounts = applyDiscounts(stock.movements)
  const crm = planCustomers()

  const count = (r: StockMovementReason) => stock.movements.filter((m) => m.reason === r).length
  const sales = stock.movements.filter((m) => m.reason === 'MANUAL_SALE' && m.unitPriceKes && m.unitCostKes)
  const revenue = sales.reduce((s, m) => s + m.unitPriceKes! * m.quantity, 0)
  const cost = sales.reduce((s, m) => s + m.unitCostKes! * m.quantity, 0)
  const stockChanges = [...stock.target.values()]
    .map((e) => ({ ...e, qty: Math.max(0, e.qty) }))
    .filter((e) => e.variant.variantId === null || e.qty !== e.variant.stockQty)

  console.log(`\n=== STOCK LEDGER ${APPLY ? '(APPLY)' : '(dry run)'}`)
  console.log(`movements: ${stock.movements.length} (restock ${count('RESTOCK')}, sales ${count('MANUAL_SALE')}, influencer ${count('INFLUENCER')}, reward ${count('REWARD')})`)
  console.log(`discounts applied: KES ${discounts.applied.toLocaleString()} of KES ${discounts.wanted.toLocaleString()} in the PROFIT sheet`)
  console.log(`sales revenue KES ${revenue.toLocaleString()}, cost KES ${cost.toLocaleString()}, profit KES ${(revenue - cost).toLocaleString()}`)
  console.log(`product cost prices to set: ${stock.costByProduct.size}`)
  console.log(`new sizes to add: ${resolver.newVariants.size}`)
  for (const v of resolver.newVariants.values()) console.log(`   ${v.productName} ${v.size}`)
  console.log(`stock counts to change: ${stockChanges.length}`)
  for (const e of stockChanges)
    console.log(`   ${e.variant.productName} ${e.variant.size}: ${e.variant.variantId ? e.variant.stockQty : '(new)'} -> ${e.qty}`)
  const flagged = stock.movements.filter((m) => m.note?.startsWith(REVIEW))
  console.log(`flagged for review: ${flagged.length}`)
  for (const m of flagged) console.log(`   ${m.sheetRow}: ${m.variant.productName} ${m.variant.size} -- ${m.note}`)
  console.log(`problems: ${stock.problems.length + discounts.problems.length}`)
  for (const p of [...stock.problems, ...discounts.problems]) console.log(`   ${p}`)

  console.log(`\n=== CUSTOMERS`)
  console.log(`unique customers: ${crm.customers.length} (${crm.noPhone} without a phone number, matched by name)`)
  console.log(`customers with more than one purchase: ${crm.customers.filter((c) => c.purchases.size > 1).length}`)
  const existingPhones = await prisma.customer.count({ where: { phone: { in: crm.customers.flatMap((c) => (c.phone ? [c.phone] : [])) } } })
  console.log(`already in CRM (by phone): ${existingPhones}`)
  for (const p of crm.problems) console.log(`   ${p}`)

  if (!APPLY) return

  const prior = await prisma.stockMovement.count({ where: { createdAt: { lte: SHEET_ERA_END } } })
  if (prior > 0) throw new Error(`${prior} ledger entries already date from the spreadsheet period; looks imported already. Aborting.`)

  await prisma.$transaction(
    async (tx) => {
      // New sizes first so movements can reference them.
      for (const v of resolver.newVariants.values()) {
        let optionId = v.sizeOptionId
        if (!optionId) optionId = (await tx.productOption.create({ data: { productId: v.productId, name: 'Size' } })).id
        const valueId = v.sizeValueId ?? (await tx.productOptionValue.create({ data: { optionId, value: v.size } })).id
        const created = await tx.productVariant.create({
          data: { productId: v.productId, stockQty: 0, optionValues: { create: { optionValueId: valueId } } },
        })
        v.variantId = created.id
      }

      for (const [productId, { cost, supplier }] of stock.costByProduct)
        await tx.product.update({ where: { id: productId }, data: { costPriceKes: cost, supplier } })

      await tx.stockMovement.createMany({
        data: stock.movements.map((m) => ({
          productId: m.variant.productId,
          variantId: m.variant.variantId,
          direction: m.direction,
          reason: m.reason,
          quantity: m.quantity,
          unitCostKes: m.unitCostKes,
          unitPriceKes: m.unitPriceKes,
          supplier: m.supplier,
          counterparty: m.counterparty,
          note: m.note,
          createdAt: m.createdAt,
        })),
      })

      for (const e of stock.target.values())
        await tx.productVariant.update({ where: { id: e.variant.variantId! }, data: { stockQty: Math.max(0, e.qty) } })

      for (const c of crm.customers) {
        const notes = [
          'Imported from the stock tracker spreadsheet.',
          c.sizes.size ? `Sizes: ${[...c.sizes].join(', ')}` : null,
          c.sheetOrderValues.length ? `Spreadsheet "order value": ${c.sheetOrderValues.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join('\n')
        const data = {
          firstName: c.firstName,
          lastName: c.lastName,
          gender: c.gender,
          location: c.location,
          source: c.source,
          lastProduct: c.lastProduct,
          lastQuantity: c.lastQuantity,
          totalOrders: c.purchases.size,
          notes,
          createdAt: c.createdAt,
        }
        if (c.phone) await tx.customer.upsert({ where: { phone: c.phone }, create: { phone: c.phone, ...data }, update: data })
        else await tx.customer.create({ data })
      }
    },
    { timeout: 180_000, maxWait: 20_000 },
  )
  console.log('\nImport written.')
}

main().finally(() => prisma.$disconnect())
