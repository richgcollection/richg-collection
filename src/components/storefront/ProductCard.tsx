import Image from 'next/image'
import Link from 'next/link'
import { formatKes } from '@/lib/money'
import type { ProductListItem } from '@/lib/queries/products'

export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group relative isolate flex aspect-[3/4] w-full items-end overflow-hidden rounded-2xl bg-black"
    >
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white/40 uppercase">
          No image
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

      {!product.inStock && (
        <span className="absolute top-2 left-2 rounded-full bg-background px-2 py-1 text-[10px] font-medium tracking-wide uppercase">
          Sold out
        </span>
      )}

      <div className="relative flex w-full flex-col gap-1 p-4">
        <h3 className="text-sm font-medium text-white">{product.name}</h3>
        <div className="flex items-center gap-2 text-sm text-white/90">
          <span>{formatKes(product.priceKes)}</span>
          {product.compareAtPriceKes && (
            <span className="text-white/50 line-through">{formatKes(product.compareAtPriceKes)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
