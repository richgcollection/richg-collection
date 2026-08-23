import { ProductGrid } from '@/components/storefront/ProductGrid'
import { ShopFilters } from '@/components/storefront/ShopFilters'
import { getCategories, getProducts, type ProductSort } from '@/lib/queries/products'

const VALID_SORTS: ProductSort[] = ['newest', 'price-asc', 'price-desc']

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ size?: string; sort?: string }>
}) {
  const params = await searchParams
  const sort = VALID_SORTS.includes(params.sort as ProductSort) ? (params.sort as ProductSort) : undefined

  const [products, categories] = await Promise.all([
    getProducts({ size: params.size, sort }),
    getCategories(),
  ])

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Shop</h1>
      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[200px_1fr]">
        <ShopFilters
          categories={categories}
          activeSize={params.size}
          activeSort={params.sort}
          basePath="/shop"
        />
        <ProductGrid products={products} />
      </div>
    </div>
  )
}
