/**
 * Syncs the site's stock ledger with a fresh export of the
 * "RICH G COLLECTION - STOCK TRACKER" workbook. Re-run it on every export.
 *
 *   npx tsx scripts/sync-stock-tracker.ts "<path to export>.xlsx" [--apply]
 *
 * Dry run by default. Every Stock In / Stock Out row is matched against the
 * ledger by date, product, direction, type, quantity and customer:
 *   - rows already on the site are left alone;
 *   - rows that match except for the size are corrected (the sheet was edited);
 *   - rows with no match are added, with PROFIT-sheet discounts applied;
 *   - ledger entries the sheet no longer has are listed, never deleted.
 * Finally each size's stock is set to the sheet balance (in - out), and any
 * difference left over is logged as an ADJUSTMENT entry.
 */
import 'dotenv/config'
import ExcelJS from 'exceljs'
import type { StockMovementReason } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

const [xlsxPath, ...flags] = process.argv.slice(2)
const APPLY = flags.includes('--apply')
if (!xlsxPath) throw new Error('Usage: sync-stock-tracker.ts <export.xlsx> [--apply]')

const REVIEW = 'Needs review:'
const TZ = 'Africa/Nairobi'
const DAY = 86_400_000

// ---------------------------------------------------------------- sheet mapping

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

const TYPES_BY_PROFIT_ITEM: Record<string, string[]> = {
  'GYM SHORTS': ['Gym Shorts'],
  'GYM VEST': ['Gym Vest'],
  'R TSHIRTS': ['Round Neck T-Shirt'],
  'O TSHIRT': ['Oversized T-Shirt'],
  'L TSHIRT': ['Long Sleeve T-Shirt'],
  'C SHIRT': ['Collarless Shirt'],
  'O SHIRTS': ['Official Shirt', 'Oversized T-Shirt'],
  TROUSERS: ['Side Adjuster Trousers', 'Belted Trousers'],
}

const COLOR_ALIASES: Record<string, string[]> = {
  STRIPPED: ['Striped'],
  BLUE: ['Blue', 'Navy Blue'],
  // Older black batch (sizes already written as the true size).
  'BLACK L': ['Black'],
}

// Products in the sheet that aren't on the site yet: skipped and reported.
const SKIP_PRODUCTS = new Set(['navy blue round neck t-shirt'])

const REASON_BY_TYPE: Record<string, { reason: StockMovementReason; note?: string }> = {
  SALE: { reason: 'MANUAL_SALE' },
  INFLUENCER: { reason: 'INFLUENCER' },
  REWARD: { reason: 'REWARD' },
  EMPLOYEE: { reason: 'REWARD', note: 'Employee' },
}

// ---------------------------------------------------------------- helpers

const str = (v: unknown) => (v == null ? '' : String(v).trim())
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
const normSize = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/^XXL$/, '2XL')
const normName = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const num = (v: unknown) => {
  const n = Number(v)
  return v !== null && v !== '' && Number.isFinite(n) ? Math.round(n) : null
}
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })

function parseDate(v: unknown, fallback?: Date): Date {
  const s = str(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T09:00:00+03:00`)
  if (fallback) return fallback
  throw new Error(`Bad date: "${s}"`)
}

// ---------------------------------------------------------------- workbook

type Row = Record<string, string | number | null> & { _row: number }

function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v == null) return null
  // Excel dates are stored as local calendar dates at UTC midnight.
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue)
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String(v.text)
    if ('error' in v) return null
  }
  return v as string | number
}

async function readSheets(path: string, names: string[]) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const out: Record<string, Row[]> = {}
  for (const name of names) {
    const ws = wb.getWorksheet(name)
    if (!ws) throw new Error(`Sheet "${name}" not found in ${path}`)
    let header: string[] | null = null
    const rows: Row[] = []
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue)
      if (!header) {
        if (values.filter((c) => str(c)).length >= 3) header = values.map((c) => str(c))
        return
      }
      if (values.every((c) => !str(c))) return
      const r = { _row: rowNumber } as Row
      header.forEach((k, i) => { if (k) r[k] = values[i] ?? null })
      rows.push(r)
    })
    out[name] = rows
  }
  return out
}

// ---------------------------------------------------------------- catalog

type Variant = { key: string; productId: string; productName: string; type: string; variantId: string | null; size: string; stockQty: number }
type NewVariant = Variant & { sizeOptionId: string | null; sizeValueId: string | null }

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
  const products = new Map<string, { id: string; name: string; sizeOptionId: string | null; sizeValues: Map<string, string> }>()
  const variants = new Map<string, Variant>()
  for (const p of rows) {
    const type = Object.values(TYPE_BY_CATEGORY).find((t) => p.name.endsWith(t)) ?? ''
    const sizeOption = p.options.find((o) => o.name === 'Size')
    products.set(p.name.toLowerCase(), {
      id: p.id,
      name: p.name,
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
  | { kind: 'ok'; variant: Variant; flag?: string; substituted?: boolean }
  | { kind: 'skip'; product: string }
  | { kind: 'error'; message: string }

// Same rules as the original import, so existing ledger entries line up.
function makeResolver(catalog: Awaited<ReturnType<typeof loadCatalog>>) {
  const newVariants = new Map<string, NewVariant>()
  return {
    newVariants,
    resolve(row: Row): Resolved {
      let category = str(row.CATEGORY).toUpperCase()
      const sizeRaw = str(row.SIZE)
      // A waist/leg size on an "OFFICIAL" row is a pair of trousers.
      let note: string | undefined
      if (category === 'OFFICIAL' && /^W\d/i.test(sizeRaw)) {
        category = 'BELTED'
        note = `${REVIEW} the spreadsheet lists this as an Official shirt in trouser size ${sizeRaw}; recorded as Belted Trousers.`
      }
      const type = TYPE_BY_CATEGORY[category]
      if (!type) return { kind: 'error', message: `unknown category "${category}"` }
      const colorRaw = str(row.COLOR).toUpperCase()
      const colors = COLOR_ALIASES[colorRaw] ?? [titleCase(colorRaw)]
      const size = normSize(sizeRaw)

      if (SKIP_PRODUCTS.has(`${colors[0]} ${type}`.toLowerCase())) return { kind: 'skip', product: `${colors[0]} ${type}` }

      for (const c of colors) {
        const name = `${c} ${type}`.toLowerCase()
        const hit = catalog.variants.get(`${name}|${size}`) ?? newVariants.get(`${name}|${size}`)
        if (hit) return { kind: 'ok', variant: hit, flag: note }
        const product = catalog.products.get(name)
        if (product) {
          const v: NewVariant = {
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
            flag: note ?? `${REVIEW} size ${v.size} didn't exist on ${product.name}, so it was added during the spreadsheet sync. Check the size and stock are right.`,
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

// ---------------------------------------------------------------- plan

type SheetMove = {
  sheetRow: string
  variant: Variant
  direction: 'IN' | 'OUT'
  reason: StockMovementReason
  quantity: number
  unitCostKes: number | null
  unitPriceKes: number | null
  discountKes: number | null
  supplier: string | null
  counterparty: string | null
  note: string | null
  affectsStock: boolean
  createdAt: Date
}

function planSheet(sheets: Record<string, Row[]>, resolver: ReturnType<typeof makeResolver>) {
  const problems: string[] = []
  const skipped = new Map<string, number>()
  const moves: SheetMove[] = []
  const costByVariant = new Map<string, number>()
  const costByProduct = new Map<string, number>()

  const resolve = (sheet: string, row: Row) => {
    const r = resolver.resolve(row)
    if (r.kind === 'skip') skipped.set(r.product, (skipped.get(r.product) ?? 0) + 1)
    if (r.kind === 'error') problems.push(`${sheet} row ${row._row}: ${r.message}, skipped`)
    return r.kind === 'ok' ? r : null
  }

  for (const row of sheets['Stock In']) {
    const r = resolve('Stock In', row)
    if (!r) continue
    const qty = num(row['QUANTITY IN'])
    if (!qty || qty <= 0) { problems.push(`Stock In row ${row._row}: bad quantity "${row['QUANTITY IN']}", skipped`); continue }
    const cost = num(row['COST PER UNIT'])
    if (cost != null) { costByVariant.set(r.variant.key, cost); costByProduct.set(r.variant.productId, cost) }
    moves.push({
      sheetRow: `Stock In ${row._row}`,
      variant: r.variant,
      direction: 'IN',
      reason: 'RESTOCK',
      quantity: qty,
      unitCostKes: cost,
      unitPriceKes: null,
      discountKes: null,
      supplier: titleCase(str(row.SUPPIER)) || null,
      counterparty: null,
      note: r.flag ?? null,
      affectsStock: !r.substituted,
      createdAt: parseDate(row.DATE),
    })
  }

  let lastDate: Date | undefined
  for (const row of sheets['Stock Out']) {
    const r = resolve('Stock Out', row)
    if (!r) continue
    const qty = num(row['QUANTITY OUT'])
    const type = REASON_BY_TYPE[str(row.TYPE).toUpperCase()]
    if (!qty || qty <= 0) { problems.push(`Stock Out row ${row._row}: bad quantity "${row['QUANTITY OUT']}", skipped`); continue }
    if (!type) { problems.push(`Stock Out row ${row._row}: unknown type "${row.TYPE}", skipped`); continue }
    const price = num(row['PRICE PER UNIT'])
    let note = [type.note, r.flag].filter(Boolean).join(' ') || null
    if (type.reason === 'MANUAL_SALE' && !price) {
      problems.push(`Stock Out row ${row._row}: sale with no price (${r.variant.productName} ${r.variant.size}), flagged`)
      note = `${REVIEW} this sale has no price in the spreadsheet, so it isn't counted in revenue or profit.`
    }
    lastDate = parseDate(row.DATE, lastDate)
    moves.push({
      sheetRow: `Stock Out ${row._row}`,
      variant: r.variant,
      direction: 'OUT',
      reason: type.reason,
      quantity: qty,
      unitCostKes: costByVariant.get(r.variant.key) ?? costByProduct.get(r.variant.productId) ?? null,
      unitPriceKes: type.reason === 'MANUAL_SALE' && price ? price : null,
      discountKes: null,
      supplier: null,
      counterparty: titleCase(str(row['CUSTOMER/ INFLUENCER'])).replace(/\s+/g, ' ') || null,
      note,
      affectsStock: !r.substituted,
      createdAt: lastDate,
    })
  }

  const target = new Map<string, { variant: Variant; qty: number }>()
  for (const m of moves) {
    if (!m.affectsStock) continue
    const e = target.get(m.variant.key) ?? { variant: m.variant, qty: 0 }
    e.qty += m.direction === 'IN' ? m.quantity : -m.quantity
    target.set(m.variant.key, e)
  }
  return { moves, problems, skipped, target }
}

// PROFIT-sheet discounts for newly added sales: same product type and list
// price, same day (or the day either side). PROFIT rows with no new sale
// nearby belong to sales already on the site and are ignored.
function applyDiscounts(profitRows: Row[], sales: SheetMove[]) {
  const problems: string[] = []
  const used = new Set<SheetMove>()
  for (const row of profitRows) {
    const discount = num(row.DISCOUNT) ?? 0
    const qty = num(row.QUANTITY) ?? 0
    const price = num(row['SELLING PRICE'])
    if (discount <= 0 || qty <= 0 || !price || !str(row.DATE)) continue
    const date = parseDate(row.DATE)
    const types = TYPES_BY_PROFIT_ITEM[str(row.ITEM).toUpperCase()]
    const nearby = sales.filter((m) => Math.abs(m.createdAt.getTime() - date.getTime()) <= DAY)
    if (!nearby.length) continue
    if (!types) { problems.push(`PROFIT row ${row._row}: unknown item "${row.ITEM}", discount not applied`); continue }
    let remaining = qty
    const candidates = nearby
      .filter((m) => !used.has(m) && types.includes(m.variant.type) && m.unitPriceKes === price)
      .map((m) => ({ m, gap: Math.abs(m.createdAt.getTime() - date.getTime()) / DAY }))
      .sort((a, b) => a.gap - b.gap)
    for (const { m } of candidates) {
      if (remaining <= 0) break
      if (m.quantity > remaining) continue
      used.add(m)
      m.discountKes = discount * m.quantity
      remaining -= m.quantity
    }
    if (remaining > 0)
      problems.push(`PROFIT row ${row._row} (${fmtDate(date)} ${row.ITEM} x${qty}, KES ${discount}/item off): no matching new sale for ${remaining} item(s)`)
  }
  return problems
}

// Flag for ledger entries the spreadsheet doesn't have.
const orphanNote = () =>
  `${REVIEW} this entry isn't in the stock tracker spreadsheet (checked ${fmtDate(new Date())}), so the synced stock count doesn't include it. If it really went out, add it to the sheet; otherwise delete it here.`

// ---------------------------------------------------------------- run

async function main() {
  const sheets = await readSheets(xlsxPath, ['Stock In', 'Stock Out', 'PROFIT'])
  const catalog = await loadCatalog()
  const resolver = makeResolver(catalog)
  const plan = planSheet(sheets, resolver)

  // Ledger entries that came from (or belong in) the sheet: everything except
  // adjustments and online orders.
  const ledger = await prisma.stockMovement.findMany({
    where: { reason: { notIn: ['ADJUSTMENT', 'ONLINE_SALE'] }, orderId: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true, productId: true, variantId: true, direction: true, reason: true, quantity: true,
      counterparty: true, createdAt: true, unitCostKes: true, note: true, product: { select: { name: true } },
      variant: { select: { optionValues: { select: { optionValue: { select: { value: true } } } } } },
    },
  })
  type Entry = (typeof ledger)[number]
  const loose = (m: { createdAt: Date; productId: string; direction: string; reason: string; quantity: number; counterparty: string | null }) =>
    [dayKey(m.createdAt), m.productId, m.direction, m.reason, m.quantity, normName(m.counterparty)].join('|')

  const pool = new Map<string, Entry[]>()
  for (const e of ledger) pool.set(loose(e), [...(pool.get(loose(e)) ?? []), e])
  const take = (key: string, pick: (e: Entry) => boolean) => {
    const list = pool.get(key)
    const i = list?.findIndex(pick) ?? -1
    return i >= 0 ? list!.splice(i, 1)[0] : undefined
  }

  // Pass 1: exact matches (including size). Pass 2: same entry, size changed.
  const unmatched: SheetMove[] = []
  for (const m of plan.moves)
    if (!(m.variant.variantId && take(loose({ ...m, productId: m.variant.productId }), (e) => e.variantId === m.variant.variantId))) unmatched.push(m)
  const corrections: { entry: Entry; move: SheetMove }[] = []
  const added: SheetMove[] = []
  for (const m of unmatched) {
    const entry = take(loose({ ...m, productId: m.variant.productId }), () => true)
    if (entry) corrections.push({ entry, move: m })
    else added.push(m)
  }
  const orphans = [...pool.values()].flat()
  const discountProblems = applyDiscounts(sheets.PROFIT, added.filter((m) => m.reason === 'MANUAL_SALE' && m.unitPriceKes))

  // Stock: start from current counts, apply the new/corrected entries, then
  // adjust whatever is left to reach the sheet balance.
  const projected = new Map<string, number>()
  const bump = (v: Variant, d: number) => projected.set(v.key, (projected.get(v.key) ?? v.stockQty) + d)
  const variantByEntry = (e: Entry) => [...catalog.variants.values()].find((v) => v.variantId === e.variantId)
  for (const m of added) if (m.affectsStock) bump(m.variant, m.direction === 'IN' ? m.quantity : -m.quantity)
  for (const { entry, move } of corrections) {
    if (!move.affectsStock) continue
    const sign = move.direction === 'IN' ? 1 : -1
    const old = variantByEntry(entry)
    if (old) bump(old, -sign * move.quantity)
    bump(move.variant, sign * move.quantity)
  }
  const adjustments = [...plan.target.values()]
    .map((t) => {
      const goal = Math.max(0, t.qty)
      const after = projected.get(t.variant.key) ?? t.variant.stockQty
      return { variant: t.variant, from: t.variant.stockQty, goal, diff: goal - after }
    })
  const stockChanges = adjustments.filter((a) => a.goal !== a.from || a.variant.variantId === null)

  // ------------------------------------------------------------ report
  const sizeOf = (e: Entry) => e.variant?.optionValues.map((o) => o.optionValue.value).join('/') ?? '-'
  const line = (m: SheetMove) =>
    `${m.sheetRow}: ${fmtDate(m.createdAt)} ${m.reason} ${m.direction} ${m.quantity} x ${m.variant.productName} ${m.variant.size}` +
    `${m.counterparty ? ` (${m.counterparty})` : ''}${m.unitPriceKes ? ` @ ${m.unitPriceKes}` : ''}${m.discountKes ? ` - ${m.discountKes} disc` : ''}${m.affectsStock ? '' : ' [no stock change]'}`

  console.log(`\n=== STOCK TRACKER SYNC ${APPLY ? '(APPLY)' : '(dry run)'}`)
  console.log(`sheet rows: ${plan.moves.length} usable, already on site: ${plan.moves.length - unmatched.length}`)
  console.log(`\nnew entries to add: ${added.length}`)
  for (const m of added) console.log(`   ${line(m)}`)
  console.log(`\nsize corrections: ${corrections.length}`)
  for (const { entry, move } of corrections) console.log(`   ${move.sheetRow}: ${fmtDate(move.createdAt)} ${entry.product.name} ${sizeOf(entry)} -> ${move.variant.productName} ${move.variant.size}${move.counterparty ? ` (${move.counterparty})` : ''}`)
  console.log(`\nnew sizes to create: ${resolver.newVariants.size}`)
  for (const v of resolver.newVariants.values()) console.log(`   ${v.productName} ${v.size}`)
  console.log(`\nstock counts to change: ${stockChanges.length}`)
  for (const a of stockChanges) console.log(`   ${a.variant.productName} ${a.variant.size}: ${a.variant.variantId ? a.from : '(new)'} -> ${a.goal}`)
  const adj = adjustments.filter((a) => a.diff !== 0)
  console.log(`\nleftover adjustments (stock the ledger can't explain): ${adj.length}`)
  for (const a of adj) console.log(`   ${a.variant.productName} ${a.variant.size}: ${a.diff > 0 ? '+' : ''}${a.diff}`)
  for (const t of plan.target.values()) if (t.qty < 0) console.log(`   ! ${t.variant.productName} ${t.variant.size}: sheet balance is ${t.qty}, stock set to 0`)
  console.log(`\non the site but not in the sheet (left alone): ${orphans.length}`)
  for (const e of orphans) console.log(`   ${fmtDate(e.createdAt)} ${e.reason} ${e.direction} ${e.quantity} x ${e.product.name} ${sizeOf(e)}${e.counterparty ? ` (${e.counterparty})` : ''}`)
  console.log(`\nskipped (not on the site):`)
  for (const [p, n] of plan.skipped) console.log(`   ${p}: ${n} row(s)`)
  const problems = [...plan.problems, ...discountProblems]
  console.log(`\nproblems: ${problems.length}`)
  for (const p of problems) console.log(`   ${p}`)

  if (!APPLY) return

  const stamp = `Synced to the RICH G COLLECTION stock tracker spreadsheet (${fmtDate(new Date())}).`
  await prisma.$transaction(
    async (tx) => {
      for (const v of resolver.newVariants.values()) {
        const optionId = v.sizeOptionId ?? (await tx.productOption.create({ data: { productId: v.productId, name: 'Size' } })).id
        const valueId = v.sizeValueId ?? (await tx.productOptionValue.create({ data: { optionId, value: v.size } })).id
        const created = await tx.productVariant.create({
          data: { productId: v.productId, stockQty: 0, optionValues: { create: { optionValueId: valueId } } },
        })
        v.variantId = created.id
      }

      for (const { entry, move } of corrections)
        await tx.stockMovement.update({
          where: { id: entry.id },
          data: { variantId: move.variant.variantId, ...(move.direction === 'IN' && move.unitCostKes != null ? { unitCostKes: move.unitCostKes } : {}) },
        })

      await tx.stockMovement.createMany({
        data: added.map((m) => ({
          productId: m.variant.productId,
          variantId: m.variant.variantId,
          direction: m.direction,
          reason: m.reason,
          quantity: m.quantity,
          unitCostKes: m.unitCostKes,
          unitPriceKes: m.unitPriceKes,
          discountKes: m.discountKes,
          supplier: m.supplier,
          counterparty: m.counterparty,
          note: m.note,
          createdAt: m.createdAt,
        })),
      })

      for (const a of adj)
        await tx.stockMovement.create({
          data: {
            productId: a.variant.productId,
            variantId: a.variant.variantId,
            direction: a.diff > 0 ? 'IN' : 'OUT',
            reason: 'ADJUSTMENT',
            quantity: Math.abs(a.diff),
            note: stamp,
          },
        })

      for (const a of adjustments)
        await tx.productVariant.update({ where: { id: a.variant.variantId! }, data: { stockQty: a.goal } })

      for (const e of orphans) {
        if (e.note?.startsWith(REVIEW)) continue
        await tx.stockMovement.update({ where: { id: e.id }, data: { note: [orphanNote(), e.note].filter(Boolean).join('\n') } })
      }
    },
    { timeout: 180_000, maxWait: 20_000 },
  )
  console.log('\nSync written.')
}

main().finally(() => prisma.$disconnect())
