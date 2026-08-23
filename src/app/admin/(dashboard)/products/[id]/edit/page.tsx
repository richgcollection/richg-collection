import { notFound } from 'next/navigation'
import { ProductForm } from '@/components/admin/ProductForm'
import { VariantStockEditor } from '@/components/admin/VariantStockEditor'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: 'asc' } },
        categories: { select: { categoryId: true } },
        variants: {
          include: { optionValues: { include: { optionValue: true } } },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  if (!product) notFound()

  const variantRows = product.variants.map((variant) => ({
    id: variant.id,
    sizeLabel: variant.optionValues.map((ov) => ov.optionValue.value).join(' / ') || '—',
    stockQty: variant.stockQty,
    priceKes: variant.priceKes,
  }))

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Edit Product</h1>
      <div className="mt-6 flex max-w-3xl flex-col gap-8">
        <ProductForm
          categories={categories}
          initial={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            sku: product.sku,
            shortDescription: product.shortDescription,
            description: product.description,
            basePriceKes: product.basePriceKes,
            salePriceKes: product.salePriceKes,
            status: product.status,
            featured: product.featured,
            manageStock: product.manageStock,
            stockQty: product.stockQty,
            imageUrls: product.images.map((img) => img.url),
            categoryIds: product.categories.map((c) => c.categoryId),
          }}
        />
        <VariantStockEditor productId={product.id} variants={variantRows} />
      </div>
    </div>
  )
}
