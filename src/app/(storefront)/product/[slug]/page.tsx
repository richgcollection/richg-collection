import Image from 'next/image'
import { notFound } from 'next/navigation'
import { VariantSelector } from '@/components/storefront/VariantSelector'
import { getProductBySlug } from '@/lib/queries/products'

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) notFound()

  const mainImage = product.images[0]

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
          {mainImage ? (
            <Image
              src={mainImage.url}
              alt={mainImage.altText ?? product.name}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs uppercase opacity-40">
              No image
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div>
            {product.categories.length > 0 && (
              <p className="text-xs tracking-wide uppercase opacity-60">
                {product.categories.map((c) => c.name).join(' · ')}
              </p>
            )}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{product.name}</h1>
          </div>

          <VariantSelector
            options={product.options}
            variants={product.variants}
            basePriceKes={product.salePriceKes ?? product.basePriceKes}
            compareAtPriceKes={product.salePriceKes ? product.basePriceKes : null}
          />

          {product.description && (
            <p className="border-t border-black/10 pt-6 text-sm opacity-80 dark:border-white/10">
              {product.description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
