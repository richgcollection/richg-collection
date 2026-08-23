import Link from 'next/link'
import { ProductDeleteButton } from '@/components/admin/ProductDeleteButton'
import { prisma } from '@/lib/prisma'
import { formatKes } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    include: { variants: { select: { stockQty: true } } },
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          New Product
        </Link>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
            <th className="py-2">Name</th>
            <th className="py-2">Price</th>
            <th className="py-2">Stock</th>
            <th className="py-2">Status</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const stock = product.variants.length
              ? product.variants.reduce((sum, v) => sum + v.stockQty, 0)
              : product.stockQty
            return (
              <tr key={product.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-3">
                  <Link href={`/admin/products/${product.id}/edit`} className="font-medium hover:opacity-70">
                    {product.name}
                  </Link>
                </td>
                <td className="py-3">{formatKes(product.salePriceKes ?? product.basePriceKes)}</td>
                <td className="py-3">{stock}</td>
                <td className="py-3">
                  <span className="rounded-full bg-surface px-2 py-1 text-xs font-medium tracking-wide uppercase">
                    {product.status}
                  </span>
                </td>
                <td className="py-3">
                  <ProductDeleteButton productId={product.id} />
                </td>
              </tr>
            )
          })}
          {products.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center opacity-60">
                No products yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
