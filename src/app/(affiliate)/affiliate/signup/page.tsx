import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AffiliateSignupForm } from '@/components/affiliate/AffiliateAuthForms'
import { getCurrentAffiliate } from '@/lib/auth/affiliate-dal'

export const metadata = { title: 'Become an Affiliate · Rich G Collection' }

export default async function AffiliateSignupPage() {
  if (await getCurrentAffiliate()) redirect('/affiliate')

  return (
    <div className="mx-auto w-full max-w-sm py-12">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Become an affiliate</h1>
      <p className="mb-8 text-sm opacity-60">
        Earn commission on Rich G sales you refer. If the team invited you, use the same email to activate your
        account; otherwise we&apos;ll review your application.
      </p>
      <AffiliateSignupForm />
      <p className="mt-6 text-sm opacity-70">
        Already have an account?{' '}
        <Link href="/affiliate/login" className="font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}
