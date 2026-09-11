import Image from 'next/image'
import Link from 'next/link'
import { getCategoriesWithPreview } from '@/lib/queries/products'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const categories = await getCategoriesWithPreview()

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Collections</h1>
      <p className="mt-2 max-w-xl text-sm opacity-70">Browse every category in the Rich G Collection lineup.</p>

      {categories.length === 0 ? (
        <p className="mt-16 text-center text-sm opacity-60">No collections found.</p>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => (
            <Link key={category.id} href={`/shop/${category.slug}`} className="group flex flex-col gap-3">
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
                {category.imageUrl ? (
                  <Image
                    src={category.imageUrl}
                    alt={category.name}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover transition-opacity group-hover:opacity-80"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs uppercase opacity-40">
                    No image
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">{category.name}</h3>
                <span className="text-xs opacity-60">
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
