import type { ReactNode } from 'react'
import { formatCommissionTerms, formatMonth } from '@/lib/affiliate-terms'
import type { LedgerCommission, MonthStatement } from '@/lib/affiliates'
import { formatStoreDate } from '@/lib/dates'
import { formatKes } from '@/lib/money'
import {
  CommissionStatusBadge,
  owedLabel,
  rowClass,
  tableClass,
  tableWrapClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from '@/components/affiliate/ui'

export function MonthlyStatementTable({
  rows,
  renderActions,
}: {
  rows: MonthStatement[]
  renderActions?: (row: MonthStatement) => ReactNode
}) {
  if (rows.length === 0) return <p className="text-sm opacity-60">No earnings yet.</p>

  return (
    <div className={tableWrapClass}>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Month</th>
            <th className={thNumClass}>Orders</th>
            <th className={thNumClass}>Units</th>
            <th className={thNumClass}>Sales</th>
            <th className={thNumClass}>Earned</th>
            <th className={thNumClass}>Paid</th>
            <th className={thNumClass}>Owed</th>
            {renderActions && <th className={thClass} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month} className={rowClass}>
              <td className={`${tdClass} whitespace-nowrap font-medium`}>{formatMonth(row.month)}</td>
              <td className={tdNumClass}>{row.orders}</td>
              <td className={tdNumClass}>{row.units}</td>
              <td className={tdNumClass}>{formatKes(row.salesKes)}</td>
              <td className={tdNumClass}>{formatKes(row.earnedKes)}</td>
              <td className={tdNumClass}>{formatKes(row.paidKes)}</td>
              <td className={`${tdNumClass} font-medium`}>{owedLabel(row.owedKes, formatKes)}</td>
              {renderActions && <td className={tdClass}>{renderActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Commission lines. Shows order numbers only, never buyer details. */
export function CommissionsTable({
  rows,
  renderActions,
  renderOrder,
}: {
  rows: LedgerCommission[]
  renderActions?: (row: LedgerCommission) => ReactNode
  renderOrder?: (row: LedgerCommission) => ReactNode
}) {
  if (rows.length === 0) return <p className="text-sm opacity-60">No sales yet.</p>

  return (
    <div className={tableWrapClass}>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Date</th>
            <th className={thClass}>Order</th>
            <th className={thClass}>Product</th>
            <th className={thNumClass}>Qty</th>
            <th className={thNumClass}>Sale</th>
            <th className={thClass}>Rate</th>
            <th className={thNumClass}>Commission</th>
            <th className={thClass}>Status</th>
            {renderActions && <th className={thClass} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={`${rowClass} ${row.effective ? '' : 'opacity-60'}`}>
              <td className={`${tdClass} whitespace-nowrap`}>{formatStoreDate(row.orderCreatedAt)}</td>
              <td className={`${tdClass} whitespace-nowrap font-mono text-xs`}>
                {renderOrder ? renderOrder(row) : row.orderNumber}
              </td>
              <td className={`${tdClass} min-w-40`}>
                <p>{row.productName}</p>
                {row.variantLabel && <p className="text-xs opacity-60">{row.variantLabel}</p>}
              </td>
              <td className={tdNumClass}>{row.quantity}</td>
              <td className={tdNumClass}>{formatKes(row.saleAmountKes)}</td>
              <td className={`${tdClass} whitespace-nowrap text-xs opacity-70`}>
                {formatCommissionTerms(row.commissionType, row.rateValue)}
              </td>
              <td className={`${tdNumClass} font-medium`}>{formatKes(row.amountKes)}</td>
              <td className={tdClass}>
                <CommissionStatusBadge status={row.displayStatus} />
              </td>
              {renderActions && <td className={tdClass}>{renderActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
