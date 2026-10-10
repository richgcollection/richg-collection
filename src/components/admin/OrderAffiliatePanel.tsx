import { OrderAffiliateAttribution } from '@/components/admin/OrderAffiliateAttribution'
import { effectiveCommissionWhere } from '@/lib/affiliates'
import { formatKes } from '@/lib/money'
import { prisma } from '@/lib/prisma'

/** Self-contained affiliate box for the admin order page: loads its own data. */
export async function OrderAffiliatePanel({ orderId }: { orderId: string }) {
  const [order, affiliates, commission] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { affiliateId: true } }),
    prisma.affiliate.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, referralCode: true, status: true },
    }),
    prisma.affiliateCommission.aggregate({
      where: { orderId, ...effectiveCommissionWhere },
      _sum: { amountKes: true },
      _count: true,
    }),
  ])
  if (!order) return null

  return (
    <OrderAffiliateAttribution
      key={order.affiliateId ?? 'none'}
      orderId={orderId}
      affiliateId={order.affiliateId}
      affiliates={affiliates}
      commissionKes={commission._count > 0 ? formatKes(commission._sum.amountKes ?? 0) : null}
    />
  )
}
