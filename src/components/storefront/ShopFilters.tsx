import Link from 'next/link'

type Category = { name: string; slug: string }

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
]

const SIZES = ['S', 'M', 'L', 'XL']

export function ShopFilters({
  categories,
  activeCategorySlug,
  activeSize,
  activeSort,
  basePath,
}: {
  categories: Category[]
  activeCategorySlug?: string
  activeSize?: string
  activeSort?: string
  basePath: string
}) {
  function withParams(overrides: Partial<{ size: string | undefined; sort: string | undefined }>, path = basePath) {
    const next = {
      size: 'size' in overrides ? overrides.size : activeSize,
      sort: 'sort' in overrides ? overrides.sort : activeSort,
    }
    const params = new URLSearchParams()
    if (next.size) params.set('size', next.size)
    if (next.sort) params.set('sort', next.sort)
    const query = params.toString()
    return query ? `${path}?${query}` : path
  }

  return (
    <div className="flex flex-col gap-6 text-sm">
      <div>
        <p className="mb-2 font-medium tracking-wide uppercase opacity-70">Category</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={withParams({}, '/shop')}
            className={`rounded-full border px-3 py-1 ${
              !activeCategorySlug ? 'border-foreground' : 'border-black/10 dark:border-white/10'
            }`}
          >
            All
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={withParams({}, `/shop/${category.slug}`)}
              className={`rounded-full border px-3 py-1 ${
                activeCategorySlug === category.slug
                  ? 'border-foreground'
                  : 'border-black/10 dark:border-white/10'
              }`}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-medium tracking-wide uppercase opacity-70">Size</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={withParams({ size: undefined })}
            className={`rounded-full border px-3 py-1 ${
              !activeSize ? 'border-foreground' : 'border-black/10 dark:border-white/10'
            }`}
          >
            All
          </Link>
          {SIZES.map((size) => (
            <Link
              key={size}
              href={withParams({ size })}
              className={`rounded-full border px-3 py-1 ${
                activeSize === size ? 'border-foreground' : 'border-black/10 dark:border-white/10'
              }`}
            >
              {size}
            </Link>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-medium tracking-wide uppercase opacity-70">Sort</p>
        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={withParams({ sort: option.value })}
              className={`rounded-full border px-3 py-1 ${
                activeSort === option.value ? 'border-foreground' : 'border-black/10 dark:border-white/10'
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
