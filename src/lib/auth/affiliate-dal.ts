import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAffiliateSession } from '@/lib/auth/affiliate-session'

export const getCurrentAffiliate = cache(async () => {
  const session = await getAffiliateSession()
  if (!session) return null

  // An invite that was never claimed has no password, so it can't hold a session.
  return prisma.affiliate.findFirst({
    where: { id: session.affiliateId, passwordHash: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      referralCode: true,
      commissionType: true,
      commissionValue: true,
    },
  })
})

export async function requireAffiliate() {
  const affiliate = await getCurrentAffiliate()
  if (!affiliate) redirect('/affiliate/login')
  return affiliate
}
