import Link from 'next/link'
import { getCategories } from '@/lib/queries/products'

export async function Footer() {
  const categories = await getCategories()

  return (
    <footer className="border-t border-black/10 dark:border-white/10">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-16 text-sm sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
          <span className="text-base font-semibold tracking-wide uppercase">Rich G Collection</span>
          <p className="max-w-xs opacity-70">
            The modern classic man&apos;s wardrobe, sustainable, durable, and built for a man who takes
            care of himself.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-medium tracking-wide uppercase opacity-60">Shop</span>
          <Link href="/shop" className="opacity-70 hover:opacity-100">
            All Products
          </Link>
          {categories.map((category) => (
            <Link key={category.slug} href={`/shop/${category.slug}`} className="opacity-70 hover:opacity-100">
              {category.name}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-medium tracking-wide uppercase opacity-60">Company</span>
          <Link href="/about" className="opacity-70 hover:opacity-100">
            About Us
          </Link>
          <Link href="/contact" className="opacity-70 hover:opacity-100">
            Contact
          </Link>
          <Link href="/account" className="opacity-70 hover:opacity-100">
            My Account
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-medium tracking-wide uppercase opacity-60">Get in Touch</span>
          <p className="opacity-70">Nairobi, Kenya</p>
          <Link href="/contact" className="opacity-70 hover:opacity-100">
            Send us a message
          </Link>
        </div>
      </div>

      <div className="border-t border-black/10 px-6 py-6 text-xs opacity-60 dark:border-white/10">
        <div className="mx-auto max-w-6xl">
          &copy; {new Date().getFullYear()} Rich G Collection. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
