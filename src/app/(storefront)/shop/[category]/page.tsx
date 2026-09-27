import { notFound } from 'next/navigation'
import { ProductGrid } from '@/components/storefront/ProductGrid'
import { ShopFilters } from '@/components/storefront/ShopFilters'
import { prisma } from '@/lib/prisma'
import {
  getCategories,
  getProducts,
  getSubcategories,
  type ProductListItem,
  type ProductSort,
} from '@/lib/queries/products'

const VALID_SORTS: ProductSort[] = ['newest', 'price-asc', 'price-desc']

export default async function ShopCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>
  searchParams: Promise<{ size?: string; sort?: string }>
}) {
  const { category: categorySlug } = await params
  const query = await searchParams

  const category = await prisma.category.findUnique({ where: { slug: categorySlug } })
  if (!category) notFound()

  const sort = VALID_SORTS.includes(query.sort as ProductSort) ? (query.sort as ProductSort) : undefined

  const [products, categories, subcategories] = await Promise.all([
    getProducts({ categorySlug, size: query.size, sort }),
    getCategories(),
    getSubcategories(category.id),
  ])

  // On a parent category (e.g. T-Shirts), show one section per subcategory so
  // each type starts on its own row; anything untagged goes last.
  const sections = subcategories.length > 0 ? groupBySubcategory(products, subcategories) : null

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{category.name}</h1>
      <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-[200px_1fr]">
        <ShopFilters
          categories={categories}
          activeCategorySlug={categorySlug}
          activeSize={query.size}
          activeSort={query.sort}
          basePath={`/shop/${categorySlug}`}
        />
        {sections ? (
          <div className="flex flex-col gap-12">
            {sections.map((section) => (
              <section key={section.slug}>
                {section.name && <h2 className="mb-4 text-lg font-medium tracking-tight">{section.name}</h2>}
                <ProductGrid products={section.products} />
              </section>
            ))}
            {sections.length === 0 && <ProductGrid products={[]} />}
          </div>
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </div>
  )
}

function groupBySubcategory(
  products: ProductListItem[],
  subcategories: { name: string; slug: string }[],
): { slug: string; name: string | null; products: ProductListItem[] }[] {
  const placed = new Set<string>()
  const sections: { slug: string; name: string | null; products: ProductListItem[] }[] = []

  for (const sub of subcategories) {
    const items = products.filter((p) => !placed.has(p.id) && p.categorySlugs.includes(sub.slug))
    items.forEach((p) => placed.add(p.id))
    if (items.length > 0) sections.push({ slug: sub.slug, name: sub.name, products: items })
  }

  const rest = products.filter((p) => !placed.has(p.id))
  if (rest.length > 0) sections.push({ slug: '__other', name: sections.length > 0 ? 'More' : null, products: rest })

  return sections
}
