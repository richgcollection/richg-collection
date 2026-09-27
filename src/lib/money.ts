const KES_FORMATTER = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
})

export function formatKes(amount: number): string {
  return KES_FORMATTER.format(amount)
}

/** Fallback used when `KES_PER_USD` isn't set. Update it (or set the env var) when the rate moves. */
const DEFAULT_KES_PER_USD = 129

export function getKesPerUsd(): number {
  const rate = Number(process.env.KES_PER_USD)
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_KES_PER_USD
}

/** Converts a KES amount to USD, rounded to cents. */
export function kesToUsd(amountKes: number, kesPerUsd = getKesPerUsd()): number {
  return Math.round((amountKes / kesPerUsd) * 100) / 100
}
