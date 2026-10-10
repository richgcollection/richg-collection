'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { generateReferralCode } from '@/lib/affiliates'
import { createAffiliateSession, deleteAffiliateSession } from '@/lib/auth/affiliate-session'
import { prisma } from '@/lib/prisma'

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'))

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(100),
  email: emailSchema,
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(20),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
})

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
})

export type AffiliateAuthState = { error?: string } | undefined

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = '$2b$12$eodePo1pFrB2uQSsridpSO5nXcujec48fkUboO.rBVvoa0ou9qmcO'

export async function affiliateSignupAction(
  _prevState: AffiliateAuthState,
  formData: FormData,
): Promise<AffiliateAuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' }
  }
  const { name, email, phone, password } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)

  const existing = await prisma.affiliate.findUnique({ where: { email }, select: { id: true, passwordHash: true } })
  let affiliateId: string

  if (existing) {
    if (existing.passwordHash) {
      return { error: 'An affiliate account with this email already exists. Log in instead.' }
    }
    // Claim an invite from the admin: it's already ACTIVE, so just set the password.
    const { count } = await prisma.affiliate.updateMany({
      where: { id: existing.id, passwordHash: null },
      data: { passwordHash, name, phone },
    })
    if (count === 0) return { error: 'An affiliate account with this email already exists. Log in instead.' }
    affiliateId = existing.id
  } else {
    try {
      const created = await prisma.affiliate.create({
        data: { name, email, phone, passwordHash, status: 'PENDING', referralCode: await generateReferralCode(name) },
        select: { id: true },
      })
      affiliateId = created.id
    } catch {
      return { error: 'Could not create your account. Please try again.' }
    }
  }

  await createAffiliateSession(affiliateId)
  redirect('/affiliate')
}

export async function affiliateLoginAction(
  _prevState: AffiliateAuthState,
  formData: FormData,
): Promise<AffiliateAuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: 'Enter a valid email and password.' }
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  })
  const passwordMatches = await bcrypt.compare(parsed.data.password, affiliate?.passwordHash ?? DUMMY_HASH)
  if (!affiliate?.passwordHash || !passwordMatches) {
    return { error: 'Invalid email or password.' }
  }

  await createAffiliateSession(affiliate.id)
  redirect('/affiliate')
}

export async function affiliateLogoutAction() {
  await deleteAffiliateSession()
  redirect('/affiliate/login')
}
