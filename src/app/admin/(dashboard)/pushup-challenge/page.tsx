import { PushupChallenge } from '@/components/admin/PushupChallenge'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function AdminPushupChallengePage() {
  // Highest score first; ties go to whoever posted the score earliest.
  const entries = await prisma.pushupEntry.findMany({
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, score: true },
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Push-Up Challenge</h1>
      <p className="mt-1 text-sm opacity-60">One competition · One leaderboard · Top score wins</p>
      <div className="mt-6">
        <PushupChallenge entries={entries} />
      </div>
    </div>
  )
}
