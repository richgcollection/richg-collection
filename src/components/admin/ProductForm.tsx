'use client'

import { useState } from 'react'
import { ImageUploader } from '@/components/admin/ImageUploader'
import { createProductAction, updateProductAction } from '@/lib/actions/admin-products'
import { slugify } from '@/lib/slug'

type Category = { id: string; name: string }

export type ProductFormInitial = {
  id?: string
  name: string
  slug: string
  sku: string | null
  shortDescription: string | null
  description: string | null
  basePriceKes: number
  salePriceKes: number | null
  status: string
  featured: boolean
  manageStock: boolean
  stockQty: number
  imageUrls: string[]
  categoryIds: string[]
}

const EMPTY: ProductFormInitial = {
  name: '',
  slug: '',
  sku: null,
  shortDescription: null,
  description: null,
  basePriceKes: 0,
  salePriceKes: null,
  status: 'published',
  featured: false,
  manageStock: true,
  stockQty: 0,
  imageUrls: [],
  categoryIds: [],
}

export function ProductForm({
  categories,
  initial = EMPTY,
}: {
  categories: Category[]
  initial?: ProductFormInitial
}) {
  const isEditing = Boolean(initial.id)
  const [name, setName] = useState(initial.name)
  const [slug, setSlug] = useState(initial.slug)
  const [slugTouched, setSlugTouched] = useState(isEditing)
  const [imageUrls, setImageUrls] = useState<string[]>(initial.imageUrls)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  async function handleSubmit(formData: FormData) {
    setError(null)
    setIsSubmitting(true)
    const result = isEditing
      ? await updateProductAction(initial.id!, formData)
      : await createProductAction(formData)
    setIsSubmitting(false)
    if (result && !result.success) setError(result.error)
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">Name</label>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">Slug</label>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">SKU</label>
          <input
            name="sku"
            defaultValue={initial.sku ?? ''}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            Price (KES)
          </label>
          <input
            name="basePriceKes"
            type="number"
            min={0}
            required
            defaultValue={initial.basePriceKes}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            Sale Price (KES, optional)
          </label>
          <input
            name="salePriceKes"
            type="number"
            min={0}
            defaultValue={initial.salePriceKes ?? ''}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
          Short Description
        </label>
        <input
          name="shortDescription"
          defaultValue={initial.shortDescription ?? ''}
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">Description</label>
        <textarea
          name="description"
          rows={4}
          defaultValue={initial.description ?? ''}
          className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium tracking-wide uppercase opacity-70">Images</label>
        <ImageUploader urls={imageUrls} onChange={setImageUrls} />
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium tracking-wide uppercase opacity-70">Categories</label>
        <div className="flex flex-wrap gap-3">
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="categoryIds"
                value={category.id}
                defaultChecked={initial.categoryIds.includes(category.id)}
              />
              {category.name}
            </label>
          ))}
        </div>
      </div>

      {!isEditing && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
              Sizes (comma separated, optional)
            </label>
            <input
              name="sizes"
              placeholder="S, M, L, XL"
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
              Stock per Size
            </label>
            <input
              name="defaultStockPerSize"
              type="number"
              min={0}
              defaultValue={0}
              className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
          Stock Qty (only used if this product has no size variants)
        </label>
        <input
          name="stockQty"
          type="number"
          min={0}
          defaultValue={initial.stockQty}
          className="w-40 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="manageStock" defaultChecked={initial.manageStock} />
          Track stock
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="featured" defaultChecked={initial.featured} />
          Featured on homepage
        </label>
        <div className="flex items-center gap-2 text-sm">
          <label>Status</label>
          <select
            name="status"
            defaultValue={initial.status}
            className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/10"
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background disabled:opacity-50"
      >
        {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Product'}
      </button>
    </form>
  )
}
