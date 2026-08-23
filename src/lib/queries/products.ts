import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type ProductListItem = {
  id: string
  slug: string
  name: string
  priceKes: number
  compareAtPriceKes: number | null
  imageUrl: string | null
  inStock: boolean
}

export type ProductSort = 'newest' | 'price-asc' | 'price-desc'

export type ProductListParams = {
  categorySlug?: string
  size?: string
  sort?: ProductSort
  minPrice?: number
  maxPrice?: number
}

function toListItem(product: {
  id: string
  slug: string
  name: string
  basePriceKes: number
  salePriceKes: number | null
  stockQty: number
  manageStock: boolean
  images: { url: string }[]
  variants: { stockQty: number }[]
}): ProductListItem {
  const inStock = product.manageStock
    ? product.variants.length > 0
      ? product.variants.some((v) => v.stockQty > 0)
      : product.stockQty > 0
    : true

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    priceKes: product.salePriceKes ?? product.basePriceKes,
    compareAtPriceKes: product.salePriceKes ? product.basePriceKes : null,
    imageUrl: product.images[0]?.url ?? null,
    inStock,
  }
}

const LIST_SELECT = {
  id: true,
  slug: true,
  name: true,
  basePriceKes: true,
  salePriceKes: true,
  stockQty: true,
  manageStock: true,
  images: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
  variants: { select: { stockQty: true } },
} satisfies Prisma.ProductSelect

export async function getFeaturedProducts(limit = 4): Promise<ProductListItem[]> {
  const products = await prisma.product.findMany({
    where: { status: 'published', featured: true },
    select: LIST_SELECT,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return products.map(toListItem)
}

export async function getProducts(params: ProductListParams = {}): Promise<ProductListItem[]> {
  const where: Prisma.ProductWhereInput = { status: 'published' }

  if (params.categorySlug) {
    where.categories = { some: { category: { slug: params.categorySlug } } }
  }

  if (params.size) {
    where.variants = {
      some: {
        optionValues: { some: { optionValue: { value: params.size } } },
      },
    }
  }

  if (params.minPrice != null || params.maxPrice != null) {
    where.basePriceKes = {
      ...(params.minPrice != null ? { gte: params.minPrice } : {}),
      ...(params.maxPrice != null ? { lte: params.maxPrice } : {}),
    }
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params.sort === 'price-asc'
      ? { basePriceKes: 'asc' }
      : params.sort === 'price-desc'
        ? { basePriceKes: 'desc' }
        : { createdAt: 'desc' }

  const products = await prisma.product.findMany({
    where,
    select: LIST_SELECT,
    orderBy,
  })

  return products.map(toListItem)
}

export async function getCategories() {
  return prisma.category.findMany({
    where: { parentId: { not: null } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  })
}

export type ProductDetail = Awaited<ReturnType<typeof getProductBySlug>>

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findUnique({
    where: { slug, status: 'published' },
    include: {
      images: { orderBy: { position: 'asc' } },
      categories: { include: { category: true } },
      options: {
        include: { values: true },
      },
      variants: {
        include: {
          optionValues: { include: { optionValue: true } },
        },
      },
    },
  })

  if (!product) return null

  const variants = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    priceKes: variant.priceKes ?? product.salePriceKes ?? product.basePriceKes,
    stockQty: variant.stockQty,
    optionValueIds: variant.optionValues.map((ov) => ov.optionValueId),
  }))

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    basePriceKes: product.basePriceKes,
    salePriceKes: product.salePriceKes,
    stockQty: product.stockQty,
    manageStock: product.manageStock,
    images: product.images.map((img) => ({ url: img.url, altText: img.altText })),
    categories: product.categories.map((pc) => pc.category),
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values.map((v) => ({ id: v.id, value: v.value })),
    })),
    variants,
  }
}
