import Image from 'next/image'
import Link from 'next/link'
import { formatKes } from '@/lib/money'
import type { ProductListItem } from '@/lib/queries/products'

export function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link href={`/product/${product.slug}`} className="group flex flex-col gap-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-opacity group-hover:opacity-80"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs uppercase opacity-40">
            No image
          </div>
        )}
        {!product.inStock && (
          <span className="absolute top-2 left-2 rounded-full bg-background px-2 py-1 text-[10px] font-medium tracking-wide uppercase">
            Sold out
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{product.name}</h3>
        <div className="flex items-center gap-2 text-sm">
          <span>{formatKes(product.priceKes)}</span>
          {product.compareAtPriceKes && (
            <span className="opacity-50 line-through">{formatKes(product.compareAtPriceKes)}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
