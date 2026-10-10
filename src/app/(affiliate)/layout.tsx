import Link from 'next/link'
import { LogoMark } from '@/components/brand/Logo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { affiliateLogoutAction } from '@/lib/actions/affiliate-auth'
import { getCurrentAffiliate } from '@/lib/auth/affiliate-dal'

export const dynamic = 'force-dynamic'

export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const affiliate = await getCurrentAffiliate()

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href={affiliate ? '/affiliate' : '/'} className="flex items-center gap-3">
            <LogoMark className="h-8" />
            <span className="text-sm font-medium">Affiliates</span>
          </Link>
          <div className="flex min-w-0 items-center gap-4">
            {affiliate && <span className="hidden truncate text-sm opacity-60 sm:inline">{affiliate.email}</span>}
            <ThemeToggle />
            {affiliate && (
              <form action={affiliateLogoutAction}>
                <button type="submit" className="text-sm opacity-70 hover:opacity-100">
                  Sign Out
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
