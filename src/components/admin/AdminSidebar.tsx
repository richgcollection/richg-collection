'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/shipping-rates', label: 'Shipping Rates' },
  { href: '/admin/payment-settings', label: 'Payment Settings' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-black/10 p-4 dark:border-white/10">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm ${
              isActive ? 'bg-surface font-medium' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
