'use client'

import { useState } from 'react'

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-full border border-black/10 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

/** A link shown in full (wrapping, never clipped) with a copy button. */
export function ReferralLink({ url }: { url: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <code className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1 font-mono text-xs [overflow-wrap:anywhere]">
        {url}
      </code>
      <CopyButton value={url} />
    </div>
  )
}
