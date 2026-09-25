import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { formatKes } from '@/lib/money'
import { getStockSummary, getProfitSummary, listStockMovements, NEEDS_REVIEW_PREFIX } from '@/lib/inventory'
import { StockMovementForms } from '@/components/admin/StockMovementForms'
import { MovementNoteEditor } from '@/components/admin/MovementNoteEditor'
import type { StockMovementReason } from '@prisma/client'

export const dynamic = 'force-dynamic'

const REASON_LABELS: Record<StockMovementReason, string> = {
  RESTOCK: 'Restock',
  ONLINE_SALE: 'Online Sale',
  MANUAL_SALE: 'Manual Sale',
  DAMAGE: 'Damage',
  REWARD: 'Reward',
  INFLUENCER: 'Influencer',
  ADJUSTMENT: 'Adjustment',
}

function isStockMovementReason(value: string): value is StockMovementReason {
  return value in REASON_LABELS
}

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; review?: string }>
}) {
  const { reason, review } = await searchParams
  const activeReason = reason && isStockMovementReason(reason) ? reason : undefined
  const needsReview = review === '1'

  const [summary, profit, movements, products, reviewCount] = await Promise.all([
    getStockSummary(),
    getProfitSummary(),
    listStockMovements({ reason: activeReason, needsReview }),
    prisma.product.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        variants: {
          select: {
            id: true,
            optionValues: {
              select: { optionValue: { select: { value: true, option: { select: { name: true } } } } },
            },
          },
        },
      },
    }),
    prisma.stockMovement.count({ where: { note: { startsWith: NEEDS_REVIEW_PREFIX } } }),
  ])

  const productOptions = products.map((p) => ({
    id: p.id,
    name: p.name,
    variants: p.variants.map((v) => ({
      id: v.id,
      label:
        v.optionValues.map((ov) => `${ov.optionValue.option.name}: ${ov.optionValue.value}`).join(' / ') ||
        'Default',
    })),
  }))

  const lowStockCount = summary.filter((r) => r.lowStock).length

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue (All Time)" value={formatKes(profit.revenueKes)} />
        <StatCard label="Cost (All Time)" value={formatKes(profit.costKes)} />
        <StatCard label="Profit (All Time)" value={formatKes(profit.profitKes)} />
        <StatCard label="Low Stock Items" value={String(lowStockCount)} />
      </div>

      <div className="mt-8">
        <StockMovementForms products={productOptions} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium tracking-wide uppercase opacity-70">Stock Summary</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
              <th className="py-2">Product</th>
              <th className="py-2">Variant</th>
              <th className="py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr
                key={`${row.productId}-${row.variantId ?? 'base'}`}
                className={`border-b border-black/5 dark:border-white/5 ${
                  row.lowStock ? 'bg-red-600 text-white' : ''
                }`}
              >
                <td className="py-2 pl-2">{row.productName}</td>
                <td className="py-2">{row.variantLabel ?? '—'}</td>
                <td className="py-2">{row.stockQty}</td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr>
                <td colSpan={3} className="py-8 text-center opacity-60">
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium tracking-wide uppercase opacity-70">Movement History</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/inventory"
              className={`rounded-full border px-3 py-1 text-xs ${
                !activeReason && !needsReview ? 'border-foreground' : 'border-black/10 dark:border-white/10'
              }`}
            >
              All
            </Link>
            {reviewCount > 0 && (
              <Link
                href="/admin/inventory?review=1"
                className={`rounded-full border px-3 py-1 text-xs text-amber-700 dark:text-amber-400 ${
                  needsReview ? 'border-amber-500' : 'border-amber-500/40'
                }`}
              >
                Needs review ({reviewCount})
              </Link>
            )}
            {(Object.entries(REASON_LABELS) as [StockMovementReason, string][]).map(([value, label]) => (
              <Link
                key={value}
                href={`/admin/inventory?reason=${value}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  activeReason === value ? 'border-foreground' : 'border-black/10 dark:border-white/10'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
              <th className="py-2">Date</th>
              <th className="py-2">Product</th>
              <th className="py-2">Direction</th>
              <th className="py-2">Reason</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Party</th>
              <th className="py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => {
              const variantLabel = m.variant?.optionValues
                .map((ov) => `${ov.optionValue.option.name}: ${ov.optionValue.value}`)
                .join(' / ')
              return (
                <tr key={m.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 opacity-60">{m.createdAt.toLocaleDateString('en-KE')}</td>
                  <td className="py-2">
                    {m.product.name}
                    {variantLabel ? ` (${variantLabel})` : ''}
                  </td>
                  <td className="py-2">{m.direction}</td>
                  <td className="py-2">{REASON_LABELS[m.reason]}</td>
                  <td className="py-2">{m.quantity}</td>
                  <td className="py-2 opacity-70">{m.counterparty ?? m.supplier ?? '—'}</td>
                  <td className="py-2">
                    <MovementNoteEditor movementId={m.id} note={m.note} />
                  </td>
                </tr>
              )
            })}
            {movements.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center opacity-60">
                  No stock movements yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-surface p-5 dark:border-white/10">
      <p className="text-xs font-medium tracking-wide uppercase opacity-60">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}
