'use client'

import { useId, useState } from 'react'

export function PasswordInput({
  id,
  name,
  autoComplete,
  required,
  className,
}: {
  id?: string
  name: string
  autoComplete?: string
  required?: boolean
  className?: string
}) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="relative">
      <input
        id={inputId}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        className={className ?? 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 pr-10 text-sm dark:border-white/10'}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={-1}
        className="absolute top-1/2 right-2 -translate-y-1/2 opacity-60 hover:opacity-100"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
            <path d="M3 3l18 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}
