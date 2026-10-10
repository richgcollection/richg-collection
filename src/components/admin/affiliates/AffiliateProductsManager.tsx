'use client'

import { useState, useTransition } from 'react'
import type { CommissionType } from '@prisma/client'
import { ProductMultiSelect, type MultiSelectOption } from '@/components/admin/ProductMultiSelect'
import {
  assignAffiliateProductsAction,
  removeAffiliateProductAction,
  updateAffiliateProductAction,
} from '@/lib/actions/admin-affiliates'
import { bpsToPercent, formatCommissionTerms } from '@/lib/affiliate-terms'
import { affiliateInputClass } from '@/components/admin/affiliates/CommissionFields'

export type AffiliateAssignment = {
  productId: string
  id: string
  productName: string
  commissionType: CommissionType | null
  commissionValue: number | null
}

export function AffiliateProductsManager({
  affiliateId,
  assignments,
  products,
  defaultTerms,
}: {
  affiliateId: string
  assignments: AffiliateAssignment[]
  products: MultiSelectOption[]
  defaultTerms: string
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const assigned = new Set(assignments.map((a) => a.productId))
  const available = products.filter((p) => !assigned.has(p.id))

  function handleAssign() {
    setError(null)
    startTransition(async () => {
      const result = await assignAffiliateProductsAction({ affiliateId, productIds: selectedIds })
      if (result.success) setSelectedIds([])
      else setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div>
        <p className="font-medium">Products</p>
        <p className="text-sm opacity-60">
          Commission is only earned on these products. Default terms: {defaultTerms}.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <ProductMultiSelect options={available} selectedIds={selectedIds} onChange={setSelectedIds} />
        </div>
        <button
          type="button"
          onClick={handleAssign}
          disabled={isPending || selectedIds.length === 0}
          className="shrink-0 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Assigning…' : 'Assign'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {assignments.length === 0 ? (
        <p className="text-sm opacity-60">No products assigned yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
          {assignments.map((a) => (
            <AssignmentRow key={`${a.id}-${a.commissionType}-${a.commissionValue}`} assignment={a} defaultTerms={defaultTerms} />
          ))}
        </ul>
      )}
    </div>
  )
}

function AssignmentRow({ assignment, defaultTerms }: { assignment: AffiliateAssignment; defaultTerms: string }) {
  const hasOverride = assignment.commissionType !== null && assignment.commissionValue !== null
  const [type, setType] = useState<CommissionType | ''>(hasOverride ? assignment.commissionType! : '')
  const [value, setValue] = useState(
    hasOverride
      ? assignment.commissionType === 'PERCENT'
        ? bpsToPercent(assignment.commissionValue!)
        : String(assignment.commissionValue)
      : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(nextType: CommissionType | '', nextValue: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateAffiliateProductAction({
        assignmentId: assignment.id,
        commissionType: nextType,
        commissionValue: nextValue,
      })
      if (!result.success) setError(result.error)
    })
  }

  function remove() {
    if (!confirm(`Stop earning commission on ${assignment.productName}? Past commissions are kept.`)) return
    startTransition(async () => {
      const result = await removeAffiliateProductAction(assignment.id)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <li className={`flex flex-col gap-2 py-3 lg:flex-row lg:items-center ${isPending ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{assignment.productName}</p>
        <p className="text-xs opacity-60">
          {hasOverride
            ? `Override: ${formatCommissionTerms(assignment.commissionType!, assignment.commissionValue!)}`
            : `Default: ${defaultTerms}`}
        </p>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CommissionType | '')}
          disabled={isPending}
          aria-label="Override type"
          className={`${affiliateInputClass} w-auto`}
        >
          <option value="">Use default</option>
          <option value="PERCENT">Percent</option>
          <option value="FIXED">KES / unit</option>
        </select>
        {type && (
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={type === 'PERCENT' ? 100 : undefined}
            step={type === 'PERCENT' ? 0.01 : 1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isPending}
            aria-label={type === 'PERCENT' ? 'Rate (%)' : 'KES per unit'}
            placeholder={type === 'PERCENT' ? '%' : 'KES'}
            className={`${affiliateInputClass} w-28`}
          />
        )}
        <button
          type="button"
          onClick={() => save(type, value)}
          disabled={isPending || (type !== '' && value.trim() === '')}
          className="rounded-full border border-black/10 px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
        >
          Save
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="rounded-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
        >
          Remove
        </button>
      </div>
    </li>
  )
}
