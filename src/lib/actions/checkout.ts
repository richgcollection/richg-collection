'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCart, getCurrentCartId } from '@/lib/cart'
import { createPendingOrder } from '@/lib/orders'
import { initializeTransaction, isPaystackConfigured } from '@/lib/paystack'
import { prisma } from '@/lib/prisma'
import { getShippingRateForTown } from '@/lib/shipping'

const shippingAddressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.'),
  phone: z.string().trim().min(7, 'Enter a valid phone number.'),
  email: z.email('Enter a valid email address.'),
  line1: z.string().trim().min(3, 'Enter your delivery address.'),
  line2: z.string().optional(),
  town: z.string().trim().min(2, 'Select your delivery town.'),
})

export type CheckoutState = { error?: string } | undefined

export async function placeOrderAction(
  _prevState: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = shippingAddressSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    line1: formData.get('line1'),
    line2: formData.get('line2') || undefined,
    town: formData.get('town'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' }
  }

  const cart = await getCart()
  if (cart.items.length === 0) {
    return { error: 'Your cart is empty.' }
  }

  const shippingKes = await getShippingRateForTown(parsed.data.town)
  const order = await createPendingOrder(cart, parsed.data, shippingKes)

  const cartId = await getCurrentCartId()
  if (cartId) {
    await prisma.cartItem.deleteMany({ where: { cartId } })
  }

  if (!(await isPaystackConfigured())) {
    redirect(`/checkout/success?order=${order.orderNumber}&payment=pending-setup`)
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  // `redirect()` throws internally, so keep it out of the try block —
  // otherwise this catch would also swallow the successful-redirect throw.
  let authorizationUrl: string | null = null
  try {
    const transaction = await initializeTransaction({
      email: parsed.data.email,
      amountKes: order.totalKes,
      reference: order.orderNumber,
      callbackUrl: `${siteUrl}/checkout/success`,
      metadata: { orderNumber: order.orderNumber },
    })
    authorizationUrl = transaction.data.authorization_url
  } catch {
    redirect(`/checkout/success?order=${order.orderNumber}&payment=error`)
  }

  redirect(authorizationUrl)
}
