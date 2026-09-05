import { PaymentSettingsForm } from '@/components/admin/PaymentSettingsForm'
import { getPaystackSettingsForAdmin } from '@/lib/actions/admin-payment-settings'

export const dynamic = 'force-dynamic'

export default async function AdminPaymentSettingsPage() {
  const paystack = await getPaystackSettingsForAdmin()

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Payment Settings</h1>
      <p className="mt-1 text-sm opacity-60">
        Configure payment providers here instead of your hosting provider&apos;s environment variables.
      </p>
      <div className="mt-6">
        <PaymentSettingsForm
          enabled={paystack.enabled}
          publicKey={paystack.publicKey}
          hasSecretKey={paystack.hasSecretKey}
        />
      </div>
    </div>
  )
}
