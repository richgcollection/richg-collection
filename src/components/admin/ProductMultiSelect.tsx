'use client'

import { useEffect, useId, useRef, useState } from 'react'

export type MultiSelectOption = { id: string; name: string }

const inputClass = 'rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'

/** Searchable dropdown that lets an admin tick several products at once. Selection is controlled by the parent. */
export function ProductMultiSelect({
  options,
  selectedIds,
  onChange,
  placeholder = 'Search products…',
}: {
  options: MultiSelectOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const selected = new Set(selectedIds)
  const needle = query.trim().toLowerCase()
  const filtered = needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options
  const byId = new Map(options.map((o) => [o.id, o]))

  function toggle(id: string) {
    onChange(selected.has(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // Never let Enter submit the surrounding form from the search box.
      e.preventDefault()
      const option = filtered[activeIndex]
      if (open && option) toggle(option.id)
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && query === '' && selectedIds.length > 0) {
      onChange(selectedIds.slice(0, -1))
    }
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIndex(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={selectedIds.length > 0 ? `${selectedIds.length} selected — search to add more…` : placeholder}
        className={inputClass}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-black/10 bg-background py-1 text-sm shadow-lg dark:border-white/10"
        >
          {filtered.length === 0 && <li className="px-3 py-2 opacity-60">No products match “{query}”.</li>}
          {filtered.map((option, index) => {
            const isSelected = selected.has(option.id)
            return (
              <li
                key={option.id}
                role="option"
                aria-selected={isSelected}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => toggle(option.id)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${
                  index === activeIndex ? 'bg-black/5 dark:bg-white/10' : ''
                }`}
              >
                <input type="checkbox" checked={isSelected} readOnly tabIndex={-1} className="pointer-events-none" />
                <span className="truncate">{option.name}</span>
              </li>
            )
          })}
        </ul>
      )}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2.5 py-0.5 text-xs dark:border-white/10"
            >
              {byId.get(id)?.name ?? 'Unknown product'}
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`Remove ${byId.get(id)?.name ?? 'product'}`}
                className="opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onChange([])} className="text-xs opacity-60 hover:opacity-100">
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
