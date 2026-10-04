import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { compareSizes, isSizeOption } from '@/lib/sizes'

export type ProductListItem = {
  id: string
  slug: string
  name: string
  priceKes: number
  compareAtPriceKes: number | null
  imageUrl: string | null
  inStock: boolean
  categorySlugs: string[]
}

export type ProductSort = 'newest' | 'price-asc' | 'price-desc'

export type ProductListParams = {
  categorySlug?: string
  size?: string
  sort?: ProductSort
  minPrice?: number
  maxPrice?: number
  limit?: number
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
  categories: { category: { slug: string } }[]
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
    categorySlugs: product.categories.map((pc) => pc.category.slug),
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
  categories: { select: { category: { select: { slug: true } } } },
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

/**
 * Home-page "New Arrivals" pins, in display order: black and white shirts
 * first, then black and white T-shirts. Everything else follows, newest first.
 */
const NEW_ARRIVAL_PINS: Array<(name: string) => boolean> = [
  (name) => /\b(black|white)\b/i.test(name) && /\bshirt\b/i.test(name) && !/\bt-?shirt\b/i.test(name),
  (name) => /\b(black|white)\b/i.test(name) && /\bt-?shirt\b/i.test(name),
]

function newArrivalRank(name: string): number {
  const index = NEW_ARRIVAL_PINS.findIndex((matches) => matches(name))
  return index === -1 ? NEW_ARRIVAL_PINS.length : index
}

export async function getNewArrivals(limit: number): Promise<ProductListItem[]> {
  const products = await getProducts({ sort: 'newest' })
  // Array.prototype.sort is stable, so each group keeps its newest-first order.
  return products.sort((a, b) => newArrivalRank(a.name) - newArrivalRank(b.name)).slice(0, limit)
}

export async function getProducts(params: ProductListParams = {}): Promise<ProductListItem[]> {
  const where: Prisma.ProductWhereInput = { status: 'published' }

  if (params.categorySlug) {
    where.categories = {
      some: { category: { OR: [{ slug: params.categorySlug }, { parent: { slug: params.categorySlug } }] } },
    }
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
    take: params.limit,
  })

  return products.map(toListItem)
}

/**
 * Display order for subcategory sections on a parent category page (top to
 * bottom). Subcategories not listed here follow, alphabetically.
 */
const SUBCATEGORY_DISPLAY_ORDER = ['round-neck-tshirts', 'oversized-tshirts', 'long-sleeve-tshirts']

function subcategoryRank(slug: string): number {
  const index = SUBCATEGORY_DISPLAY_ORDER.indexOf(slug)
  return index === -1 ? SUBCATEGORY_DISPLAY_ORDER.length : index
}

export async function getSubcategories(parentId: string) {
  const children = await prisma.category.findMany({
    where: { parentId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  })
  return children.sort((a, b) => subcategoryRank(a.slug) - subcategoryRank(b.slug))
}

export async function getCategories() {
  return prisma.category.findMany({
    where: { parentId: { not: null } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  })
}

export type CategoryListItem = {
  id: string
  name: string
  slug: string
  productCount: number
  imageUrl: string | null
}

export async function getCollectionCategories(): Promise<CategoryListItem[]> {
  const topLevel = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  })

  return Promise.all(
    topLevel.map(async (category) => {
      const where: Prisma.ProductWhereInput = {
        status: 'published',
        categories: { some: { category: { OR: [{ id: category.id }, { parentId: category.id }] } } },
      }

      const [productCount, product] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findFirst({
          where,
          orderBy: { createdAt: 'desc' },
          select: { images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } },
        }),
      ])

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        productCount,
        imageUrl: product?.images[0]?.url ?? null,
      }
    }),
  )
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
      values: option.values
        .map((v) => ({ id: v.id, value: v.value }))
        .sort((a, b) => (isSizeOption(option.name) ? compareSizes(a.value, b.value) : 0)),
    })),
    variants,
  }
}
