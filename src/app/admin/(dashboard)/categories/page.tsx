import { CategoryManager } from '@/components/admin/CategoryManager'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
      <div className="mt-6">
        <CategoryManager categories={categories} />
      </div>
    </div>
  )
}
