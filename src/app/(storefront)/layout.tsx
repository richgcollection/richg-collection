import { MetaPixel } from '@/components/analytics/MetaPixel'
import { Footer } from '@/components/storefront/Footer'
import { Nav } from '@/components/storefront/Nav'

// Footer queries the database for category links, so every page under this
// layout must render at request time rather than being statically
// prerendered at build time — the build environment has no DB access (only
// the deployed runtime does), same reasoning as the homepage's featured
// products.
export const dynamic = 'force-dynamic'

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <MetaPixel />
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
