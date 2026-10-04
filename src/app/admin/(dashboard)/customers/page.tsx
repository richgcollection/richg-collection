import { prisma } from '@/lib/prisma'
import { formatKes } from '@/lib/money'
import { formatStoreDateTime } from '@/lib/dates'
import { AddCustomerForm } from '@/components/admin/AddCustomerForm'
import { CustomerDeleteButton } from '@/components/admin/CustomerDeleteButton'
import { CustomerRow, type CustomerPurchase } from '@/components/admin/CustomerRow'
import { CustomerPhoneEditor } from '@/components/admin/CustomerPhoneEditor'
import { CustomerEditButton } from '@/components/admin/CustomerEditButton'
import { getLedgerByCustomer } from '@/lib/customers'

export const dynamic = 'force-dynamic'

const COLUMN_COUNT = 10

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; missing?: string }>
}) {
  const { q, missing } = await searchParams
  const query = q?.trim()
  const missingPhone = missing === 'phone'

  const [customers, products, ledger, missingPhoneCount] = await Promise.all([
    prisma.customer.findMany({
      where: {
        ...(missingPhone ? { phone: null } : {}),
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            paymentStatus: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                nameSnapshot: true,
                variantSnapshot: true,
                quantity: true,
                lineTotalKes: true,
              },
            },
          },
        },
      },
    }),
    prisma.product.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    getLedgerByCustomer(),
    prisma.customer.count({ where: { phone: null } }),
  ])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <a
          href="/api/admin/customers/export"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Export CSV for Meta Ads
        </a>
      </div>

      <div className="mt-6">
        <AddCustomerForm products={products} />
      </div>

      <form method="GET" className="mt-8 flex flex-wrap items-center gap-2">
        {missingPhone && <input type="hidden" name="missing" value="phone" />}
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by name, phone or email…"
          className="w-full max-w-sm rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
        <button
          type="submit"
          className="rounded-full border border-black/10 px-4 py-2 text-sm dark:border-white/10"
        >
          Search
        </button>
        {missingPhoneCount > 0 && (
          <a
            href={missingPhone ? '/admin/customers' : '/admin/customers?missing=phone'}
            className={`rounded-full border px-4 py-2 text-sm ${
              missingPhone ? 'border-foreground font-medium' : 'border-black/10 dark:border-white/10'
            }`}
          >
            {missingPhone ? 'Show all customers' : `Missing phone (${missingPhoneCount})`}
          </a>
        )}
      </form>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
            <th className="w-6 py-2" />
            <th className="py-2">Name</th>
            <th className="py-2">Phone</th>
            <th className="py-2">Email</th>
            <th className="py-2">Location</th>
            <th className="py-2">Source</th>
            <th className="py-2">Last Product</th>
            <th className="py-2">Orders</th>
            <th className="py-2">Total Spent</th>
            <th className="py-2" />
          </tr>
        </thead>
        {customers.map((customer) => {
          const purchases: CustomerPurchase[] = customer.orders.flatMap((order) =>
            order.items.map((item) => ({
              key: item.id,
              productName: item.nameSnapshot,
              variantLabel: item.variantSnapshot,
              quantity: item.quantity,
              amount: formatKes(item.lineTotalKes),
              discount: null,
              purchasedAt: formatStoreDateTime(order.createdAt),
              channel: 'Website',
              orderId: order.id,
              orderNumber: order.orderNumber,
              paymentStatus: order.paymentStatus,
            })),
          )
          // Sales recorded under Inventory → Stock Out (online sales already appear above as orders).
          const customerLedger = ledger.get(customer.id)
          for (const sale of customerLedger?.sales ?? []) {
            if (sale.reason !== 'MANUAL_SALE') continue
            purchases.push({
              key: sale.id,
              productName: sale.productName,
              variantLabel: sale.variantLabel,
              quantity: sale.quantity,
              amount: sale.unitPriceKes != null ? formatKes(sale.valueKes) : null,
              discount: sale.discountKes ? formatKes(sale.discountKes) : null,
              purchasedAt: formatStoreDateTime(sale.createdAt),
              channel: 'Stock out',
              orderId: null,
              orderNumber: null,
              paymentStatus: null,
            })
          }

          return (
            <CustomerRow
              key={customer.id}
              purchases={purchases}
              columnCount={COLUMN_COUNT}
              cells={
                <>
                  <td className="py-3 font-medium">
                    {customer.firstName} {customer.lastName ?? ''}
                  </td>
                  <td className="py-3">
                    <CustomerPhoneEditor customerId={customer.id} phone={customer.phone} />
                  </td>
                  <td className="py-3 opacity-80">{customer.email ?? '—'}</td>
                  <td className="py-3 opacity-80">{customer.location ?? '—'}</td>
                  <td className="py-3 opacity-80">{customer.source}</td>
                  <td className="py-3 opacity-80">{customer.lastProduct ?? '—'}</td>
                  <td className="py-3">{customer.totalOrders}</td>
                  {/* Same figure the Meta CSV exports: the sales ledger, with the checkout counter as a fallback. */}
                  <td className="py-3">{formatKes(Math.max(customerLedger?.spendKes ?? 0, customer.totalSpentKes))}</td>
                  <td className="py-3">
                    <div className="flex items-start justify-end gap-3">
                      <CustomerEditButton
                        customer={{
                          id: customer.id,
                          firstName: customer.firstName,
                          lastName: customer.lastName,
                          phone: customer.phone,
                          email: customer.email,
                          gender: customer.gender,
                          location: customer.location,
                          source: customer.source,
                          notes: customer.notes,
                        }}
                      />
                      <CustomerDeleteButton customerId={customer.id} />
                    </div>
                  </td>
                </>
              }
            />
          )
        })}
        {customers.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={COLUMN_COUNT} className="py-8 text-center opacity-60">
                No customers yet.
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  )
}
