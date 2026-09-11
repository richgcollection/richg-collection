import Image from 'next/image'
import Link from 'next/link'
import { getCollectionCategories } from '@/lib/queries/products'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const categories = await getCollectionCategories()

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Collections</h1>
      <p className="mt-2 max-w-xl text-sm opacity-70">Browse every category in the Rich G Collection lineup.</p>

      {categories.length === 0 ? (
        <p className="mt-16 text-center text-sm opacity-60">No collections found.</p>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/shop/${category.slug}`}
              className="group relative isolate flex aspect-[3/4] w-full items-end overflow-hidden rounded-2xl bg-black"
            >
              {category.imageUrl ? (
                <Image
                  src={category.imageUrl}
                  alt={category.name}
                  fill
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 bg-black/60" />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

              <div className="relative flex w-full flex-col gap-1 p-5">
                <h3 className="text-lg font-semibold tracking-wide text-white uppercase">{category.name}</h3>
                <span className="text-xs text-white/70">
                  {category.productCount} {category.productCount === 1 ? 'item' : 'items'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
