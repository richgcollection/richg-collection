import { prisma } from '@/lib/prisma'
import { formatKes } from '@/lib/money'
import { AddCustomerForm } from '@/components/admin/AddCustomerForm'
import { CustomerDeleteButton } from '@/components/admin/CustomerDeleteButton'

export const dynamic = 'force-dynamic'

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = q?.trim()

  const customers = await prisma.customer.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

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
        <AddCustomerForm />
      </div>

      <form method="GET" className="mt-8 flex gap-2">
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
      </form>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
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
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-3 font-medium">
                {customer.firstName} {customer.lastName ?? ''}
              </td>
              <td className="py-3 opacity-80">{customer.phone ?? '—'}</td>
              <td className="py-3 opacity-80">{customer.email ?? '—'}</td>
              <td className="py-3 opacity-80">{customer.location ?? '—'}</td>
              <td className="py-3 opacity-80">{customer.source}</td>
              <td className="py-3 opacity-80">{customer.lastProduct ?? '—'}</td>
              <td className="py-3">{customer.totalOrders}</td>
              <td className="py-3">{formatKes(customer.totalSpentKes)}</td>
              <td className="py-3">
                <CustomerDeleteButton customerId={customer.id} />
              </td>
            </tr>
          ))}
          {customers.length === 0 && (
            <tr>
              <td colSpan={9} className="py-8 text-center opacity-60">
                No customers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
