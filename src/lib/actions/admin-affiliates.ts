'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { effectiveCommissionWhere, generateReferralCode, syncAffiliateCommissions } from '@/lib/affiliates'
import { isMonthKey, percentToBps } from '@/lib/affiliate-terms'
import { parseStoreDate } from '@/lib/dates'
import type { ActionResult } from '@/lib/actions/cart'

export type AffiliateFormState = { error?: string; success?: boolean } | undefined

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'))
const commissionTypeSchema = z.enum(['FIXED', 'PERCENT'])

/** FIXED values are whole KES per unit; PERCENT values arrive as a percent and are stored as basis points. */
function parseCommissionValue(type: 'FIXED' | 'PERCENT', raw: string): number | null {
  if (type === 'PERCENT') return percentToBps(raw)
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : null
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function revalidateAffiliate(affiliateId?: string) {
  revalidatePath('/admin/affiliates')
  if (affiliateId) revalidatePath(`/admin/affiliates/${affiliateId}`)
  revalidatePath('/affiliate')
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(100),
  email: emailSchema,
  phone: z.string().trim().max(20).optional(),
  commissionType: commissionTypeSchema,
  commissionValue: z.string().trim().min(1, 'Enter a commission value.'),
})

/** Recruits an affiliate: ACTIVE straight away, password set when they sign up with this email. */
export async function inviteAffiliateAction(
  _prevState: AffiliateFormState,
  formData: FormData,
): Promise<AffiliateFormState> {
  await requireAdmin()
  const parsed = inviteSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    commissionType: formData.get('commissionType'),
    commissionValue: formData.get('commissionValue'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }

  const { name, email, phone, commissionType } = parsed.data
  const commissionValue = parseCommissionValue(commissionType, parsed.data.commissionValue)
  if (commissionValue === null) return { error: 'Enter a valid commission value.' }

  try {
    await prisma.affiliate.create({
      data: {
        name,
        email,
        phone: phone || null,
        status: 'ACTIVE',
        invitedAt: new Date(),
        commissionType,
        commissionValue,
        referralCode: await generateReferralCode(name),
      },
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { error: 'An affiliate with this email already exists.' }
    throw error
  }

  revalidateAffiliate()
  return { success: true }
}

const updateSchema = z.object({
  affiliateId: z.string().min(1),
  name: z.string().trim().min(2, 'Enter a name.').max(100),
  email: emailSchema,
  phone: z.string().trim().max(20).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']),
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,32}$/, 'Referral code: 3–32 letters, digits or dashes.'),
  commissionType: commissionTypeSchema,
  commissionValue: z.string().trim().min(1, 'Enter a commission value.'),
})

export async function updateAffiliateAction(
  _prevState: AffiliateFormState,
  formData: FormData,
): Promise<AffiliateFormState> {
  await requireAdmin()
  const parsed = updateSchema.safeParse({
    affiliateId: formData.get('affiliateId'),
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    status: formData.get('status'),
    referralCode: formData.get('referralCode'),
    commissionType: formData.get('commissionType'),
    commissionValue: formData.get('commissionValue'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }

  const { affiliateId, commissionType, phone, ...rest } = parsed.data
  const commissionValue = parseCommissionValue(commissionType, parsed.data.commissionValue)
  if (commissionValue === null) return { error: 'Enter a valid commission value.' }

  try {
    await prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        name: rest.name,
        email: rest.email,
        status: rest.status,
        referralCode: rest.referralCode,
        phone: phone || null,
        commissionType,
        commissionValue,
      },
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { error: 'That email or referral code is already in use.' }
    throw error
  }

  revalidateAffiliate(affiliateId)
  return { success: true }
}

const assignSchema = z.object({
  affiliateId: z.string().min(1),
  productIds: z.array(z.string().min(1)).min(1).max(500),
})

export async function assignAffiliateProductsAction(input: {
  affiliateId: string
  productIds: string[]
}): Promise<ActionResult> {
  await requireAdmin()
  const parsed = assignSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Choose at least one product.' }

  await prisma.affiliateProduct.createMany({
    data: parsed.data.productIds.map((productId) => ({ affiliateId: parsed.data.affiliateId, productId })),
    skipDuplicates: true,
  })
  revalidateAffiliate(parsed.data.affiliateId)
  return { success: true }
}

const overrideSchema = z.object({
  assignmentId: z.string().min(1),
  commissionType: z.union([commissionTypeSchema, z.literal('')]),
  commissionValue: z.string().trim(),
})

/** Sets (or, with an empty type, clears) a per-product commission override. */
export async function updateAffiliateProductAction(input: {
  assignmentId: string
  commissionType: 'FIXED' | 'PERCENT' | ''
  commissionValue: string
}): Promise<ActionResult> {
  await requireAdmin()
  const parsed = overrideSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid override.' }

  const { assignmentId, commissionType } = parsed.data
  let commissionValue: number | null = null
  if (commissionType) {
    commissionValue = parseCommissionValue(commissionType, parsed.data.commissionValue)
    if (commissionValue === null) return { success: false, error: 'Enter a valid commission value.' }
  }

  const assignment = await prisma.affiliateProduct.update({
    where: { id: assignmentId },
    data: { commissionType: commissionType || null, commissionValue },
    select: { affiliateId: true },
  })
  revalidateAffiliate(assignment.affiliateId)
  return { success: true }
}

export async function removeAffiliateProductAction(assignmentId: string): Promise<ActionResult> {
  await requireAdmin()
  const parsed = z.string().min(1).safeParse(assignmentId)
  if (!parsed.success) return { success: false, error: 'Invalid product.' }

  const assignment = await prisma.affiliateProduct.findUnique({ where: { id: parsed.data }, select: { affiliateId: true } })
  if (!assignment) return { success: false, error: 'Already removed.' }
  // Past commissions keep their snapshot; this only stops future ones.
  await prisma.affiliateProduct.delete({ where: { id: parsed.data } })
  revalidateAffiliate(assignment.affiliateId)
  return { success: true }
}

const payoutSchema = z.object({
  affiliateId: z.string().min(1),
  periodMonth: z.string().refine(isMonthKey, 'Invalid month.'),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
  paidOn: z.string().optional(),
})

/**
 * Settles what's owed for one month: records a payout for the outstanding
 * amount and links the month's unpaid commission lines to it (approving them).
 * The affiliate row is locked so a double submit can't pay twice.
 */
export async function markAffiliateMonthPaidAction(
  _prevState: AffiliateFormState,
  formData: FormData,
): Promise<AffiliateFormState> {
  const admin = await requireAdmin()
  const parsed = payoutSchema.safeParse({
    affiliateId: formData.get('affiliateId'),
    periodMonth: formData.get('periodMonth'),
    reference: formData.get('reference') || undefined,
    note: formData.get('note') || undefined,
    paidOn: formData.get('paidOn') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }

  const { affiliateId, periodMonth, reference, note } = parsed.data
  let paidAt = new Date()
  if (parsed.data.paidOn) {
    const date = parseStoreDate(parsed.data.paidOn)
    if (!date) return { error: 'Enter a valid payment date.' }
    if (date.getTime() > Date.now()) return { error: 'Payment date cannot be in the future.' }
    paidAt = date
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Affiliate" WHERE "id" = ${affiliateId} FOR UPDATE`

    const monthWhere = { affiliateId, periodMonth, ...effectiveCommissionWhere }
    const [earned, paid] = await Promise.all([
      tx.affiliateCommission.aggregate({ where: monthWhere, _sum: { amountKes: true } }),
      tx.affiliatePayout.aggregate({ where: { affiliateId, periodMonth }, _sum: { amountKes: true } }),
    ])
    const owedKes = (earned._sum.amountKes ?? 0) - (paid._sum.amountKes ?? 0)
    if (owedKes <= 0) return { error: 'Nothing is owed for this month.' }

    const payout = await tx.affiliatePayout.create({
      data: { affiliateId, periodMonth, amountKes: owedKes, paidAt, reference, note, createdById: admin.id },
    })
    await tx.affiliateCommission.updateMany({
      where: { ...monthWhere, payoutId: null },
      data: { payoutId: payout.id, status: 'APPROVED' },
    })
    return { success: true }
  })
  if ('error' in result) return result

  revalidateAffiliate(affiliateId)
  return { success: true }
}

/** Undoes a payout recorded by mistake; its commission lines become unpaid again. */
export async function deleteAffiliatePayoutAction(payoutId: string): Promise<ActionResult> {
  await requireAdmin()
  const parsed = z.string().min(1).safeParse(payoutId)
  if (!parsed.success) return { success: false, error: 'Invalid payout.' }

  const payout = await prisma.affiliatePayout.findUnique({ where: { id: parsed.data }, select: { affiliateId: true } })
  if (!payout) return { success: false, error: 'Payout not found.' }
  await prisma.affiliatePayout.delete({ where: { id: parsed.data } })
  revalidateAffiliate(payout.affiliateId)
  return { success: true }
}

export async function setCommissionVoidAction(input: { commissionId: string; void: boolean }): Promise<ActionResult> {
  await requireAdmin()
  const parsed = z.object({ commissionId: z.string().min(1), void: z.boolean() }).safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid commission.' }

  const commission = await prisma.affiliateCommission.findUnique({
    where: { id: parsed.data.commissionId },
    select: { affiliateId: true, status: true, voidReason: true },
  })
  if (!commission) return { success: false, error: 'Commission not found.' }

  if (parsed.data.void) {
    await prisma.affiliateCommission.update({
      where: { id: parsed.data.commissionId },
      data: { status: 'VOID', voidReason: 'MANUAL' },
    })
  } else {
    // Only hand-voided lines can be restored here; automatic voids follow the order's status.
    if (commission.status !== 'VOID' || commission.voidReason !== 'MANUAL') {
      return { success: false, error: 'This commission was voided by its order status.' }
    }
    await prisma.affiliateCommission.update({
      where: { id: parsed.data.commissionId },
      data: { status: 'PENDING', voidReason: null },
    })
  }

  revalidateAffiliate(commission.affiliateId)
  return { success: true }
}

/** Credits an order to an affiliate (or removes the credit) and rebuilds its commission lines. */
export async function setOrderAffiliateAction(input: {
  orderId: string
  affiliateId: string | null
}): Promise<ActionResult> {
  await requireAdmin()
  const parsed = z.object({ orderId: z.string().min(1), affiliateId: z.string().min(1).nullable() }).safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid selection.' }
  const { orderId, affiliateId } = parsed.data

  const [order, affiliate] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { affiliateId: true } }),
    affiliateId ? prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { id: true } }) : null,
  ])
  if (!order) return { success: false, error: 'Order not found.' }
  if (affiliateId && !affiliate) return { success: false, error: 'Affiliate not found.' }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { affiliateId } })
    await syncAffiliateCommissions(tx, orderId)
  })

  revalidatePath(`/admin/orders/${orderId}`)
  revalidateAffiliate(affiliateId ?? undefined)
  if (order.affiliateId && order.affiliateId !== affiliateId) revalidatePath(`/admin/affiliates/${order.affiliateId}`)
  return { success: true }
}
