import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AffiliateLoginForm } from '@/components/affiliate/AffiliateAuthForms'
import { getCurrentAffiliate } from '@/lib/auth/affiliate-dal'

export const metadata = { title: 'Affiliate Sign In · Rich G Collection' }

export default async function AffiliateLoginPage() {
  if (await getCurrentAffiliate()) redirect('/affiliate')

  return (
    <div className="mx-auto w-full max-w-sm py-12">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Affiliate sign in</h1>
      <p className="mb-8 text-sm opacity-60">Track your referrals and earnings.</p>
      <AffiliateLoginForm />
      <p className="mt-6 text-sm opacity-70">
        New here or invited by the team?{' '}
        <Link href="/affiliate/signup" className="font-medium underline underline-offset-4">
          Create your account
        </Link>
      </p>
    </div>
  )
}
