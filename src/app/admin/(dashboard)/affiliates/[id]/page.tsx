import Link from 'next/link'
import { notFound } from 'next/navigation'
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
  tdNumClass,
  thClass,
  thNumClass,
} from '@/components/affiliate/ui'
import { CommissionVoidButton, PayoutDeleteButton } from '@/components/admin/affiliates/AffiliateButtons'
import { AffiliateProfileForm, MarkMonthPaidForm } from '@/components/admin/affiliates/AffiliateForms'
import { AffiliateProductsManager } from '@/components/admin/affiliates/AffiliateProductsManager'
import { formatCommissionTerms, formatMonth } from '@/lib/affiliate-terms'
import { buildMonthlyStatement, getLedger, summarizeLedger } from '@/lib/affiliates'
import { formatStoreDate } from '@/lib/dates'
import { formatKes } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { REFERRAL_PARAM } from '@/lib/referral'

export const dynamic = 'force-dynamic'

export default async function AdminAffiliateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [affiliate, ledger, products] = await Promise.all([
    prisma.affiliate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        referralCode: true,
        commissionType: true,
        commissionValue: true,
        invitedAt: true,
        passwordHash: true,
        createdAt: true,
        products: {
          orderBy: { product: { name: 'asc' } },
          select: {
            id: true,
            productId: true,
            commissionType: true,
            commissionValue: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
    getLedger(id),
    prisma.product.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  if (!affiliate) notFound()

  const summary = summarizeLedger(ledger)
  const statement = buildMonthlyStatement(ledger)
  const defaultTerms = formatCommissionTerms(affiliate.commissionType, affiliate.commissionValue)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const inviteUnclaimed = !affiliate.passwordHash

  return (
    <div className="min-w-0 [contain:inline-size]">
      <Link href="/admin/affiliates" className="text-sm opacity-60 hover:opacity-100">
        ← Affiliates
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{affiliate.name}</h1>
        <AffiliateStatusBadge status={affiliate.status} />
      </div>
      <p className="mt-1 text-sm opacity-60 [overflow-wrap:anywhere]">
        {affiliate.email}
        {affiliate.phone ? ` · ${affiliate.phone}` : ''} · Joined {formatStoreDate(affiliate.createdAt)}
        {inviteUnclaimed ? ' · Invite not claimed yet (no password set)' : ''}
      </p>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="This month" value={formatKes(summary.thisMonth.earnedKes)} hint={`${summary.thisMonth.units} units`} />
        <StatCard label="Last month" value={formatKes(summary.lastMonth.earnedKes)} hint={`${summary.lastMonth.units} units`} />
        <StatCard
          label="Lifetime"
          value={formatKes(summary.lifetime.earnedKes)}
          hint={`${summary.lifetime.orders} orders · ${formatKes(summary.lifetime.salesKes)} sales`}
        />
        <StatCard label="Paid" value={formatKes(summary.paidKes)} />
        <StatCard label="Owed now" value={owedLabel(summary.owedKes, formatKes)} />
      </section>

      <section className="mt-6">
        <p className="mb-2 text-xs font-medium tracking-wide uppercase opacity-70">General referral link</p>
        <ReferralLink url={`${siteUrl}/?${REFERRAL_PARAM}=${encodeURIComponent(affiliate.referralCode)}`} />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <AffiliateProfileForm
          key={`${affiliate.status}-${affiliate.commissionType}-${affiliate.commissionValue}-${affiliate.referralCode}`}
          affiliate={{
            id: affiliate.id,
            name: affiliate.name,
            email: affiliate.email,
            phone: affiliate.phone,
            status: affiliate.status,
            referralCode: affiliate.referralCode,
            commissionType: affiliate.commissionType,
            commissionValue: affiliate.commissionValue,
          }}
        />
        <AffiliateProductsManager
          affiliateId={affiliate.id}
          defaultTerms={defaultTerms}
          products={products}
          assignments={affiliate.products.map((a) => ({
            id: a.id,
            productId: a.productId,
            productName: a.product.name,
            commissionType: a.commissionType,
            commissionValue: a.commissionValue,
          }))}
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Monthly statement</h2>
        <p className="mb-3 text-sm opacity-60">
          Owed = commission earned in the month − payouts recorded for it. This is exactly what the affiliate sees.
        </p>
        <MonthlyStatementTable
          rows={statement}
          renderActions={(row) =>
            row.owedKes > 0 ? <MarkMonthPaidForm affiliateId={affiliate.id} periodMonth={row.month} /> : null
          }
        />
      </section>

      {ledger.payouts.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Payouts</h2>
          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Paid on</th>
                  <th className={thClass}>For month</th>
                  <th className={thNumClass}>Amount</th>
                  <th className={thClass}>Reference</th>
                  <th className={thClass}>Note</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {ledger.payouts.map((p) => (
                  <tr key={p.id} className={rowClass}>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatStoreDate(p.paidAt)}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatMonth(p.periodMonth)}</td>
                    <td className={`${tdNumClass} font-medium`}>{formatKes(p.amountKes)}</td>
                    <td className={`${tdClass} font-mono text-xs [overflow-wrap:anywhere]`}>{p.reference ?? '—'}</td>
                    <td className={`${tdClass} min-w-40 text-xs opacity-80`}>{p.note ?? '—'}</td>
                    <td className={tdClass}>
                      <PayoutDeleteButton payoutId={p.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Sales &amp; commission history</h2>
        <p className="mb-3 text-sm opacity-60">
          One line per assigned product sold. Cancelled, refunded or failed orders are voided automatically.
        </p>
        <CommissionsTable
          rows={ledger.commissions}
          renderOrder={(row) => (
            <Link href={`/admin/orders/${row.orderId}`} className="hover:underline">
              {row.orderNumber}
            </Link>
          )}
          renderActions={(row) => (
            <CommissionVoidButton
              commissionId={row.id}
              isVoid={row.status === 'VOID'}
              canRestore={row.status === 'VOID' && row.voidReason === 'MANUAL'}
            />
          )}
        />
      </section>
    </div>
  )
}
