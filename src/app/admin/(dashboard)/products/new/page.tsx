import { ProductForm } from '@/components/admin/ProductForm'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function NewProductPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">New Product</h1>
      <div className="mt-6 max-w-3xl">
        <ProductForm categories={categories} />
      </div>
    </div>
  )
}
