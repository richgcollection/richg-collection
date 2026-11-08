'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { AssistantEvent } from '@/lib/assistant/engine'
import type { AssistantAction } from '@/lib/assistant/actions-schema'
import { confirmAssistantAction } from '@/lib/actions/admin-assistant'
import { RichText } from '@/components/admin/assistant/RichText'

type ProposalState = 'pending' | 'working' | 'done' | 'failed' | 'cancelled'
type Proposal = { id: string; summary: string; action: AssistantAction; state: ProposalState; error?: string }

type Turn = {
  id: string
  role: 'user' | 'assistant'
  /** What the model sees (user turns may carry dashboard notes). */
  content: string
  /** What the admin sees. */
  display: string
  tools: string[]
  proposals: Proposal[]
  error?: string
}

const TOOL_LABELS: Record<string, string> = {
  business_overview: 'Reading sales and KPIs',
  product_performance: 'Checking product performance',
  find_products: 'Searching products',
  stock_alerts: 'Checking low stock',
  list_orders: 'Looking at orders',
  get_order: 'Opening the order',
  find_customers: 'Searching customers',
  stock_movements: 'Reading the stock ledger',
  propose_restock: 'Preparing a restock',
  propose_stock_out: 'Preparing a stock-out',
  propose_order_status: 'Preparing a status change',
  propose_mark_paid: 'Preparing a payment',
}

const SUGGESTIONS = [
  'How did we do this month compared with last month?',
  'Which products should I reorder this week?',
  'What isn’t selling and is tying up cash?',
  'Who are our best customers in the last 90 days?',
  'Are there unpaid or stuck orders I should follow up?',
  'Record a manual sale',
]

const newId = () => Math.random().toString(36).slice(2)

export function AssistantChat({ ready, reason, canConfigure }: { ready: boolean; reason?: string; canConfigure: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const notes = useRef<string[]>([])
  const abort = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const patchTurn = (id: string, fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)))

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setInput('')

    // Outcomes of confirm/cancel clicks ride along with the next message so the model knows what happened.
    const pending = notes.current.splice(0)
    const content = pending.length ? `${pending.map((n) => `[Dashboard note: ${n}]`).join('\n')}\n\n${message}` : message
    const user: Turn = { id: newId(), role: 'user', content, display: message, tools: [], proposals: [] }
    const reply: Turn = { id: newId(), role: 'assistant', content: '', display: '', tools: [], proposals: [] }
    const history = [...turns, user]
      .filter((t) => t.content.trim())
      .map((t) => ({ role: t.role, content: t.content }))
    setTurns((ts) => [...ts, user, reply])
    setBusy(true)

    const controller = new AbortController()
    abort.current = controller
    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'The assistant is unavailable right now.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.trim()) handleEvent(reply.id, JSON.parse(line) as AssistantEvent)
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        patchTurn(reply.id, (t) => ({ ...t, error: err instanceof Error ? err.message : 'Something went wrong.' }))
      }
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  function handleEvent(replyId: string, event: AssistantEvent) {
    switch (event.type) {
      case 'text':
        patchTurn(replyId, (t) => ({ ...t, content: t.content + event.delta, display: t.display + event.delta }))
        break
      case 'tool':
        patchTurn(replyId, (t) => ({ ...t, tools: [...t.tools, event.name] }))
        break
      case 'proposal':
        patchTurn(replyId, (t) => ({
          ...t,
          // Keep the proposal in the model's view of this turn too.
          content: `${t.content}\n[Proposed for confirmation: ${event.summary}]`,
          proposals: [...t.proposals, { id: event.id, summary: event.summary, action: event.action, state: 'pending' }],
        }))
        break
      case 'error':
        patchTurn(replyId, (t) => ({ ...t, error: event.message }))
        break
    }
  }

  async function decide(turnId: string, proposal: Proposal, confirm: boolean) {
    const setState = (state: ProposalState, error?: string) =>
      patchTurn(turnId, (t) => ({
        ...t,
        proposals: t.proposals.map((p) => (p.id === proposal.id ? { ...p, state, error } : p)),
      }))

    if (!confirm) {
      setState('cancelled')
      notes.current.push(`the admin cancelled "${proposal.summary}". Nothing was recorded.`)
      return
    }
    setState('working')
    try {
      const result = await confirmAssistantAction(proposal.action)
      if (result.success) {
        setState('done')
        notes.current.push(`the admin confirmed "${proposal.summary}" and it was saved.`)
      } else {
        setState('failed', result.error)
        notes.current.push(`the admin confirmed "${proposal.summary}" but it failed: ${result.error}`)
      }
    } catch {
      setState('failed', 'Could not save. Try again.')
    }
  }

  if (!ready) {
    return (
      <div className="max-w-xl rounded-lg border border-black/10 p-6 text-sm dark:border-white/10">
        <p className="font-medium">The assistant isn&apos;t set up yet.</p>
        <p className="mt-1 opacity-70">{reason}</p>
        {canConfigure ? (
          <Link href="/admin/assistant/settings" className="mt-4 inline-block rounded-full bg-foreground px-5 py-2.5 font-medium text-background">
            Set it up
          </Link>
        ) : (
          <p className="mt-3 opacity-70">Ask the store owner to configure it.</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[28rem] flex-col rounded-lg border border-black/10 dark:border-white/10">
      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {turns.length === 0 && (
          <div className="mx-auto max-w-xl pt-6 text-center">
            <p className="text-lg font-semibold">Ask about your business</p>
            <p className="mt-1 text-sm opacity-60">
              Sales, profit, stock, customers and orders, from your live data. It can also prepare restocks, manual sales and
              order updates for you to confirm.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-black/10 px-3 py-1.5 text-xs hover:bg-surface dark:border-white/10"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) =>
          t.role === 'user' ? (
            <div key={t.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-foreground px-4 py-2.5 text-sm whitespace-pre-wrap text-background">
                {t.display}
              </div>
            </div>
          ) : (
            <div key={t.id} className="max-w-[92%] text-sm leading-relaxed">
              {t.tools.length > 0 && (
                <p className="mb-1 text-xs opacity-50">
                  {[...new Set(t.tools)].map((n) => TOOL_LABELS[n] ?? n).join(' · ')}
                </p>
              )}
              {t.display ? (
                <RichText text={t.display} />
              ) : (
                busy && !t.error && t.proposals.length === 0 && <p className="animate-pulse opacity-50">Thinking…</p>
              )}
              {t.proposals.map((p) => (
                <ProposalCard key={p.id} proposal={p} onDecide={(ok) => decide(t.id, p, ok)} />
              ))}
              {t.error && (
                <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-red-600 dark:text-red-400">{t.error}</p>
              )}
            </div>
          ),
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex items-end gap-2 border-t border-black/10 p-3 dark:border-white/10"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          rows={1}
          placeholder="Ask a question, or say e.g. “we sold 2 pairs of the black loafers size 42 for 3,500 each to John”"
          className="max-h-40 min-h-[2.5rem] flex-1 resize-y rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abort.current?.abort()}
            className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium dark:border-white/15"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-40"
          >
            Send
          </button>
        )}
      </form>
    </div>
  )
}

function ProposalCard({ proposal, onDecide }: { proposal: Proposal; onDecide: (confirm: boolean) => void }) {
  const { state } = proposal
  return (
    <div className="my-2 rounded-lg border border-black/15 p-3 dark:border-white/15">
      <p className="text-xs font-medium tracking-wide uppercase opacity-60">Needs your confirmation</p>
      <p className="mt-1 font-medium">{proposal.summary}</p>
      {state === 'pending' || state === 'working' ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onDecide(true)}
            disabled={state === 'working'}
            className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
          >
            {state === 'working' ? 'Saving…' : 'Confirm'}
          </button>
          <button
            onClick={() => onDecide(false)}
            disabled={state === 'working'}
            className="rounded-full border border-black/15 px-4 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-white/15"
          >
            Cancel
          </button>
        </div>
      ) : (
        <p
          className={`mt-2 text-xs ${
            state === 'done'
              ? 'text-emerald-600 dark:text-emerald-400'
              : state === 'failed'
                ? 'text-red-600 dark:text-red-400'
                : 'opacity-60'
          }`}
        >
          {state === 'done' ? 'Saved.' : state === 'failed' ? `Not saved: ${proposal.error}` : 'Cancelled.'}
        </p>
      )}
    </div>
  )
}
