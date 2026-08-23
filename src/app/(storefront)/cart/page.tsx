import Link from 'next/link'
import { CartLineItem } from '@/components/storefront/CartLineItem'
import { getCart } from '@/lib/cart'
import { formatKes } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function CartPage() {
  const cart = await getCart()

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Cart</h1>
        <p className="mt-4 opacity-70">Your cart is empty.</p>
        <Link
          href="/shop"
          className="mt-6 inline-block rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
        >
          Continue Shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Cart</h1>

      <div className="mt-8 flex flex-col divide-y divide-black/10 dark:divide-white/10">
        {cart.items.map((item) => (
          <CartLineItem key={item.id} item={item} />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-black/10 pt-6 dark:border-white/10">
        <span className="text-lg font-medium">Subtotal</span>
        <span className="text-lg font-medium">{formatKes(cart.subtotalKes)}</span>
      </div>
      <p className="mt-1 text-sm opacity-60">Shipping calculated at checkout.</p>

      <Link
        href="/checkout"
        className="mt-6 block w-full rounded-full bg-foreground px-6 py-3 text-center text-sm font-medium text-background hover:opacity-90"
      >
        Proceed to Checkout
      </Link>
    </div>
  )
}
