import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { getLifetimeSpendByCustomer, toMetaAudienceCsv } from '@/lib/customers'

export async function GET() {
  await requireAdmin()

  const [customers, ledgerSpend] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        location: true,
        gender: true,
        totalSpentKes: true,
      },
    }),
    getLifetimeSpendByCustomer(),
  ])

  const csv = toMetaAudienceCsv(
    customers.map((c) => ({
      ...c,
      // The ledger already includes website sales; the stored counter is only a fallback.
      lifetimeSpendKes: Math.max(ledgerSpend.get(c.id) ?? 0, c.totalSpentKes),
    })),
  )
  const filename = `rich-g-collection-customers-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
