'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/dal'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/slug'
import type { ActionResult } from '@/lib/actions/cart'

const categorySchema = z.object({
  name: z.string().min(2, 'Category name is required.'),
})

export async function createCategoryAction(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin()

  const parsed = categorySchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const slug = slugify(parsed.data.name)
  const existing = await prisma.category.findUnique({ where: { slug } })
  if (existing) {
    return { success: false, error: 'A category with that name already exists.' }
  }

  await prisma.category.create({ data: { name: parsed.data.name, slug } })
  revalidatePath('/admin/categories')
  return { success: true }
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult> {
  await requireAdmin()

  const productCount = await prisma.productCategory.count({ where: { categoryId } })
  if (productCount > 0) {
    return {
      success: false,
      error: `Cannot delete: ${productCount} product(s) still use this category.`,
    }
  }

  await prisma.category.delete({ where: { id: categoryId } })
  revalidatePath('/admin/categories')
  return { success: true }
}
