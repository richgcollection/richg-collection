const KES_FORMATTER = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
})

export function formatKes(amount: number): string {
  return KES_FORMATTER.format(amount)
}
