import 'server-only'
import { prisma } from '@/lib/prisma'
import { kesToUsd } from '@/lib/money'
import { saleRevenueKes } from '@/lib/inventory'

/** Normalizes Kenyan phone numbers to `2547XXXXXXXX` / `2541XXXXXXXX` so the same person's number matches across checkouts and manual entry. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  if (digits.startsWith('254')) return digits
  if (digits.startsWith('0')) return `254${digits.slice(1)}`
  if (digits.length === 9) return `254${digits}`
  return digits
}

export async function upsertCustomerFromOrder(input: {
  fullName: string
  phone: string
  email: string
  town?: string | null
  productName: string
  quantity: number
  orderValueKes: number
  source?: string
}) {
  const phone = normalizePhone(input.phone)
  if (!phone) return null

  const [firstName, ...rest] = input.fullName.trim().split(/\s+/)
  const lastName = rest.join(' ') || null

  return prisma.customer.upsert({
    where: { phone },
    create: {
      firstName: firstName || input.fullName,
      lastName,
      phone,
      email: input.email,
      location: input.town ?? null,
      source: input.source ?? 'Website',
      lastProduct: input.productName,
      lastQuantity: input.quantity,
      lastOrderValueKes: input.orderValueKes,
      totalOrders: 1,
      totalSpentKes: input.orderValueKes,
    },
    update: {
      firstName: firstName || input.fullName,
      lastName,
      email: input.email,
      location: input.town ?? undefined,
      lastProduct: input.productName,
      lastQuantity: input.quantity,
      lastOrderValueKes: input.orderValueKes,
      totalOrders: { increment: 1 },
      totalSpentKes: { increment: input.orderValueKes },
    },
  })
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function normalizeGenderForMeta(raw: string | null | undefined): string {
  if (!raw) return ''
  const value = raw.trim().toLowerCase()
  if (value.startsWith('m')) return 'm'
  if (value.startsWith('f')) return 'f'
  return ''
}

/**
 * International format with the country code, grouped in threes
 * (`254712345678` -> `+254 712 345 678`). The spaces are what stop Excel from
 * reading the number as a numeral and showing it as `2.54713E+11` (and then
 * saving it back that way); Meta strips the `+` and spaces itself on upload.
 */
export function formatPhoneForExport(phone: string | null | undefined): string {
  const digits = normalizePhone(phone)
  if (!digits) return ''
  return `+${digits.match(/.{1,3}/g)!.join(' ')}`
}

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export type LedgerSale = {
  id: string
  reason: 'MANUAL_SALE' | 'ONLINE_SALE'
  productName: string
  variantLabel: string | null
  quantity: number
  unitPriceKes: number | null
  discountKes: number | null
  /** After discount. */
  valueKes: number
  createdAt: Date
}

export type CustomerLedger = { spendKes: number; sales: LedgerSale[] }

/**
 * Sales per customer id from the stock ledger (manual and online sales),
 * newest first, with lifetime spend net of discounts. This is the only source
 * of a customer's order values: they are recorded and corrected under
 * Inventory → Stock Out, never on the customer profile. The stored
 * `totalSpentKes` misses every sale recorded outside the website checkout,
 * including the whole imported history.
 *
 * Online sales are matched by the order's phone number. Manual sales only
 * carry the buyer's name, so they are matched on the exact full name; when
 * the same name belongs to several customer records (typically the same
 * person imported with and without a phone), the one record with a phone
 * gets the spend. Names that still don't resolve to exactly one customer are
 * left out rather than guessed.
 */
export async function getLedgerByCustomer(): Promise<Map<string, CustomerLedger>> {
  const [customers, sales] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, firstName: true, lastName: true, phone: true } }),
    prisma.stockMovement.findMany({
      where: { direction: 'OUT', reason: { in: ['MANUAL_SALE', 'ONLINE_SALE'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reason: true,
        quantity: true,
        unitPriceKes: true,
        discountKes: true,
        counterparty: true,
        createdAt: true,
        order: { select: { guestPhone: true } },
        product: { select: { name: true } },
        variant: { select: { optionValues: { select: { optionValue: { select: { value: true } } } } } },
      },
    }),
  ])

  const byPhone = new Map<string, string>()
  const byName = new Map<string, Array<{ id: string; hasPhone: boolean }>>()
  for (const c of customers) {
    if (c.phone) byPhone.set(c.phone, c.id)
    const name = normalizeName(`${c.firstName} ${c.lastName ?? ''}`)
    byName.set(name, [...(byName.get(name) ?? []), { id: c.id, hasPhone: Boolean(c.phone) }])
  }

  const resolveName = (raw: string): string | null => {
    const matches = byName.get(normalizeName(raw)) ?? []
    if (matches.length === 1) return matches[0].id
    const withPhone = matches.filter((m) => m.hasPhone)
    return withPhone.length === 1 ? withPhone[0].id : null
  }

  const ledger = new Map<string, CustomerLedger>()
  for (const s of sales) {
    const phone = normalizePhone(s.order?.guestPhone)
    const id = (phone && byPhone.get(phone)) || (s.counterparty ? resolveName(s.counterparty) : null)
    if (!id) continue
    const entry = ledger.get(id) ?? { spendKes: 0, sales: [] }
    const valueKes = saleRevenueKes(s)
    entry.spendKes += valueKes
    entry.sales.push({
      id: s.id,
      reason: s.reason as LedgerSale['reason'],
      productName: s.product.name,
      variantLabel: s.variant?.optionValues.map((ov) => ov.optionValue.value).join(' / ') || null,
      quantity: s.quantity,
      unitPriceKes: s.unitPriceKes,
      discountKes: s.discountKes,
      valueKes,
      createdAt: s.createdAt,
    })
    ledger.set(id, entry)
  }
  return ledger
}

/** Lifetime spend per customer id, in KES, net of discounts — see getLedgerByCustomer. */
export async function getLifetimeSpendByCustomer(): Promise<Map<string, number>> {
  const ledger = await getLedgerByCustomer()
  return new Map(Array.from(ledger, ([id, entry]) => [id, entry.spendKes]))
}

const META_AUDIENCE_HEADERS = ['email', 'phone', 'fn', 'ln', 'ct', 'country', 'gen', 'value'] as const

export type MetaAudienceCustomer = {
  email: string | null
  phone: string | null
  firstName: string
  lastName: string | null
  location: string | null
  gender: string | null
  lifetimeSpendKes: number
}

/**
 * Builds a CSV in Meta's Custom Audience "customer list" column schema
 * (email,phone,fn,ln,ct,country,gen,value). Meta hashes/normalizes these plain
 * values itself on upload. `value` is lifetime spend converted to USD (a bare
 * number, no symbol, as Meta requires), for value-based lookalike audiences.
 */
export function toMetaAudienceCsv(customers: MetaAudienceCustomer[]): string {
  const lines = [META_AUDIENCE_HEADERS.join(',')]
  for (const customer of customers) {
    const row = [
      customer.email?.trim().toLowerCase() ?? '',
      formatPhoneForExport(customer.phone),
      customer.firstName.trim().toLowerCase(),
      (customer.lastName ?? '').trim().toLowerCase(),
      (customer.location ?? '').trim().toLowerCase(),
      'ke',
      normalizeGenderForMeta(customer.gender),
      kesToUsd(customer.lifetimeSpendKes).toFixed(2),
    ]
    lines.push(row.map(csvEscape).join(','))
  }
  return lines.join('\r\n')
}
