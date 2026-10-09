import Link from 'next/link'
import { PushupChallenge } from '@/components/admin/PushupChallenge'
import { getPushupEntries } from '@/lib/queries/pushup-challenge'

export const dynamic = 'force-dynamic'

export default async function AdminPushupChallengePage() {
  const entries = await getPushupEntries()

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Push-Up Challenge</h1>
        <Link href="/pushup-challenge" target="_blank" className="text-sm opacity-60 hover:opacity-100">
          View public leaderboard ↗
        </Link>
      </div>
      <p className="mt-1 text-sm opacity-60">One competition · One leaderboard · Top score wins</p>
      <div className="mt-6">
        <PushupChallenge entries={entries} />
      </div>
    </div>
  )
}
