import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const SHIPPING_RATES: Array<{ county: string; rateKes: number }> = [
  { county: 'DEFAULT', rateKes: 500 },
  { county: 'Nairobi', rateKes: 250 },
  { county: 'Kiambu', rateKes: 300 },
  { county: 'Mombasa', rateKes: 450 },
  { county: 'Kisumu', rateKes: 450 },
  { county: 'Nakuru', rateKes: 400 },
]

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    console.warn('SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — skipping admin user seed.')
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Rich G Admin',
      role: 'ADMIN',
    },
  })

  console.log(`Seeded admin user: ${email}`)
}

async function seedShippingRates() {
  for (const rate of SHIPPING_RATES) {
    await prisma.shippingRate.upsert({
      where: { county: rate.county },
      update: { rateKes: rate.rateKes },
      create: rate,
    })
  }
  console.log(`Seeded ${SHIPPING_RATES.length} shipping rates.`)
}

async function seedCatalog() {
  const men = await prisma.category.upsert({
    where: { slug: 'men' },
    update: {},
    create: { name: 'Men', slug: 'men' },
  })

  const categorySlugs: Array<{ name: string; slug: string }> = [
    { name: 'Official Shirts', slug: 'official-shirts' },
    { name: 'Casual Shirts', slug: 'casual-shirts' },
    { name: 'Collarless Shirts', slug: 'collarless-shirts' },
    { name: 'Short Sleeve T-Shirts', slug: 'short-sleeve-t-shirts' },
  ]

  const categories: Record<string, { id: string }> = {}
  for (const c of categorySlugs) {
    categories[c.slug] = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { name: c.name, slug: c.slug, parentId: men.id },
    })
  }

  const sampleProducts = [
    {
      sku: 'RGC-SHIRT-BLUE-OFFICIAL',
      name: 'Blue Official Shirt',
      slug: 'blue-official-shirt',
      description: 'A crisp, tailored blue official shirt for the modern classic man.',
      basePriceKes: 5000,
      categorySlug: 'official-shirts',
      featured: true,
    },
    {
      sku: 'RGC-SHIRT-WHITE-CASUAL',
      name: 'White Casual Shirt',
      slug: 'white-casual-shirt',
      description: 'A breathable, comfortable white casual shirt for everyday wear.',
      basePriceKes: 4300,
      categorySlug: 'casual-shirts',
      featured: true,
    },
    {
      sku: 'RGC-SHIRT-COLLARLESS-01',
      name: 'Charcoal Collarless Shirt',
      slug: 'charcoal-collarless-shirt',
      description: 'A modern collarless shirt in charcoal, built for durability and comfort.',
      basePriceKes: 4600,
      categorySlug: 'collarless-shirts',
      featured: false,
    },
    {
      sku: 'RGC-TSHIRT-BLACK-01',
      name: 'Black Short Sleeve T-Shirt',
      slug: 'black-short-sleeve-tshirt',
      description: 'An everyday black short sleeve t-shirt, sustainable and affordable.',
      basePriceKes: 2000,
      categorySlug: 'short-sleeve-t-shirts',
      featured: true,
    },
  ]

  const sizes = ['S', 'M', 'L', 'XL']

  for (const p of sampleProducts) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        slug: p.slug,
        description: p.description,
        basePriceKes: p.basePriceKes,
        featured: p.featured,
        stockQty: 0,
        categories: {
          create: { categoryId: categories[p.categorySlug].id },
        },
      },
    })

    const existingOption = await prisma.productOption.findFirst({
      where: { productId: product.id, name: 'Size' },
    })

    const sizeOption =
      existingOption ??
      (await prisma.productOption.create({
        data: { productId: product.id, name: 'Size' },
      }))

    for (const size of sizes) {
      const optionValue =
        (await prisma.productOptionValue.findFirst({
          where: { optionId: sizeOption.id, value: size },
        })) ??
        (await prisma.productOptionValue.create({
          data: { optionId: sizeOption.id, value: size },
        }))

      const variantSku = `${p.sku}-${size}`
      const existingVariant = await prisma.productVariant.findUnique({
        where: { sku: variantSku },
      })

      if (!existingVariant) {
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: variantSku,
            stockQty: 10,
            optionValues: {
              create: { optionValueId: optionValue.id },
            },
          },
        })
      }
    }
  }

  console.log(`Seeded ${sampleProducts.length} sample products with size variants.`)
}

async function main() {
  await seedAdmin()
  await seedShippingRates()
  await seedCatalog()
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
