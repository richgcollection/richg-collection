import { prisma } from '@/lib/prisma'

// Product catalog feed for Meta Commerce Manager (scheduled data feed).
// `id` must stay the Product.id — the Meta Pixel sends that as content_ids,
// and Meta matches pixel events to catalog items by it.
export const dynamic = 'force-dynamic'

const BRAND = 'Rich G Collection'

const COLUMNS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'sale_price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'product_type',
] as const

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function toPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
  const absolute = (url: string) => (url.startsWith('http') ? url : new URL(url, origin).toString())

  const products = await prisma.product.findMany({
    where: { status: 'published' },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      shortDescription: true,
      basePriceKes: true,
      salePriceKes: true,
      stockQty: true,
      manageStock: true,
      images: { orderBy: { position: 'asc' }, select: { url: true } },
      variants: { select: { stockQty: true } },
      categories: { select: { category: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const rows = products
    // Meta rejects items without an image, so leave them out rather than fail the feed.
    .filter((product) => product.images.length > 0)
    .map((product) => {
      const inStock = product.manageStock
        ? product.variants.length > 0
          ? product.variants.some((v) => v.stockQty > 0)
          : product.stockQty > 0
        : true
      const description =
        toPlainText(product.description ?? '') || toPlainText(product.shortDescription ?? '') || product.name
      const [mainImage, ...otherImages] = product.images.map((image) => absolute(image.url))
      const onSale = product.salePriceKes !== null && product.salePriceKes < product.basePriceKes

      const row: Record<(typeof COLUMNS)[number], string> = {
        id: product.id,
        title: product.name.slice(0, 200),
        description: description.slice(0, 9999),
        availability: inStock ? 'in stock' : 'out of stock',
        condition: 'new',
        price: `${product.basePriceKes} KES`,
        sale_price: onSale ? `${product.salePriceKes} KES` : '',
        link: `${origin}/product/${product.slug}`,
        image_link: mainImage,
        additional_image_link: otherImages.slice(0, 10).join(','),
        brand: BRAND,
        product_type: product.categories[0]?.category.name ?? '',
      }
      return COLUMNS.map((column) => csvCell(row[column])).join(',')
    })

  const csv = [COLUMNS.join(','), ...rows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'inline; filename="meta-catalog.csv"',
    },
  })
}
