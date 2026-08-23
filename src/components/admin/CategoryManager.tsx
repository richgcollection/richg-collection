'use client'

import { useActionState, useState, useTransition } from 'react'
import { createCategoryAction, deleteCategoryAction } from '@/lib/actions/admin-categories'

type Category = { id: string; name: string; slug: string }

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [state, formAction, isPending] = useActionState(createCategoryAction, undefined)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleDelete(id: string) {
    setDeleteError(null)
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteCategoryAction(id)
      if (!result.success) setDeleteError(result.error)
      setDeletingId(null)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex items-end gap-3">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium tracking-wide uppercase opacity-70">
            New Category
          </label>
          <input
            id="name"
            name="name"
            required
            className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add'}
        </button>
      </form>
      {state?.success === false && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left opacity-60 dark:border-white/10">
            <th className="py-2">Name</th>
            <th className="py-2">Slug</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id} className="border-b border-black/5 dark:border-white/5">
              <td className="py-2">{category.name}</td>
              <td className="py-2 opacity-60">{category.slug}</td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  disabled={deletingId === category.id}
                  onClick={() => handleDelete(category.id)}
                  className="text-xs opacity-60 hover:opacity-100 disabled:opacity-30"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
