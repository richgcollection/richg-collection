import { ProductCard } from '@/components/storefront/ProductCard'
import type { ProductListItem } from '@/lib/queries/products'

export function FeaturedSlider({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) return null

  // Duplicated so the marquee can loop seamlessly (translate exactly -50%).
  const track = [...products, ...products]

  return (
    <div className="group overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
      <div className="animate-marquee flex w-max gap-6 group-hover:[animation-play-state:paused]">
        {track.map((product, index) => (
          <div key={`${product.id}-${index}`} className="w-56 shrink-0 sm:w-64">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </div>
  )
}
