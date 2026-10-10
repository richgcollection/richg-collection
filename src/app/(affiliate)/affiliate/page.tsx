import { ReferralLink } from '@/components/affiliate/CopyButton'
import { CommissionsTable, MonthlyStatementTable } from '@/components/affiliate/tables'
import {
  AffiliateStatusBadge,
  StatCard,
  owedLabel,
  rowClass,
  tableClass,
  tableWrapClass,
  tdClass,
  thClass,
} from '@/components/affiliate/ui'
import { formatCommissionTerms } from '@/lib/affiliate-terms'
import { buildMonthlyStatement, getLedger, summarizeLedger } from '@/lib/affiliates'
import { requireAffiliate } from '@/lib/auth/affiliate-dal'
import { formatKes } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { REFERRAL_PARAM } from '@/lib/referral'

export const metadata = { title: 'Affiliate Dashboard · Rich G Collection' }

const SALES_LIMIT = 200

export default async function AffiliateDashboardPage() {
  const affiliate = await requireAffiliate()

  if (affiliate.status !== 'ACTIVE') {
    return (
      <div className="mx-auto max-w-xl py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Hi, {affiliate.name}</h1>
        <div className="mt-6 rounded-lg border border-black/10 p-6 dark:border-white/10">
          <div className="mb-3">
            <AffiliateStatusBadge status={affiliate.status} />
          </div>
          {affiliate.status === 'PENDING' ? (
            <p className="text-sm opacity-80">
              Thanks for applying. Your account is waiting for approval from the Rich G team. Once you&apos;re
              approved, your referral links and earnings will show up here.
            </p>
          ) : (
            <p className="text-sm opacity-80">
              Your affiliate account is suspended. Please contact the Rich G team if you think this is a mistake.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Everything below is scoped to the signed-in affiliate's id.
  const [ledger, assignments] = await Promise.all([
    getLedger(affiliate.id),
    prisma.affiliateProduct.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { product: { name: 'asc' } },
      select: {
        id: true,
        commissionType: true,
        commissionValue: true,
        product: { select: { name: true, slug: true, status: true } },
      },
    }),
  ])
  const summary = summarizeLedger(ledger)
  const statement = buildMonthlyStatement(ledger)

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const refQuery = `?${REFERRAL_PARAM}=${encodeURIComponent(affiliate.referralCode)}`

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Hi, {affiliate.name}</h1>
          <p className="mt-1 text-sm opacity-60">
            Referral code <span className="font-mono font-medium">{affiliate.referralCode}</span> · Default commission{' '}
            {formatCommissionTerms(affiliate.commissionType, affiliate.commissionValue)}
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="This month" value={formatKes(summary.thisMonth.earnedKes)} hint={`${summary.thisMonth.units} units sold`} />
        <StatCard label="Last month" value={formatKes(summary.lastMonth.earnedKes)} hint={`${summary.lastMonth.units} units sold`} />
        <StatCard label="Lifetime" value={formatKes(summary.lifetime.earnedKes)} hint={`${summary.lifetime.orders} orders`} />
        <StatCard label="Paid to you" value={formatKes(summary.paidKes)} />
        <StatCard label="Owed to you" value={owedLabel(summary.owedKes, formatKes)} hint="Pending + approved, not yet paid" />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Your referral link</h2>
        <p className="mb-3 text-sm opacity-60">
          Anyone who shops within 30 days of opening your link is credited to you. You earn on the products listed
          below.
        </p>
        <ReferralLink url={`${siteUrl}/${refQuery}`} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Your products</h2>
        {assignments.length === 0 ? (
          <p className="text-sm opacity-60">No products assigned yet. The Rich G team will add them soon.</p>
        ) : (
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Product</th>
                  <th className={thClass}>Commission</th>
                  <th className={thClass}>Link</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const hasOverride = a.commissionType !== null && a.commissionValue !== null
                  return (
                    <tr key={a.id} className={rowClass}>
                      <td className={`${tdClass} min-w-40 font-medium`}>{a.product.name}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {hasOverride
                          ? formatCommissionTerms(a.commissionType!, a.commissionValue!)
                          : formatCommissionTerms(affiliate.commissionType, affiliate.commissionValue)}
                      </td>
                      <td className={`${tdClass} w-full min-w-64`}>
                        <ReferralLink url={`${siteUrl}/product/${a.product.slug}${refQuery}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Earnings by month</h2>
        <p className="mb-3 text-sm opacity-60">Commission is counted in the month the order was paid and settled monthly.</p>
        <MonthlyStatementTable rows={statement} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Sales</h2>
        <p className="mb-3 text-sm opacity-60">
          Pending until the order is delivered, then approved. Cancelled or refunded orders are void.
        </p>
        <CommissionsTable rows={ledger.commissions.slice(0, SALES_LIMIT)} />
      </section>
    </div>
  )
}
