import { createHmac } from 'node:crypto'
import { prisma } from '@/lib/prisma'

const PAYSTACK_BASE_URL = 'https://api.paystack.co'

type PaystackCredentials = { secretKey: string; publicKey: string | null }

/**
 * Credentials can be configured two ways: via the admin dashboard's Payment
 * Settings page (stored in the database) or via PAYSTACK_SECRET_KEY /
 * PAYSTACK_PUBLIC_KEY environment variables. The database takes priority
 * when present and enabled, so the dashboard always wins once someone sets
 * it up there — env vars just mean it works without touching the dashboard
 * first.
 */
async function resolvePaystackCredentials(): Promise<PaystackCredentials | null> {
  const settings = await prisma.paymentSettings.findUnique({ where: { provider: 'paystack' } })
  if (settings?.enabled && settings.secretKey) {
    return { secretKey: settings.secretKey, publicKey: settings.publicKey }
  }

  const envSecret = process.env.PAYSTACK_SECRET_KEY
  if (envSecret) {
    return { secretKey: envSecret, publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? null }
  }

  return null
}

export async function isPaystackConfigured(): Promise<boolean> {
  return (await resolvePaystackCredentials()) !== null
}

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super('Paystack is not configured yet. Set it up in Admin > Payment Settings.')
    this.name = 'PaystackNotConfiguredError'
  }
}

async function getCredentials(): Promise<PaystackCredentials> {
  const credentials = await resolvePaystackCredentials()
  if (!credentials) throw new PaystackNotConfiguredError()
  return credentials
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
  const { secretKey } = await getCredentials()

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
      // 'mobile_money' is Paystack's channel for Lipa na M-Pesa in Kenya.
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
  const { secretKey } = await getCredentials()

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

export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false

  const credentials = await resolvePaystackCredentials()
  if (!credentials) return false

  const hash = createHmac('sha512', credentials.secretKey).update(rawBody).digest('hex')
  return hash === signature
}
