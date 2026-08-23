import { MetaPixel } from '@/components/analytics/MetaPixel'
import { Footer } from '@/components/storefront/Footer'
import { Nav } from '@/components/storefront/Nav'

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
