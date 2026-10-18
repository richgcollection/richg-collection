'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { generateReferralCode } from '@/lib/affiliates'
import { hashInviteToken } from '@/lib/affiliate-invites'
import { createAffiliateSession, deleteAffiliateSession } from '@/lib/auth/affiliate-session'
import {
  THROTTLED_MESSAGE,
  clearFailedAttempts,
  isThrottled,
  recordFailedAttempt,
  throttleKey,
} from '@/lib/auth/rate-limit'
import { prisma } from '@/lib/prisma'

const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'))

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(100),
  email: emailSchema,
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(20),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
  invite: z.string().trim().max(200).optional(),
})

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
})

export type AffiliateAuthState = { error?: string } | undefined

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = '$2b$12$eodePo1pFrB2uQSsridpSO5nXcujec48fkUboO.rBVvoa0ou9qmcO'

const INVALID_INVITE = 'This invite link is invalid, already used or expired. Ask the Rich G team to send a new one.'

export async function affiliateSignupAction(
  _prevState: AffiliateAuthState,
  formData: FormData,
): Promise<AffiliateAuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    password: formData.get('password'),
    invite: formData.get('invite') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' }
  }
  const { name, email, phone, password, invite } = parsed.data

  // Every signup attempt counts here (successful ones too) to slow down token guessing and spam accounts.
  const key = await throttleKey('affiliate-signup', email)
  if (await isThrottled(key)) return { error: THROTTLED_MESSAGE }
  await recordFailedAttempt(key)

  let affiliateId: string

  if (invite) {
    const inviteTokenHash = hashInviteToken(invite)
    const now = new Date()
    const invited = await prisma.affiliate.findUnique({
      where: { inviteTokenHash },
      select: { id: true, passwordHash: true, inviteExpiresAt: true },
    })
    if (!invited || invited.passwordHash || !invited.inviteExpiresAt || invited.inviteExpiresAt <= now) {
      return { error: INVALID_INVITE }
    }
    // The invite is already ACTIVE: set the password and burn the token (the hash in the filter makes it single-use).
    const { count } = await prisma.affiliate.updateMany({
      where: { id: invited.id, inviteTokenHash, passwordHash: null },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        name,
        phone,
        inviteTokenHash: null,
        inviteToken: null,
        inviteExpiresAt: null,
        inviteClaimedAt: now,
      },
    })
    if (count === 0) return { error: INVALID_INVITE }
    affiliateId = invited.id
  } else {
    const existing = await prisma.affiliate.findUnique({ where: { email }, select: { passwordHash: true } })
    if (existing) {
      return {
        error: existing.passwordHash
          ? 'An affiliate account with this email already exists. Log in instead.'
          : 'This email has a pending invite. Use the link in your invite email, or ask the Rich G team to resend it.',
      }
    }
    try {
      const created = await prisma.affiliate.create({
        data: {
          name,
          email,
          phone,
          passwordHash: await bcrypt.hash(password, 12),
          status: 'PENDING',
          referralCode: await generateReferralCode(name),
        },
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

  const key = await throttleKey('affiliate-login', parsed.data.email)
  if (await isThrottled(key)) return { error: THROTTLED_MESSAGE }

  const affiliate = await prisma.affiliate.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  })
  const passwordMatches = await bcrypt.compare(parsed.data.password, affiliate?.passwordHash ?? DUMMY_HASH)
  if (!affiliate?.passwordHash || !passwordMatches) {
    await recordFailedAttempt(key)
    return { error: 'Invalid email or password.' }
  }

  await clearFailedAttempts(key)
  await createAffiliateSession(affiliate.id)
  redirect('/affiliate')
}

export async function affiliateLogoutAction() {
  await deleteAffiliateSession()
  redirect('/affiliate/login')
}
