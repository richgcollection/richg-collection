import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AffiliateSignupForm } from '@/components/affiliate/AffiliateAuthForms'
import { hashInviteToken } from '@/lib/affiliate-invites'
import { getCurrentAffiliate } from '@/lib/auth/affiliate-dal'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Become an Affiliate · Rich G Collection' }

async function findOpenInvite(token: string) {
  if (token.length > 200) return null
  const affiliate = await prisma.affiliate.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    select: { name: true, email: true, phone: true, passwordHash: true, inviteExpiresAt: true },
  })
  if (!affiliate || affiliate.passwordHash || !affiliate.inviteExpiresAt || affiliate.inviteExpiresAt <= new Date()) {
    return null
  }
  return { token, name: affiliate.name, email: affiliate.email, phone: affiliate.phone ?? '' }
}

export default async function AffiliateSignupPage({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  if (await getCurrentAffiliate()) redirect('/affiliate')

  const { invite: inviteParam } = await searchParams
  const token = typeof inviteParam === 'string' ? inviteParam.trim() : ''
  const invite = token ? await findOpenInvite(token) : null

  if (token && !invite) {
    return (
      <div className="mx-auto w-full max-w-sm py-12">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Invite link not valid</h1>
        <p className="mb-8 text-sm opacity-60">
          This invite link has expired or was already used. Ask the Rich G team to send you a new one. If you already set
          a password, sign in instead.
        </p>
        <Link
          href="/affiliate/login"
          className="inline-block rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-sm py-12">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {invite ? 'Activate your affiliate account' : 'Become an affiliate'}
      </h1>
      <p className="mb-8 text-sm opacity-60">
        {invite
          ? 'The Rich G team invited you. Confirm your details and choose a password to get started.'
          : 'Earn commission on Rich G sales you refer. Apply below and we’ll review your application. If the team invited you, use the link in your invite email.'}
      </p>
      <AffiliateSignupForm invite={invite ?? undefined} />
      <p className="mt-6 text-sm opacity-70">
        Already have an account?{' '}
        <Link href="/affiliate/login" className="font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}
