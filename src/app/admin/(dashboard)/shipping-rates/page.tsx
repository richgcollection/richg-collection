import { ShippingRateManager } from '@/components/admin/ShippingRateManager'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function AdminShippingRatesPage() {
  const rates = await prisma.shippingRate.findMany({
    orderBy: { county: 'asc' },
    select: { county: true, rateKes: true },
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Shipping Rates</h1>
      <div className="mt-6">
        <ShippingRateManager rates={rates} />
      </div>
    </div>
  )
}
