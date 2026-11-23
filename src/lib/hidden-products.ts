import type { Prisma } from '@prisma/client'

/**
 * Products hidden from everything customers see: the storefront (home page,
 * shop, collections, product pages), the Meta catalogue feed and the WhatsApp
 * bot. They stay visible and editable in the admin dashboard.
 *
 * Matching is by product name (case-insensitive). To unhide a group, remove
 * its entry here.
 */
const nameHas = (text: string): Prisma.ProductWhereInput => ({ name: { contains: text, mode: 'insensitive' } })
const anyOf = (...texts: string[]): Prisma.ProductWhereInput => ({ OR: texts.map(nameHas) })
const isTShirt = anyOf('t-shirt', 'tshirt', 't shirt')

const HIDDEN_PRODUCTS: Prisma.ProductWhereInput[] = [
  // All Official Shirts
  nameHas('official'),
  // All Short Sleeved Shirts (not short-sleeve T-shirts)
  { AND: [anyOf('short sleeve', 'short-sleeve'), { NOT: isTShirt }] },
  // All Long Sleeve T-Shirts: by name (any spelling) or by category
  { AND: [anyOf('long sleeve', 'long-sleeve', 'longsleeve'), isTShirt] },
  { categories: { some: { category: { slug: { contains: 'long-sleeve', mode: 'insensitive' } } } } },
]

/** Add to any customer-facing product query: `where: { AND: [VISIBLE_PRODUCT, ...] }`. */
export const VISIBLE_PRODUCT: Prisma.ProductWhereInput = { NOT: { OR: HIDDEN_PRODUCTS } }
