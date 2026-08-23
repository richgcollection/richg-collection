'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { trackMetaPixelEvent } from '@/components/analytics/MetaPixel'
import { addToCartAction } from '@/lib/actions/cart'
import { formatKes } from '@/lib/money'

type OptionValue = { id: string; value: string }
type Option = { id: string; name: string; values: OptionValue[] }
type Variant = { id: string; priceKes: number; stockQty: number; optionValueIds: string[] }

export function VariantSelector({
  productId,
  options,
  variants,
  basePriceKes,
  compareAtPriceKes,
}: {
  productId: string
  options: Option[]
  variants: Variant[]
  basePriceKes: number
  compareAtPriceKes: number | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null
    const selectedIds = Object.values(selected)
    if (selectedIds.length < options.length) return null
    return (
      variants.find((variant) =>
        selectedIds.every((id) => variant.optionValueIds.includes(id)),
      ) ?? null
    )
  }, [selected, variants, options.length])

  const displayPriceKes = selectedVariant?.priceKes ?? basePriceKes
  const needsSelection = options.length > 0 && !selectedVariant
  const inStock = selectedVariant
    ? selectedVariant.stockQty > 0
    : variants.length === 0
      ? true
      : null

  function isValueAvailable(optionId: string, valueId: string) {
    if (variants.length === 0) return true
    const candidate = { ...selected, [optionId]: valueId }
    const candidateIds = Object.values(candidate)
    return variants.some(
      (variant) =>
        candidateIds.every((id) => variant.optionValueIds.includes(id)) && variant.stockQty > 0,
    )
  }

  function handleAddToCart() {
    setFeedback(null)
    startTransition(async () => {
      const result = await addToCartAction({ productId, variantId: selectedVariant?.id })
      if (result.success) {
        setFeedback('Added to cart.')
        trackMetaPixelEvent('AddToCart', {
          content_ids: [productId],
          content_type: 'product',
          value: displayPriceKes,
          currency: 'KES',
        })
        router.refresh()
      } else {
        setFeedback(result.error)
      }
    })
  }

  const canAddToCart = !needsSelection && inStock !== false && !isPending

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-lg">
        <span>{formatKes(displayPriceKes)}</span>
        {compareAtPriceKes && !selectedVariant && (
          <span className="opacity-50 line-through">{formatKes(compareAtPriceKes)}</span>
        )}
      </div>

      {options.map((option) => (
        <div key={option.id}>
          <p className="mb-2 text-sm font-medium tracking-wide uppercase opacity-70">{option.name}</p>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const isSelected = selected[option.id] === value.id
              const available = isValueAvailable(option.id, value.id)
              return (
                <button
                  key={value.id}
                  type="button"
                  disabled={!available}
                  onClick={() => setSelected((prev) => ({ ...prev, [option.id]: value.id }))}
                  className={`rounded-full border px-4 py-2 text-sm transition-opacity ${
                    isSelected ? 'border-foreground' : 'border-black/10 dark:border-white/10'
                  } ${available ? '' : 'cursor-not-allowed opacity-30 line-through'}`}
                >
                  {value.value}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div>
        <button
          type="button"
          disabled={!canAddToCart}
          onClick={handleAddToCart}
          className="w-full rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {inStock === false ? 'Sold Out' : isPending ? 'Adding…' : 'Add to Cart'}
        </button>
        {needsSelection && <p className="mt-2 text-xs opacity-60">Select options to see availability.</p>}
        {feedback && <p className="mt-2 text-xs opacity-70">{feedback}</p>}
      </div>
    </div>
  )
}
