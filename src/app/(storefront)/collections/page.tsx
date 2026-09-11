import { CollectionGrid } from '@/components/storefront/CollectionGrid'
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
        <div className="mt-10">
          <CollectionGrid categories={categories} />
        </div>
      )}
    </div>
  )
}
