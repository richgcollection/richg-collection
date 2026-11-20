/**
 * Adds "Navy Blue Round Neck T-Shirt" as a DRAFT product, copied from an
 * existing Round Neck T-Shirt (supplier, categories, sizes,
 * weight, description). Price KES 2,500 with no sale price. Stock starts at 0; no images. Add photos, check the
 * details, then publish it from the admin.
 *
 * Usage (DATABASE_URL must point at the live database):
 *   npx tsx scripts/add-navy-round-neck.ts           # preview
 *   npx tsx scripts/add-navy-round-neck.ts --apply   # create it
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

const NAME = 'Navy Blue Round Neck T-Shirt'
const SLUG = 'navy-blue-round-neck-t-shirt'
const SKU = 'RGC-TSHIRT-NAVY-01'
const TYPE = 'Round Neck T-Shirt'
const apply = process.argv.includes('--apply')

async function main() {
  const existing = await prisma.product.findFirst({
    where: { OR: [{ name: { equals: NAME, mode: 'insensitive' } }, { slug: SLUG }] },
  })
  if (existing) {
    console.log(`Already exists: "${existing.name}" (${existing.slug}, ${existing.status}). Nothing to do.`)
    return
  }

  const template = await prisma.product.findFirst({
    where: { name: { endsWith: TYPE, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    include: {
      categories: true,
      options: { include: { values: true } },
      variants: { include: { optionValues: { include: { optionValue: { include: { option: true } } } } } },
    },
  })
  if (!template) throw new Error(`No existing "${TYPE}" product to copy from; add it in the admin instead.`)

  const sizeOf = (v: (typeof template.variants)[number]) =>
    v.optionValues.find((o) => o.optionValue.option.name === 'Size')?.optionValue.value
  const sizes = template.variants.map(sizeOf).filter((s): s is string => !!s)
  const colour = template.name.slice(0, -TYPE.length).trim()
  const swap = (s: string | null) => (s && colour ? s.split(colour).join('Navy Blue') : s)

  console.log(`Copying from: ${template.name} (${template.slug})`)
  console.log(`New product:  ${NAME} (${SLUG}), draft, stock 0`)
  console.log(`Price:        KES 2500, no sale price (cost 717)`)
  console.log(`Sizes:        ${sizes.join(', ') || '(none)'}`)
  console.log(`Categories:   ${template.categories.length}`)
  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to create it.')
    return
  }

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        sku: SKU,
        name: NAME,
        slug: SLUG,
        description: swap(template.description),
        shortDescription: swap(template.shortDescription),
        status: 'draft',
        basePriceKes: 2500, // selling price in the stock tracker
        salePriceKes: null, // no sale price: 0 here would make it free
        costPriceKes: 717, // cost per unit in the stock tracker
        supplier: template.supplier,
        lowStockThreshold: template.lowStockThreshold,
        manageStock: template.manageStock,
        weightGrams: template.weightGrams,
        stockQty: 0,
        categories: { create: template.categories.map((c) => ({ categoryId: c.categoryId })) },
      },
    })
    if (!sizes.length) return

    const option = await tx.productOption.create({ data: { productId: product.id, name: 'Size' } })
    for (const v of template.variants) {
      const size = sizeOf(v)
      if (!size) continue
      const value = await tx.productOptionValue.create({ data: { optionId: option.id, value: size } })
      await tx.productVariant.create({
        data: {
          productId: product.id,
          sku: `${SKU}-${size.toUpperCase().replace(/\s+/g, '')}`,
          priceKes: null, // use the product price
          salePriceKes: null,
          stockQty: 0,
          optionValues: { create: { optionValueId: value.id } },
        },
      })
    }
  })
  console.log(`\nCreated "${NAME}" as a draft. Add photos and stock in the admin, then publish.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
