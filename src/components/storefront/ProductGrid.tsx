import { ProductCard } from '@/components/storefront/ProductCard'
import type { ProductListItem } from '@/lib/queries/products'

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) {
    return <p className="py-16 text-center text-sm opacity-60">No products found.</p>
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
