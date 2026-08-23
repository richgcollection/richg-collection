import { createHmac } from 'node:crypto'

const PAYSTACK_BASE_URL = 'https://api.paystack.co'

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY)
}

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super('Paystack is not configured (PAYSTACK_SECRET_KEY is missing).')
    this.name = 'PaystackNotConfiguredError'
  }
}

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new PaystackNotConfiguredError()
  return key
}

type InitializeTransactionInput = {
  email: string
  amountKes: number
  reference: string
  callbackUrl: string
  metadata?: Record<string, unknown>
}

type InitializeTransactionResponse = {
  status: boolean
  message: string
  data: { authorization_url: string; access_code: string; reference: string }
}

/**
 * Paystack's `amount` is always in the currency's lowest denomination
 * (kobo/cents/etc.), multiplied by 100 uniformly across every supported
 * currency including KES — verify this against a real test transaction
 * once live keys are available; a wrong multiplier means a 100x over- or
 * under-charge.
 */
export async function initializeTransaction(
  input: InitializeTransactionInput,
): Promise<InitializeTransactionResponse> {
  const secretKey = getSecretKey()

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amountKes * 100),
      currency: 'KES',
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: ['card', 'mobile_money'],
      metadata: input.metadata,
    }),
  })

  const json = (await response.json()) as InitializeTransactionResponse
  if (!response.ok || !json.status) {
    throw new Error(json.message || 'Failed to initialize Paystack transaction.')
  }
  return json
}

type VerifyTransactionResponse = {
  status: boolean
  message: string
  data: {
    status: 'success' | 'failed' | 'abandoned'
    reference: string
    amount: number
    currency: string
  }
}

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResponse> {
  const secretKey = getSecretKey()

  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  )

  const json = (await response.json()) as VerifyTransactionResponse
  if (!response.ok) {
    throw new Error(json.message || 'Failed to verify Paystack transaction.')
  }
  return json
}

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false
  const secretKey = process.env.PAYSTACK_SECRET_KEY
  if (!secretKey) return false

  const hash = createHmac('sha512', secretKey).update(rawBody).digest('hex')
  return hash === signature
}
