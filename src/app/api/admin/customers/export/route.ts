import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { toMetaAudienceCsv } from '@/lib/customers'

export async function GET() {
  await requireAdmin()

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    select: { email: true, phone: true, firstName: true, lastName: true, location: true, gender: true },
  })

  const csv = toMetaAudienceCsv(customers)
  const filename = `rich-g-collection-customers-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
