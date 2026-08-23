import Link from 'next/link'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About Us' },
  { href: '/shop', label: 'Shop' },
  { href: '/contact', label: 'Contact' },
]

export function Nav() {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-wide uppercase">
          Rich G Collection
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:opacity-70">
              {link.label}
            </Link>
          ))}
          <Link href="/account" className="hover:opacity-70">
            Account
          </Link>
          <Link href="/cart" className="hover:opacity-70">
            Cart
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
