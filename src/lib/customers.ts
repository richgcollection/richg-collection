import 'server-only'
import { prisma } from '@/lib/prisma'

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

const META_AUDIENCE_HEADERS = ['email', 'phone', 'fn', 'ln', 'ct', 'country', 'gen'] as const

export type MetaAudienceCustomer = {
  email: string | null
  phone: string | null
  firstName: string
  lastName: string | null
  location: string | null
  gender: string | null
}

/** Builds a CSV in Meta's Custom Audience "customer list" column schema (email,phone,fn,ln,ct,country,gen). Meta hashes/normalizes these plain values itself on upload. */
export function toMetaAudienceCsv(customers: MetaAudienceCustomer[]): string {
  const lines = [META_AUDIENCE_HEADERS.join(',')]
  for (const customer of customers) {
    const row = [
      customer.email?.trim().toLowerCase() ?? '',
      customer.phone ?? '',
      customer.firstName.trim().toLowerCase(),
      (customer.lastName ?? '').trim().toLowerCase(),
      (customer.location ?? '').trim().toLowerCase(),
      'ke',
      normalizeGenderForMeta(customer.gender),
    ]
    lines.push(row.map(csvEscape).join(','))
  }
  return lines.join('\r\n')
}
