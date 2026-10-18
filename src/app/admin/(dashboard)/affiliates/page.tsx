import Link from 'next/link'
import { AffiliateMonthSelect } from '@/components/admin/affiliates/AffiliateButtons'
import { InviteAffiliateForm } from '@/components/admin/affiliates/AffiliateForms'
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
import { formatMonth, isMonthKey, monthKey, shiftMonth } from '@/lib/affiliate-terms'
import { isInviteOpen } from '@/lib/affiliate-invites'
import { getLedger, ledgersByAffiliate, positionAtMonthEnd, summarizeLedger } from '@/lib/affiliates'
import { formatKes } from '@/lib/money'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const EMPTY_LEDGER = { commissions: [], payouts: [] }

export default async function AdminAffiliatesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams
  const currentMonth = monthKey()
  const month = isMonthKey(monthParam) && monthParam <= currentMonth ? monthParam : currentMonth

  const [affiliates, ledger] = await Promise.all([
    prisma.affiliate.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        referralCode: true,
        invitedAt: true,
        inviteExpiresAt: true,
        passwordHash: true,
        _count: { select: { products: true } },
      },
    }),
    getLedger(),
  ])
  const byAffiliate = ledgersByAffiliate(ledger)

  const rows = affiliates.map((affiliate) => {
    const own = byAffiliate.get(affiliate.id) ?? EMPTY_LEDGER
    return {
      affiliate,
      position: positionAtMonthEnd(own, month),
      owedNowKes: summarizeLedger(own).owedKes,
    }
  })
  const totals = rows.reduce(
    (sum, r) => ({
      orders: sum.orders + r.position.orders,
      units: sum.units + r.position.units,
      salesKes: sum.salesKes + r.position.salesKes,
      earnedKes: sum.earnedKes + r.position.earnedKes,
      paidToDateKes: sum.paidToDateKes + r.position.paidToDateKes,
      owedAtMonthEndKes: sum.owedAtMonthEndKes + r.position.owedAtMonthEndKes,
      owedNowKes: sum.owedNowKes + r.owedNowKes,
    }),
    { orders: 0, units: 0, salesKes: 0, earnedKes: 0, paidToDateKes: 0, owedAtMonthEndKes: 0, owedNowKes: 0 },
  )
  const pendingCount = affiliates.filter((a) => a.status === 'PENDING').length

  // Every month from the first recorded activity (at most 3 years back) to now.
  const earliest = [...ledger.commissions.map((c) => c.periodMonth), ...ledger.payouts.map((p) => p.periodMonth)]
    .filter((m) => m <= currentMonth)
    .reduce((min, m) => (m < min ? m : min), shiftMonth(currentMonth, -11))
  const months: string[] = []
  for (let m = currentMonth; m >= earliest && months.length < 36; m = shiftMonth(m, -1)) months.push(m)

  const isCurrent = month === currentMonth

  return (
    <div className="min-w-0 [contain:inline-size]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Affiliates</h1>
        <AffiliateMonthSelect months={months} value={month} />
      </div>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Commission · ${formatMonth(month)}`} value={formatKes(totals.earnedKes)} hint={`${formatKes(totals.salesKes)} in sales`} />
        <StatCard
          label={isCurrent ? 'Owed so far this month' : `Owed at end of ${formatMonth(month)}`}
          value={owedLabel(totals.owedAtMonthEndKes, formatKes)}
          hint="All earned commission not yet paid out"
        />
        <StatCard label="Owed now" value={owedLabel(totals.owedNowKes, formatKes)} />
        <StatCard label="Awaiting approval" value={String(pendingCount)} hint="Affiliate applications" />
      </section>

      <section className="mt-8">
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Affiliate</th>
                <th className={thClass}>Status</th>
                <th className={thNumClass}>Products</th>
                <th className={thNumClass}>Orders</th>
                <th className={thNumClass}>Units</th>
                <th className={thNumClass}>Sales</th>
                <th className={thNumClass}>Commission</th>
                <th className={thNumClass}>Paid to date</th>
                <th className={thNumClass}>{isCurrent ? 'Owed (month to date)' : 'Owed at month end'}</th>
                <th className={thNumClass}>Owed now</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr className={rowClass}>
                  <td colSpan={10} className={`${tdClass} opacity-60`}>
                    No affiliates yet. Recruit one below.
                  </td>
                </tr>
              )}
              {rows.map(({ affiliate, position, owedNowKes }) => (
                <tr key={affiliate.id} className={rowClass}>
                  <td className={`${tdClass} min-w-48`}>
                    <Link href={`/admin/affiliates/${affiliate.id}`} className="font-medium hover:underline">
                      {affiliate.name}
                    </Link>
                    <p className="text-xs opacity-60 [overflow-wrap:anywhere]">{affiliate.email}</p>
                    <p className="font-mono text-xs opacity-60">
                      {affiliate.referralCode}
                      {!affiliate.passwordHash
                        ? isInviteOpen(affiliate.inviteExpiresAt)
                          ? ' · invite not claimed'
                          : ' · invite expired'
                        : ''}
                    </p>
                  </td>
                  <td className={tdClass}>
                    <AffiliateStatusBadge status={affiliate.status} />
                  </td>
                  <td className={tdNumClass}>{affiliate._count.products}</td>
                  <td className={tdNumClass}>{position.orders}</td>
                  <td className={tdNumClass}>{position.units}</td>
                  <td className={tdNumClass}>{formatKes(position.salesKes)}</td>
                  <td className={tdNumClass}>{formatKes(position.earnedKes)}</td>
                  <td className={tdNumClass}>{formatKes(position.paidToDateKes)}</td>
                  <td className={`${tdNumClass} font-medium`}>{owedLabel(position.owedAtMonthEndKes, formatKes)}</td>
                  <td className={tdNumClass}>{owedLabel(owedNowKes, formatKes)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-black/10 font-medium dark:border-white/10">
                  <td className={tdClass} colSpan={3}>
                    Total
                  </td>
                  <td className={tdNumClass}>{totals.orders}</td>
                  <td className={tdNumClass}>{totals.units}</td>
                  <td className={tdNumClass}>{formatKes(totals.salesKes)}</td>
                  <td className={tdNumClass}>{formatKes(totals.earnedKes)}</td>
                  <td className={tdNumClass}>{formatKes(totals.paidToDateKes)}</td>
                  <td className={tdNumClass}>{owedLabel(totals.owedAtMonthEndKes, formatKes)}</td>
                  <td className={tdNumClass}>{owedLabel(totals.owedNowKes, formatKes)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-xs opacity-60">
          Orders, units, sales and commission are for {formatMonth(month)} (by the month each order was paid), counting
          only assigned products. Paid and owed include every month up to the end of {formatMonth(month)}.
        </p>
      </section>

      <section className="mt-10">
        <InviteAffiliateForm />
      </section>
    </div>
  )
}
