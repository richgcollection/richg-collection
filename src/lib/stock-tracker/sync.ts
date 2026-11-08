import { randomUUID } from 'node:crypto'
import type { Prisma, StockMovementReason } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { addSalesRecordCustomers } from '@/lib/stock-tracker/customers'
import {
  COLOR_ALIASES,
  REASON_BY_SHEET_TYPE,
  REVIEW,
  SHEET_NAMES,
  SITE_ID_COLUMN,
  SKIP_PRODUCTS,
  TYPES_BY_PROFIT_ITEM,
  TYPE_BY_CATEGORY,
  dayKey,
  fmtDate,
  normName,
  normSize,
  num,
  parseSheetDate,
  str,
  titleCase,
} from '@/lib/stock-tracker/mapping'

/**
 * Sync from the "RICH G COLLECTION - STOCK TRACKER" sheet to the site's stock
 * ledger. The sheet is the source of truth:
 *   - a row with a SITE ID is linked to that ledger entry, and the entry is
 *     updated whenever the row is edited;
 *   - a row without one is matched by date, product, direction, type,
 *     quantity and customer (fixing the size if only that differs), or added;
 *     either way its SITE ID is sent back for the sheet to store;
 *   - ledger entries the sheet doesn't have are flagged "Needs review", never
 *     deleted;
 *   - each size's stock is set to the sheet balance (plus site entries still
 *     waiting to be written to the sheet), with any leftover difference logged
 *     as an ADJUSTMENT.
 */

export type SheetRow = Record<string, string | number | boolean | null> & { _row: number }
export type SheetData = Record<string, SheetRow[]>

const DAY = 86_400_000
/** More orphans than this in one run looks like rows were deleted by mistake. */
const MAX_NEW_ORPHANS = 10
const ORPHAN_MARK = "isn't in the stock tracker spreadsheet"

const orphanNote = () =>
  `${REVIEW} this entry ${ORPHAN_MARK} (checked ${fmtDate(new Date())}), so the synced stock count doesn't include it. If it really went out, add it to the sheet; otherwise delete it here.`

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
  const byVariantId = new Map<string, Variant>()
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
      const variant = { key, productId: p.id, productName: p.name, type, variantId: v.id, size, stockQty: v.stockQty }
      variants.set(key, variant)
      byVariantId.set(v.id, variant)
    }
  }
  return { products, variants, byVariantId }
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
    resolve(row: SheetRow): Resolved {
      let category = str(row.CATEGORY).toUpperCase()
      const sizeRaw = str(row.SIZE)
      let note: string | undefined
      // A waist/leg size on an "OFFICIAL" row is a pair of trousers.
      if (category === 'OFFICIAL' && /^W\d/i.test(sizeRaw)) {
        category = 'BELTED'
        note = `${REVIEW} the spreadsheet lists this as an Official shirt in trouser size ${sizeRaw}; recorded as Belted Trousers.`
      }
      const type = TYPE_BY_CATEGORY[category]
      if (!type) return { kind: 'error', message: `unknown category "${category}"` }
      const colorRaw = str(row.COLOR).toUpperCase()
      const colors = COLOR_ALIASES[colorRaw] ?? [titleCase(colorRaw)]
      const size = normSize(sizeRaw)
      if (!size) return { kind: 'error', message: 'no size' }

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

// ---------------------------------------------------------------- sheet rows

type SheetMove = {
  sheet: string
  row: number
  siteId: string | null
  /** Ledger id: the linked entry, or a fresh id for a new one. */
  id: string | null
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

const label = (m: { sheet: string; row: number }) => `${m.sheet} row ${m.row}`
const isBlank = (row: SheetRow, keys: string[]) => keys.every((k) => !str(row[k]))

function planSheet(sheets: SheetData, resolver: ReturnType<typeof makeResolver>) {
  const problems: string[] = []
  const skipped = new Map<string, number>()
  const moves: SheetMove[] = []
  /** Rows linked to an entry but not mappable to a product (still claim it). */
  const linkedOnly = new Set<string>()
  const costByVariant = new Map<string, number>()
  const costByProduct = new Map<string, number>()

  const resolve = (sheet: string, row: SheetRow) => {
    const r = resolver.resolve(row)
    if (r.kind === 'ok') return r
    const siteId = str(row[SITE_ID_COLUMN]) || null
    if (siteId) linkedOnly.add(siteId)
    if (r.kind === 'skip') skipped.set(r.product, (skipped.get(r.product) ?? 0) + 1)
    else if (!siteId) problems.push(`${sheet} row ${row._row}: ${r.message}, skipped`)
    return null
  }

  for (const row of sheets[SHEET_NAMES.in] ?? []) {
    if (isBlank(row, ['CATEGORY', 'QUANTITY IN'])) continue
    const r = resolve(SHEET_NAMES.in, row)
    if (!r) continue
    const qty = num(row['QUANTITY IN'])
    if (!qty || qty <= 0) { problems.push(`Stock In row ${row._row}: bad quantity "${row['QUANTITY IN'] ?? ''}", skipped`); continue }
    const cost = num(row['COST PER UNIT'])
    if (cost != null) { costByVariant.set(r.variant.key, cost); costByProduct.set(r.variant.productId, cost) }
    let createdAt: Date
    try { createdAt = parseSheetDate(row.DATE) } catch { problems.push(`Stock In row ${row._row}: bad date "${row.DATE ?? ''}", skipped`); continue }
    const siteId = str(row[SITE_ID_COLUMN]) || null
    moves.push({
      sheet: SHEET_NAMES.in,
      row: row._row,
      siteId,
      id: siteId,
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
      createdAt,
    })
  }

  let lastDate: Date | undefined
  for (const row of sheets[SHEET_NAMES.out] ?? []) {
    if (isBlank(row, ['CATEGORY', 'QUANTITY OUT'])) continue
    const r = resolve(SHEET_NAMES.out, row)
    if (!r) continue
    const qty = num(row['QUANTITY OUT'])
    const type = REASON_BY_SHEET_TYPE[str(row.TYPE).toUpperCase()]
    if (!qty || qty <= 0) { problems.push(`Stock Out row ${row._row}: bad quantity "${row['QUANTITY OUT'] ?? ''}", skipped`); continue }
    if (!type) { problems.push(`Stock Out row ${row._row}: unknown type "${row.TYPE ?? ''}", skipped`); continue }
    const price = num(row['PRICE PER UNIT'])
    const isSale = type.reason === 'MANUAL_SALE' || type.reason === 'ONLINE_SALE'
    let note = [type.note, r.flag].filter(Boolean).join(' ') || null
    if (isSale && !price) {
      problems.push(`Stock Out row ${row._row}: sale with no price (${r.variant.productName} ${r.variant.size}), flagged`)
      note = `${REVIEW} this sale has no price in the spreadsheet, so it isn't counted in revenue or profit.`
    }
    try { lastDate = parseSheetDate(row.DATE, lastDate) } catch { problems.push(`Stock Out row ${row._row}: bad date "${row.DATE ?? ''}", skipped`); continue }
    const siteId = str(row[SITE_ID_COLUMN]) || null
    moves.push({
      sheet: SHEET_NAMES.out,
      row: row._row,
      siteId,
      id: siteId,
      variant: r.variant,
      direction: 'OUT',
      reason: type.reason,
      quantity: qty,
      unitCostKes: costByVariant.get(r.variant.key) ?? costByProduct.get(r.variant.productId) ?? null,
      unitPriceKes: isSale && price ? price : null,
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
  return { moves, problems, skipped, target, linkedOnly }
}

// PROFIT-sheet discounts for newly added sales: same product type and list
// price, same day (or the day either side). PROFIT rows with no new sale
// nearby belong to sales already on the site and are ignored.
function applyDiscounts(profitRows: SheetRow[], sales: SheetMove[]) {
  const problems: string[] = []
  const used = new Set<SheetMove>()
  for (const row of profitRows) {
    const discount = num(row.DISCOUNT) ?? 0
    const qty = num(row.QUANTITY) ?? 0
    const price = num(row['SELLING PRICE'])
    if (discount <= 0 || qty <= 0 || !price || !/^\d{4}-\d{2}-\d{2}$/.test(str(row.DATE))) continue
    const date = parseSheetDate(row.DATE)
    const nearby = sales.filter((m) => Math.abs(m.createdAt.getTime() - date.getTime()) <= DAY)
    if (!nearby.length) continue
    const types = TYPES_BY_PROFIT_ITEM[str(row.ITEM).toUpperCase()]
    if (!types) { problems.push(`PROFIT row ${row._row}: unknown item "${row.ITEM ?? ''}", discount not applied`); continue }
    let remaining = qty
    const candidates = nearby
      .filter((m) => !used.has(m) && types.includes(m.variant.type) && m.unitPriceKes === price)
      .sort((a, b) => Math.abs(a.createdAt.getTime() - date.getTime()) - Math.abs(b.createdAt.getTime() - date.getTime()))
    for (const m of candidates) {
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

// ---------------------------------------------------------------- plan

async function loadLedger() {
  return prisma.stockMovement.findMany({
    where: { reason: { not: 'ADJUSTMENT' } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true, productId: true, variantId: true, direction: true, reason: true, quantity: true,
      counterparty: true, createdAt: true, unitCostKes: true, unitPriceKes: true, discountKes: true,
      note: true, orderId: true, createdById: true, sheetExportedAt: true,
      product: { select: { name: true } },
      variant: { select: { optionValues: { select: { optionValue: { select: { value: true } } } } } },
    },
  })
}
type Entry = Awaited<ReturnType<typeof loadLedger>>[number]

/** Site-made entries not yet written to the sheet. */
const isPending = (e: Entry) => !e.sheetExportedAt && (e.orderId != null || e.createdById != null)
/** Substituted entries were recorded without touching the variant's stock. */
const entryAffectsStock = (e: Entry) => !e.note?.includes('was not changed for it')

type Update = { entry: Entry; move: SheetMove; data: Prisma.StockMovementUncheckedUpdateInput; changes: string[] }

/** What has to change on a linked entry for it to match its sheet row. */
function diffEntry(entry: Entry, m: SheetMove, { linked }: { linked: boolean }): Update | null {
  const data: Prisma.StockMovementUncheckedUpdateInput = {}
  const changes: string[] = []
  const variantId = m.variant.variantId
  if (entry.variantId !== variantId || entry.productId !== m.variant.productId) {
    data.productId = m.variant.productId
    data.variantId = variantId
    changes.push(`product/size -> ${m.variant.productName} ${m.variant.size}`)
  }
  if (entry.quantity !== m.quantity) { data.quantity = m.quantity; changes.push(`quantity ${entry.quantity} -> ${m.quantity}`) }
  if (entry.direction !== m.direction) { data.direction = m.direction; changes.push(`direction -> ${m.direction}`) }
  // An online sale stays an online sale; its order owns the type and buyer.
  if (!entry.orderId) {
    if (entry.reason !== m.reason) { data.reason = m.reason; changes.push(`type ${entry.reason} -> ${m.reason}`) }
    if (normName(entry.counterparty) !== normName(m.counterparty)) { data.counterparty = m.counterparty; changes.push(`customer -> ${m.counterparty ?? '(none)'}`) }
  }
  if (dayKey(entry.createdAt) !== dayKey(m.createdAt)) { data.createdAt = m.createdAt; changes.push(`date -> ${fmtDate(m.createdAt)}`) }
  // Prices only follow edits to rows already linked by SITE ID: older entries
  // may store a discounted unit price the sheet doesn't show.
  const discounted = (entry.discountKes ?? 0) > 0 || entry.note?.includes('Discount KES')
  if (linked && m.direction === 'OUT' && !discounted && !entry.orderId && m.unitPriceKes != null && entry.unitPriceKes !== m.unitPriceKes) {
    data.unitPriceKes = m.unitPriceKes
    changes.push(`price ${entry.unitPriceKes ?? '-'} -> ${m.unitPriceKes}`)
  }
  if (linked && m.direction === 'IN' && m.unitCostKes != null && entry.unitCostKes !== m.unitCostKes) {
    data.unitCostKes = m.unitCostKes
    changes.push(`cost ${entry.unitCostKes ?? '-'} -> ${m.unitCostKes}`)
  }
  if (entry.note?.includes(ORPHAN_MARK)) {
    data.note = entry.note.split('\n').filter((l) => !l.includes(ORPHAN_MARK)).join('\n') || null
    changes.push('cleared "not in the sheet" flag')
  }
  if (isPending(entry)) data.sheetExportedAt = new Date()
  return changes.length || data.sheetExportedAt ? { entry, move: m, data, changes } : null
}

export type SyncPlan = Awaited<ReturnType<typeof planSync>>

export async function planSync(sheets: SheetData) {
  for (const name of [SHEET_NAMES.in, SHEET_NAMES.out])
    if (!sheets[name]?.length) throw new Error(`The "${name}" sheet is missing or empty.`)

  const catalog = await loadCatalog()
  const resolver = makeResolver(catalog)
  const sheet = planSheet(sheets, resolver)
  const ledger = await loadLedger()
  const byId = new Map(ledger.map((e) => [e.id, e]))

  const claimed = new Set<string>(sheet.linkedOnly)
  const updates: Update[] = []
  const staleLinks: SheetMove[] = []
  const links: { sheet: string; row: number; id: string }[] = []

  // 1. Rows already linked by SITE ID.
  for (const m of sheet.moves) {
    if (!m.siteId) continue
    const entry = byId.get(m.siteId)
    if (!entry || claimed.has(entry.id)) { staleLinks.push(m); continue }
    claimed.add(entry.id)
    const u = diffEntry(entry, m, { linked: true })
    if (u) updates.push(u)
  }

  // 2. Unlinked rows: exact match, then same entry with a different size.
  const loose = (m: { createdAt: Date; productId: string; direction: string; reason: string; quantity: number; counterparty: string | null }) =>
    [dayKey(m.createdAt), m.productId, m.direction, m.reason, m.quantity, normName(m.counterparty)].join('|')
  const pool = new Map<string, Entry[]>()
  for (const e of ledger) if (!claimed.has(e.id)) pool.set(loose(e), [...(pool.get(loose(e)) ?? []), e])
  const take = (m: SheetMove, pick: (e: Entry) => boolean) => {
    const list = pool.get(loose({ ...m, productId: m.variant.productId }))
    const i = list?.findIndex(pick) ?? -1
    return i >= 0 ? list!.splice(i, 1)[0] : undefined
  }
  const unlinked = sheet.moves.filter((m) => !m.siteId)
  const unmatched: SheetMove[] = []
  for (const m of unlinked) {
    const entry = m.variant.variantId ? take(m, (e) => e.variantId === m.variant.variantId) : undefined
    if (!entry) { unmatched.push(m); continue }
    m.id = entry.id
    const u = diffEntry(entry, m, { linked: false })
    if (u) updates.push(u)
  }
  const added: SheetMove[] = []
  for (const m of unmatched) {
    const entry = take(m, () => true)
    if (entry) {
      m.id = entry.id
      const u = diffEntry(entry, m, { linked: false })
      if (u) updates.push(u)
    } else {
      m.id = randomUUID()
      added.push(m)
    }
  }
  for (const m of unlinked) links.push({ sheet: m.sheet, row: m.row, id: m.id! })

  const leftovers = [...pool.values()].flat()
  const pending = leftovers.filter(isPending)
  const orphans = leftovers.filter((e) => !isPending(e))
  const newOrphans = orphans.filter((e) => !e.note?.startsWith(REVIEW))
  const discountProblems = applyDiscounts(sheets[SHEET_NAMES.profit] ?? [], added.filter((m) => m.reason === 'MANUAL_SALE' && m.unitPriceKes))

  // Stock: current counts + the effect of every new/changed entry, versus the
  // sheet balance (plus site entries still on their way to the sheet).
  const projected = new Map<string, number>()
  const bump = (v: Variant, d: number) => projected.set(v.key, (projected.get(v.key) ?? v.stockQty) + d)
  const effect = (dir: string, qty: number) => (dir === 'IN' ? qty : -qty)
  for (const m of added) if (m.affectsStock) bump(m.variant, effect(m.direction, m.quantity))
  for (const { entry, move, data } of updates) {
    if (!('variantId' in data || 'quantity' in data || 'direction' in data)) continue
    const old = entry.variantId ? catalog.byVariantId.get(entry.variantId) : undefined
    if (old && entryAffectsStock(entry)) bump(old, -effect(entry.direction, entry.quantity))
    if (move.affectsStock) bump(move.variant, effect(move.direction, move.quantity))
  }
  const target = new Map(sheet.target)
  for (const e of pending) {
    const v = e.variantId ? catalog.byVariantId.get(e.variantId) : undefined
    if (!v) continue
    const t = target.get(v.key) ?? { variant: v, qty: 0 }
    target.set(v.key, { variant: v, qty: t.qty + effect(e.direction, e.quantity) })
  }
  const stock = [...target.values()].map((t) => {
    const goal = Math.max(0, t.qty)
    const after = projected.get(t.variant.key) ?? t.variant.stockQty
    return { variant: t.variant, balance: t.qty, from: t.variant.stockQty, goal, diff: goal - after }
  })

  const problems = [
    ...sheet.problems,
    ...discountProblems,
    ...staleLinks.map((m) => `${label(m)}: its SITE ID points to an entry that no longer exists on the site (e.g. a cancelled online order). Delete the row or clear its SITE ID.`),
    ...stock.filter((s) => s.balance < 0).map((s) => `${s.variant.productName} ${s.variant.size}: sheet balance is ${s.balance}, stock set to 0`),
  ]

  return {
    resolver,
    moves: sheet.moves,
    skipped: sheet.skipped,
    added,
    updates,
    links,
    orphans,
    newOrphans,
    pending,
    stock,
    stockChanges: stock.filter((s) => s.goal !== s.from || s.variant.variantId === null),
    adjustments: stock.filter((s) => s.diff !== 0),
    problems,
    held: newOrphans.length > MAX_NEW_ORPHANS
      ? `${newOrphans.length} site entries have no row in the sheet (more than ${MAX_NEW_ORPHANS} at once), so nothing was changed. If rows were deleted by mistake, restore them; if not, run the sync from the command line with --force.`
      : null,
  }
}

// ---------------------------------------------------------------- apply

export async function applySync(plan: SyncPlan) {
  const stamp = `Synced to the RICH G COLLECTION stock tracker spreadsheet (${fmtDate(new Date())}).`
  const now = new Date()
  await prisma.$transaction(
    async (tx) => {
      for (const v of plan.resolver.newVariants.values()) {
        const optionId = v.sizeOptionId ?? (await tx.productOption.create({ data: { productId: v.productId, name: 'Size' } })).id
        const valueId = v.sizeValueId ?? (await tx.productOptionValue.create({ data: { optionId, value: v.size } })).id
        const created = await tx.productVariant.create({
          data: { productId: v.productId, stockQty: 0, optionValues: { create: { optionValueId: valueId } } },
        })
        v.variantId = created.id
      }

      for (const u of plan.updates) {
        // New sizes only got their id above.
        if ('variantId' in u.data) u.data.variantId = u.move.variant.variantId
        await tx.stockMovement.update({ where: { id: u.entry.id }, data: u.data })
      }

      if (plan.added.length)
        await tx.stockMovement.createMany({
          data: plan.added.map((m) => ({
            id: m.id!,
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
            sheetExportedAt: now,
          })),
        })

      for (const a of plan.adjustments)
        await tx.stockMovement.create({
          data: {
            productId: a.variant.productId,
            variantId: a.variant.variantId,
            direction: a.diff > 0 ? 'IN' : 'OUT',
            reason: 'ADJUSTMENT',
            quantity: Math.abs(a.diff),
            note: stamp,
            sheetExportedAt: now,
          },
        })

      for (const s of plan.stock)
        if (s.goal !== s.from || s.variant.variantId === null)
          await tx.productVariant.update({ where: { id: s.variant.variantId! }, data: { stockQty: s.goal } })

      for (const e of plan.newOrphans)
        await tx.stockMovement.update({ where: { id: e.id }, data: { note: [orphanNote(), e.note].filter(Boolean).join('\n') } })
    },
    { timeout: 120_000, maxWait: 20_000 },
  )
}

// ---------------------------------------------------------------- report

export function summarize(plan: SyncPlan) {
  return {
    sheetRows: plan.moves.length,
    added: plan.added.length,
    updated: plan.updates.filter((u) => u.changes.length).length,
    newSizes: plan.resolver.newVariants.size,
    stockChanges: plan.stockChanges.length,
    adjustments: plan.adjustments.length,
    newOrphans: plan.newOrphans.length,
    orphans: plan.orphans.length,
    pendingForSheet: plan.pending.length,
    skipped: Object.fromEntries(plan.skipped),
    problems: plan.problems,
  }
}

export function formatReport(plan: SyncPlan) {
  const out: string[] = []
  const move = (m: SheetMove) =>
    `${label(m)}: ${fmtDate(m.createdAt)} ${m.reason} ${m.direction} ${m.quantity} x ${m.variant.productName} ${m.variant.size}` +
    `${m.counterparty ? ` (${m.counterparty})` : ''}${m.unitPriceKes ? ` @ ${m.unitPriceKes}` : ''}${m.discountKes ? ` - ${m.discountKes} disc` : ''}${m.affectsStock ? '' : ' [no stock change]'}`
  const sizeOf = (e: Entry) => e.variant?.optionValues.map((o) => o.optionValue.value).join('/') ?? '-'
  out.push(`sheet rows: ${plan.moves.length} usable, ${plan.links.length} to link to their site entry`)
  out.push(`\nnew entries to add: ${plan.added.length}`, ...plan.added.map((m) => `   ${move(m)}`))
  const changed = plan.updates.filter((u) => u.changes.length)
  out.push(`\nentries to update: ${changed.length}`, ...changed.map((u) => `   ${label(u.move)}: ${u.entry.product.name} ${sizeOf(u.entry)} -- ${u.changes.join('; ')}`))
  out.push(`\nnew sizes to create: ${plan.resolver.newVariants.size}`, ...[...plan.resolver.newVariants.values()].map((v) => `   ${v.productName} ${v.size}`))
  out.push(`\nstock counts to change: ${plan.stockChanges.length}`, ...plan.stockChanges.map((s) => `   ${s.variant.productName} ${s.variant.size}: ${s.variant.variantId ? s.from : '(new)'} -> ${s.goal}`))
  out.push(`\nleftover adjustments: ${plan.adjustments.length}`, ...plan.adjustments.map((a) => `   ${a.variant.productName} ${a.variant.size}: ${a.diff > 0 ? '+' : ''}${a.diff}`))
  out.push(`\non the site but not in the sheet: ${plan.orphans.length} (${plan.newOrphans.length} new, flagged "Needs review")`)
  out.push(...plan.orphans.map((e) => `   ${fmtDate(e.createdAt)} ${e.reason} ${e.direction} ${e.quantity} x ${e.product.name} ${sizeOf(e)}${e.counterparty ? ` (${e.counterparty})` : ''}`))
  out.push(`\nsite entries waiting to be added to the sheet: ${plan.pending.length}`)
  out.push(`\nskipped (not on the site):`, ...[...plan.skipped].map(([p, n]) => `   ${p}: ${n} row(s)`))
  out.push(`\nproblems: ${plan.problems.length}`, ...plan.problems.map((p) => `   ${p}`))
  if (plan.held) out.push(`\nHELD: ${plan.held}`)
  return out.join('\n')
}

function headline(plan: SyncPlan, customersAdded: number) {
  const s = summarize(plan)
  const parts = [
    s.added && `${s.added} added`,
    s.updated && `${s.updated} updated`,
    s.stockChanges && `${s.stockChanges} stock counts changed`,
    s.newOrphans && `${s.newOrphans} flagged as missing from the sheet`,
    customersAdded && `${customersAdded} new customers`,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Everything already matched'
}

/**
 * Plan, guard, apply and log one sync. `force` skips the orphan guard.
 */
export async function runSheetSync(sheets: SheetData, opts: { source: 'apps-script' | 'cli'; force?: boolean }) {
  try {
    const plan = await planSync(sheets)
    if (plan.held && !opts.force) {
      await prisma.sheetSyncRun.create({ data: { status: 'HELD', source: opts.source, message: plan.held, summary: summarize(plan) } })
      return { status: 'HELD' as const, message: plan.held, plan, links: [] }
    }
    const hasChanges =
      plan.added.length || plan.updates.length || plan.adjustments.length || plan.stockChanges.length || plan.newOrphans.length || plan.resolver.newVariants.size
    if (hasChanges) await applySync(plan)
    const customers = hasChanges ? await addSalesRecordCustomers({ apply: true }) : []
    const status = hasChanges ? ('APPLIED' as const) : ('NO_CHANGES' as const)
    const message = headline(plan, customers.length) + (plan.problems.length ? ` (${plan.problems.length} problem${plan.problems.length > 1 ? 's' : ''} to check)` : '')
    // Quiet runs aren't logged one by one, only the latest is kept fresh.
    if (status === 'NO_CHANGES') {
      const last = await prisma.sheetSyncRun.findFirst({ orderBy: { createdAt: 'desc' } })
      if (last?.status === 'NO_CHANGES') await prisma.sheetSyncRun.update({ where: { id: last.id }, data: { createdAt: new Date(), message, summary: summarize(plan) } })
      else await prisma.sheetSyncRun.create({ data: { status, source: opts.source, message, summary: summarize(plan) } })
    } else {
      await prisma.sheetSyncRun.create({ data: { status, source: opts.source, message, summary: { ...summarize(plan), customersAdded: customers.length } } })
    }
    return { status, message, plan, links: plan.links }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.sheetSyncRun.create({ data: { status: 'FAILED', source: opts.source, message } }).catch(() => {})
    throw err
  }
}
