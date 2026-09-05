'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About Us' },
  { href: '/shop', label: 'Shop' },
  { href: '/contact', label: 'Contact' },
  { href: '/account', label: 'Account' },
  { href: '/cart', label: 'Cart' },
]

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-wide uppercase" onClick={() => setMenuOpen(false)}>
          Rich G Collection
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:opacity-70">
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>

        <div className="flex items-center gap-3 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-8 w-8 items-center justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              {menuOpen ? (
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-black/10 px-6 py-4 text-sm md:hidden dark:border-white/10">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-2 py-3 hover:bg-black/5 dark:hover:bg-white/5"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
