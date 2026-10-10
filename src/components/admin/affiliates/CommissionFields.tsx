'use client'

import { useState } from 'react'
import type { CommissionType } from '@prisma/client'
import { bpsToPercent } from '@/lib/affiliate-terms'

export const affiliateInputClass =
  'w-full min-w-0 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'
export const affiliateLabelClass = 'text-xs font-medium tracking-wide uppercase opacity-70'

/** Commission type + value inputs. PERCENT is entered as a percent (e.g. 7.5), FIXED as KES per unit. */
export function CommissionFields({
  defaultType = 'PERCENT',
  defaultValue = 1000,
}: {
  defaultType?: CommissionType
  /** Stored value: KES (FIXED) or basis points (PERCENT). */
  defaultValue?: number
}) {
  const [type, setType] = useState<CommissionType>(defaultType)

  return (
    <>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={affiliateLabelClass}>Commission type</span>
        <select
          name="commissionType"
          value={type}
          onChange={(e) => setType(e.target.value as CommissionType)}
          className={affiliateInputClass}
        >
          <option value="PERCENT">Percent of sale</option>
          <option value="FIXED">Fixed KES per unit</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={affiliateLabelClass}>{type === 'PERCENT' ? 'Rate (%)' : 'Amount (KES per unit)'}</span>
        <input
          key={type}
          name="commissionValue"
          type="number"
          inputMode="decimal"
          min={0}
          max={type === 'PERCENT' ? 100 : undefined}
          step={type === 'PERCENT' ? 0.01 : 1}
          required
          defaultValue={
            type === defaultType ? (type === 'PERCENT' ? bpsToPercent(defaultValue) : defaultValue) : undefined
          }
          className={affiliateInputClass}
        />
      </label>
    </>
  )
}
