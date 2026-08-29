import { BrandStory } from '@/components/storefront/BrandStory'
import { FeaturedSlider } from '@/components/storefront/FeaturedSlider'
import { Hero } from '@/components/storefront/Hero'
import { getFeaturedProducts } from '@/lib/queries/products'

// Render at request time rather than statically at build time — the build
// environment doesn't have database access, only the deployed runtime does.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const featuredProducts = await getFeaturedProducts(8)

  return (
    <div>
      <Hero />

      <BrandStory />

      {featuredProducts.length > 0 && (
        <div className="py-16">
          <h2 className="mx-auto mb-8 max-w-6xl px-6 text-xl font-semibold tracking-tight">Featured</h2>
          <FeaturedSlider products={featuredProducts} />
        </div>
      )}
    </div>
  )
}
