import { notFound } from 'next/navigation'
import { ProductGrid } from '@/components/storefront/ProductGrid'
import { ShopFilters } from '@/components/storefront/ShopFilters'
import { prisma } from '@/lib/prisma'
import { getCategories, getProducts, type ProductSort } from '@/lib/queries/products'

const VALID_SORTS: ProductSort[] = ['newest', 'price-asc', 'price-desc']

export default async function ShopCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>
  searchParams: Promise<{ size?: string; sort?: string }>
}) {
  const { category: categorySlug } = await params
  const query = await searchParams

  const category = await prisma.category.findUnique({ where: { slug: categorySlug } })
  if (!category) notFound()

  const sort = VALID_SORTS.includes(query.sort as ProductSort) ? (query.sort as ProductSort) : undefined

  const [products, categories] = await Promise.all([
    getProducts({ categorySlug, size: query.size, sort }),
    getCategories(),
  ])

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{category.name}</h1>
      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[200px_1fr]">
        <ShopFilters
          categories={categories}
          activeCategorySlug={categorySlug}
          activeSize={query.size}
          activeSort={query.sort}
          basePath={`/shop/${categorySlug}`}
        />
        <ProductGrid products={products} />
      </div>
    </div>
  )
}
