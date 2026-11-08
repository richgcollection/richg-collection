'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { testAssistantConnectionAction, updateAssistantSettingsAction } from '@/lib/actions/admin-assistant'
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from '@/lib/assistant/providers'
import type { ActionResult } from '@/lib/actions/cart'

const field = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10'
const label = 'mb-1 block text-xs font-medium tracking-wide uppercase opacity-70'

export function AssistantSettingsForm(props: {
  enabled: boolean
  provider: ProviderId
  model: string
  baseUrl: string
  allowActions: boolean
  customInstructions: string
  hasApiKey: boolean
  apiKeyHint: string | null
  apiKeyUnreadable: boolean
}) {
  const [state, formAction, saving] = useActionState(updateAssistantSettingsAction, undefined)
  const [provider, setProvider] = useState<ProviderId>(props.provider)
  const [model, setModel] = useState(props.model)
  const [testResult, setTestResult] = useState<ActionResult | null>(null)
  const [testing, startTest] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const info = PROVIDERS[provider]
  // The saved key belongs to the saved provider; picking another one needs a new key.
  const keyOnFile = props.hasApiKey && provider === props.provider

  function changeProvider(next: ProviderId) {
    setProvider(next)
    setModel(next === props.provider ? props.model : PROVIDERS[next].defaultModel)
    setTestResult(null)
  }

  function runTest() {
    if (!formRef.current) return
    const data = new FormData(formRef.current)
    setTestResult(null)
    startTest(async () => setTestResult(await testAssistantConnectionAction(data)))
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex max-w-2xl flex-col gap-5 rounded-lg border border-black/10 p-6 dark:border-white/10"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">AI provider</h2>
          <p className="text-xs opacity-60">Pick the model the assistant runs on and paste its API key.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={props.enabled} />
          Assistant on
        </label>
      </div>

      {state?.success === false && (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state?.success === true && <p className="text-sm text-emerald-600 dark:text-emerald-400">Settings saved.</p>}
      {props.apiKeyUnreadable && (
        <p className="rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          The saved API key can no longer be read (the site&apos;s AUTH_SECRET changed). Enter it again.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="provider" className={label}>
            Provider
          </label>
          <select
            id="provider"
            name="provider"
            value={provider}
            onChange={(e) => changeProvider(e.target.value as ProviderId)}
            className={field}
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="model" className={label}>
            Model
          </label>
          <input
            id="model"
            name="model"
            list="assistant-models"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model ID from your provider"
            className={field}
            required
          />
          <datalist id="assistant-models">
            {info.modelSuggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>

      {provider === 'custom' && (
        <div>
          <label htmlFor="baseUrl" className={label}>
            Base URL
          </label>
          <input
            id="baseUrl"
            name="baseUrl"
            defaultValue={props.baseUrl}
            placeholder="https://your-server.example.com/v1"
            className={field}
          />
          <p className="mt-1 text-xs opacity-60">Any server that implements the OpenAI Chat Completions API with tool calling.</p>
        </div>
      )}

      <div>
        <label htmlFor="apiKey" className={label}>
          API key{' '}
          {keyOnFile && (
            <span className="normal-case opacity-60">
              (saved: {props.apiKeyHint}, leave blank to keep it)
            </span>
          )}
        </label>
        <PasswordInput
          key={provider}
          id="apiKey"
          name="apiKey"
          autoComplete="off"
          placeholder={keyOnFile ? '•••••••••••••••• (unchanged)' : info.keyHint}
          className={`${field} pr-10`}
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs opacity-60">
          <span>
            Stored encrypted. It is never shown again or sent to the browser.
            {info.keyUrl && (
              <>
                {' '}
                <a href={info.keyUrl} target="_blank" rel="noreferrer" className="underline">
                  Get a key
                </a>
              </>
            )}
          </span>
          {keyOnFile && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="clearApiKey" /> Remove saved key
            </label>
          )}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="allowActions" defaultChecked={props.allowActions} className="mt-1" />
        <span>
          Let the assistant record changes
          <span className="block text-xs opacity-60">
            Restocks, manual sales and giveaways, order status, marking orders paid. Every change appears as a card that
            someone must confirm before anything is saved. Off = read-only.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="customInstructions" className={label}>
          Business notes for the assistant <span className="normal-case opacity-60">(optional)</span>
        </label>
        <textarea
          id="customInstructions"
          name="customInstructions"
          rows={4}
          defaultValue={props.customInstructions}
          placeholder="e.g. We restock from our Eastleigh supplier every 2 weeks. Aim for at least 40% margin. Influencer giveaways are capped at 10 pairs a month."
          className={field}
        />
      </div>

      {testResult && (
        <p
          className={
            testResult.success
              ? 'text-sm text-emerald-600 dark:text-emerald-400'
              : 'rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400'
          }
        >
          {testResult.success ? 'Connection works: the provider answered with this key and model.' : testResult.error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="rounded-full border border-black/15 px-6 py-3 text-sm font-medium disabled:opacity-50 dark:border-white/15"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
    </form>
  )
}
