import 'server-only'
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PROVIDERS } from '@/lib/assistant/providers'
import type { AssistantConfig } from '@/lib/assistant/settings'
import { runTool, toolJsonSchema, toolsFor, type ToolContext } from '@/lib/assistant/tools'
import type { AssistantAction } from '@/lib/assistant/actions-schema'
import { todayInStoreTz } from '@/lib/dates'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** Streamed to the browser as NDJSON, one event per line. */
export type AssistantEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string }
  | { type: 'proposal'; id: string; summary: string; action: AssistantAction }
  | { type: 'error'; message: string }
  | { type: 'done' }

type Emit = (event: AssistantEvent) => void

/** Tool-call rounds per admin message before we stop the loop. */
const MAX_STEPS = 10

/** Claude models that accept the server-side refusal fallback ("default" routing). */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

const STABLE_INSTRUCTIONS = `You are the business assistant inside the admin dashboard of Rich G Collection, a Kenyan online store. You help the owner and staff understand how the business is doing and record day-to-day changes.

How the data works:
- Money is in Kenyan shillings (KES). Dates are Kenya time (EAT, UTC+3).
- Sales figures come from the stock ledger: every paid website/WhatsApp order writes an ONLINE_SALE movement, and sales made in person or by phone are recorded as MANUAL_SALE. Giveaways (REWARD, INFLUENCER), DAMAGE and ADJUSTMENT also take stock out but are not revenue.
- Profit = revenue minus the unit cost recorded on each sale. Products without a cost price make profit look higher than it is; say so when it matters.
- Orders are the website/WhatsApp checkout records; the ledger is the complete record of what sold.

How to answer:
- Always use the tools to get numbers. Never guess or invent figures, products, customers or orders. If a tool returns nothing, say so.
- Lead with the answer, then the few numbers that support it, then a concrete suggestion when one is useful (what to reorder, what to discount, who to follow up with). Compare against the previous period when the data has it.
- Be brief. Use short paragraphs, "-" bullet lists, **bold** for key figures, and a small Markdown table only when comparing several items. Format money like "KES 12,500".
- Ask a short clarifying question when a request is ambiguous (which product, which size, which period).

Recording changes (only when action tools are available):
- The propose_* tools do not change anything. They put a confirmation card in front of the admin, who clicks Confirm or Cancel.
- Before proposing, look up the exact product/variant with find_products (or the order with get_order) and make sure quantity, price, size and date are what the admin said. If something is missing, ask instead of guessing.
- After proposing, tell the admin to review the card. Never say the change has been made: you only learn the outcome from a later "[Dashboard note: ...]" in the conversation.`

function systemPrompt(config: AssistantConfig, adminName: string): { stable: string; dynamic: string } {
  const lines = [
    `Today is ${todayInStoreTz()} (Kenya time). You are talking to ${adminName}.`,
    config.allowActions
      ? 'Action tools are enabled.'
      : 'Action tools are disabled by the store owner: you can only read data. If asked to record something, explain that it must be done in the dashboard (or that an admin can enable assistant actions in AI Assistant settings).',
  ]
  if (config.customInstructions?.trim()) {
    lines.push(`Notes from the store owner about the business:\n${config.customInstructions.trim()}`)
  }
  return { stable: STABLE_INSTRUCTIONS, dynamic: lines.join('\n\n') }
}

export async function runAssistant(opts: {
  config: AssistantConfig
  adminName: string
  history: ChatTurn[]
  emit: Emit
  signal: AbortSignal
}) {
  const tools = toolsFor(opts.config.allowActions)
  const ctx: ToolContext = {
    propose: ({ summary, ...action }) => opts.emit({ type: 'proposal', id: randomUUID(), summary, action }),
  }
  const prompt = systemPrompt(opts.config, opts.adminName)
  const call = async (name: string, input: unknown) => {
    opts.emit({ type: 'tool', name })
    return runTool(tools, name, input, ctx)
  }

  if (PROVIDERS[opts.config.provider].kind === 'anthropic') {
    await runAnthropic({ ...opts, tools, prompt, call })
  } else {
    await runOpenAICompatible({ ...opts, tools, prompt, call })
  }
}

type LoopOpts = {
  config: AssistantConfig
  history: ChatTurn[]
  emit: Emit
  signal: AbortSignal
  tools: ReturnType<typeof toolsFor>
  prompt: { stable: string; dynamic: string }
  call: (name: string, input: unknown) => Promise<{ ok: boolean; result: string }>
}

// ---------------------------------------------------------------- Claude

async function runAnthropic({ config, history, emit, signal, tools, prompt, call }: LoopOpts) {
  const client = new Anthropic({ apiKey: config.apiKey })
  const toolDefs: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: toolJsonSchema(t) as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  }))
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }))
  // On a safety decline, Claude re-runs the request on a suitable fallback model instead of stopping.
  const fallback = FALLBACK_MODELS.has(config.model)
    ? { betas: ['server-side-fallback-2026-07-01'] as Anthropic.Beta.AnthropicBeta[], fallbacks: 'default' as const }
    : {}

  let jsonRetries = 0
  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = client.beta.messages.stream(
      {
        model: config.model,
        max_tokens: 32000,
        // Tools + the stable instructions form a cached prefix; the date/admin block after it changes.
        system: [
          { type: 'text', text: prompt.stable, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: prompt.dynamic },
        ],
        tools: toolDefs,
        messages,
        ...fallback,
      },
      { signal },
    )
    stream.on('text', (delta) => emit({ type: 'text', delta }))

    let message: Anthropic.Beta.BetaMessage
    try {
      message = await stream.finalMessage()
      jsonRetries = 0
    } catch (err) {
      // Only an unparseable streamed tool input is retried; API errors go to the caller.
      if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err
      continue
    }

    if (message.stop_reason === 'refusal') {
      emit({ type: 'text', delta: '\n\nI can’t help with that request.' })
      return
    }
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content })
      continue
    }
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (toolUses.length === 0) return
    if (message.stop_reason === 'max_tokens') throw new Error('The reply was cut off. Try a narrower question.')

    messages.push({ role: 'assistant', content: message.content })
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const use of toolUses) {
      const { ok, result } = await call(use.name, use.input)
      results.push({ type: 'tool_result', tool_use_id: use.id, content: result, is_error: !ok })
    }
    messages.push({ role: 'user', content: results })
  }
  emit({ type: 'text', delta: '\n\n(Stopped after too many lookups. Try asking a more specific question.)' })
}

// ---------------------------------------------------------------- OpenAI-compatible (OpenAI, Gemini, DeepSeek, Groq, OpenRouter, custom)

async function runOpenAICompatible({ config, history, emit, signal, tools, prompt, call }: LoopOpts) {
  const info = PROVIDERS[config.provider]
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: (config.provider === 'custom' ? config.baseUrl : info.baseUrl) ?? undefined,
  })
  const toolDefs: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: toolJsonSchema(t) },
  }))
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: `${prompt.stable}\n\n${prompt.dynamic}` },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = await client.chat.completions.create(
      { model: config.model, messages, tools: toolDefs, stream: true },
      { signal },
    )

    let text = ''
    const calls: Array<{ id: string; name: string; args: string }> = []
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        emit({ type: 'text', delta: delta.content })
      }
      for (const [pos, tc] of (delta.tool_calls ?? []).entries()) {
        const i = tc.index ?? pos
        calls[i] ??= { id: '', name: '', args: '' }
        if (tc.id) calls[i].id = tc.id
        if (tc.function?.name) calls[i].name += tc.function.name
        if (tc.function?.arguments) calls[i].args += tc.function.arguments
      }
    }

    const toolCalls = calls.filter(Boolean).map((c) => ({ ...c, id: c.id || `call_${randomUUID()}` }))
    if (toolCalls.length === 0) return

    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
    })
    for (const c of toolCalls) {
      let input: unknown
      try {
        input = JSON.parse(c.args || '{}')
      } catch {
        messages.push({ role: 'tool', tool_call_id: c.id, content: 'Invalid JSON arguments. Try again.' })
        continue
      }
      const { result } = await call(c.name, input)
      messages.push({ role: 'tool', tool_call_id: c.id, content: result })
    }
  }
  emit({ type: 'text', delta: '\n\n(Stopped after too many lookups. Try asking a more specific question.)' })
}

// ---------------------------------------------------------------- errors & connection test

/** Turns provider errors into something an admin can act on. */
export function describeProviderError(err: unknown): string {
  const status =
    err instanceof Anthropic.APIError ? err.status : err instanceof OpenAI.APIError ? err.status : undefined
  if (status === 401 || status === 403) return 'The AI provider rejected the API key. Check it in AI Assistant settings.'
  if (status === 404) return 'The selected model was not found for this provider. Check the model name in settings.'
  if (status === 429) return 'The AI provider is rate limiting or the account is out of credit. Try again shortly.'
  if (status === 400) return 'The AI provider rejected the request. The model may not support tools; try another model.'
  if (status && status >= 500) return 'The AI provider is having problems right now. Try again shortly.'
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return 'Could not reach the AI provider. Check the base URL and your connection.'
  }
  if (err instanceof Error && err.message.startsWith('The reply')) return err.message
  return 'Something went wrong talking to the AI provider.'
}

/** Sends a tiny request to check the provider, key and model work together. */
export async function testConnection(config: Pick<AssistantConfig, 'provider' | 'model' | 'apiKey' | 'baseUrl'>) {
  const info = PROVIDERS[config.provider]
  if (info.kind === 'anthropic') {
    const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 0 })
    await client.messages.create({
      model: config.model,
      max_tokens: 256,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    })
  } else {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: (config.provider === 'custom' ? config.baseUrl : info.baseUrl) ?? undefined,
      maxRetries: 0,
    })
    await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    })
  }
}
