import Link from 'next/link'
import { BrandStory } from '@/components/storefront/BrandStory'
import { CollectionGrid } from '@/components/storefront/CollectionGrid'
import { FeaturedSlider } from '@/components/storefront/FeaturedSlider'
import { Hero } from '@/components/storefront/Hero'
import { getCollectionCategories, getFeaturedProducts } from '@/lib/queries/products'

// Render at request time rather than statically at build time — the build
// environment doesn't have database access, only the deployed runtime does.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [featuredProducts, collectionCategories] = await Promise.all([
    getFeaturedProducts(8),
    getCollectionCategories(),
  ])

  return (
    <div>
      <Hero />

      <BrandStory />

      {collectionCategories.length > 0 && (
        <div className="py-16">
          <div className="mx-auto mb-8 flex max-w-6xl items-center justify-between px-6">
            <h2 className="text-xl font-semibold tracking-tight">Shop by Collection</h2>
            <Link href="/collections" className="text-sm opacity-70 hover:opacity-100">
              View all
            </Link>
          </div>
          <div className="mx-auto max-w-6xl px-6">
            <CollectionGrid categories={collectionCategories} />
          </div>
        </div>
      )}

      {featuredProducts.length > 0 && (
        <div className="py-16">
          <h2 className="mx-auto mb-8 max-w-6xl px-6 text-xl font-semibold tracking-tight">Featured</h2>
          <FeaturedSlider products={featuredProducts} />
        </div>
      )}
    </div>
  )
}
