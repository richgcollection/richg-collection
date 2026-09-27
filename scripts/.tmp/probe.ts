import 'dotenv/config'
import { prisma } from '../../src/lib/prisma'
async function main() {
  console.log({
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    orders: await prisma.order.count(),
    movements: await prisma.stockMovement.groupBy({ by: ['reason'], _count: true, _sum: { quantity: true } }),
    range: await prisma.stockMovement.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } }),
    customers: await prisma.customer.count(),
    categories: await prisma.category.findMany({ select: { name: true } }),
    carts: await prisma.cart.count(),
  })
  const sample = await prisma.stockMovement.findMany({ take: 3, orderBy: { createdAt: 'desc' } })
  console.log(sample)
}
main().finally(() => prisma.$disconnect())
