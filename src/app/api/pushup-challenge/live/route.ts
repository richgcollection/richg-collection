import { getChallengeLiveState } from '@/lib/queries/pushup-challenge'

// Polled every couple of seconds by open challenge pages (public and admin)
// to follow the timer, the winner announcement and leaderboard changes.
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await getChallengeLiveState(), { headers: { 'Cache-Control': 'no-store' } })
}
