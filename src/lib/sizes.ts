/** Letter sizes from smallest to largest. `XXL` and `2XL` are the same size. */
const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL']
const LETTER_ALIASES: Record<string, string> = { XXL: '2XL', XXXL: '3XL', XXXXL: '4XL' }

function letterRank(size: string): number {
  const key = size.trim().toUpperCase().replace(/\s+/g, '')
  return LETTER_SIZES.indexOf(LETTER_ALIASES[key] ?? key)
}

/** Every number in the label, e.g. `W30, L32` -> [30, 32], `42` -> [42]. */
function numbersIn(size: string): number[] {
  return (size.match(/\d+(\.\d+)?/g) ?? []).map(Number)
}

/**
 * Smallest size first: letter sizes (S, M, L … 5XL), then numeric sizes such
 * as trouser waist/length (`W30, L30` < `W30, L32` < `W32, L30`), then
 * anything else alphabetically.
 */
export function compareSizes(a: string, b: string): number {
  const la = letterRank(a)
  const lb = letterRank(b)
  if (la !== -1 && lb !== -1) return la - lb
  if (la !== -1) return -1
  if (lb !== -1) return 1

  const na = numbersIn(a)
  const nb = numbersIn(b)
  if (na.length > 0 && nb.length > 0) {
    for (let i = 0; i < Math.min(na.length, nb.length); i++) {
      if (na[i] !== nb[i]) return na[i] - nb[i]
    }
    if (na.length !== nb.length) return na.length - nb.length
  } else if (na.length > 0) {
    return -1
  } else if (nb.length > 0) {
    return 1
  }
  return a.localeCompare(b)
}

export const isSizeOption = (optionName: string) => /size/i.test(optionName)

type VariantWithOptions = {
  optionValues: { optionValue: { value: string; option?: { name: string } } }[]
}

/** The variant's size value, falling back to its first option value when no option is named "Size". */
function variantSize(variant: VariantWithOptions): string {
  const values = variant.optionValues.map((ov) => ov.optionValue)
  return (values.find((v) => v.option && isSizeOption(v.option.name)) ?? values[0])?.value ?? ''
}

/** Variants ordered by size, smallest first. */
export function sortVariantsBySize<T extends VariantWithOptions>(variants: T[]): T[] {
  return [...variants].sort((a, b) => compareSizes(variantSize(a), variantSize(b)))
}
