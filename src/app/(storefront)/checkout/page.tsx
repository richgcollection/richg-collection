import { redirect } from 'next/navigation'
import { TrackEvent } from '@/components/analytics/TrackEvent'
import { CheckoutForm } from '@/components/storefront/CheckoutForm'
import { getCart } from '@/lib/cart'
import { formatKes } from '@/lib/money'
import { getTowns } from '@/lib/shipping'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  const cart = await getCart()
  if (cart.items.length === 0) {
    redirect('/cart')
  }

  const towns = await getTowns()

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <TrackEvent
        event="InitiateCheckout"
        params={{
          value: cart.subtotalKes,
          currency: 'KES',
          num_items: cart.items.length,
          content_ids: cart.items.map((item) => item.productId),
        }}
      />
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>

      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[1fr_320px]">
        <CheckoutForm towns={towns} />

        <div className="rounded-lg border border-black/10 p-6 dark:border-white/10">
          <h2 className="mb-4 text-sm font-medium tracking-wide uppercase opacity-70">Order Summary</h2>
          <div className="flex flex-col gap-3">
            {cart.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="opacity-80">
                  {item.productName}
                  {item.variantLabel ? ` (${item.variantLabel})` : ''} × {item.quantity}
                </span>
                <span>{formatKes(item.lineTotalKes)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between border-t border-black/10 pt-4 text-sm font-medium dark:border-white/10">
            <span>Subtotal</span>
            <span>{formatKes(cart.subtotalKes)}</span>
          </div>
          <p className="mt-1 text-xs opacity-60">Shipping is calculated from your delivery town after you submit.</p>
        </div>
      </div>
    </div>
  )
}
