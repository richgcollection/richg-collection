'use client'

import { useMemo, useState } from 'react'
import { formatKes } from '@/lib/money'

type OptionValue = { id: string; value: string }
type Option = { id: string; name: string; values: OptionValue[] }
type Variant = { id: string; priceKes: number; stockQty: number; optionValueIds: string[] }

export function VariantSelector({
  options,
  variants,
  basePriceKes,
  compareAtPriceKes,
}: {
  options: Option[]
  variants: Variant[]
  basePriceKes: number
  compareAtPriceKes: number | null
}) {
  const [selected, setSelected] = useState<Record<string, string>>({})

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
          disabled
          title="Cart coming soon"
          className="w-full cursor-not-allowed rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background opacity-50"
        >
          {inStock === false ? 'Sold Out' : 'Add to Cart — coming soon'}
        </button>
        {options.length > 0 && !selectedVariant && (
          <p className="mt-2 text-xs opacity-60">Select options to see availability.</p>
        )}
      </div>
    </div>
  )
}
