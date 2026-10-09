// Shared by the admin manager (client) and the public leaderboard, so keep
// this free of server-only imports.

export const ROUND_SECONDS = 60
export const MAX_SCORE = 300
export const LEADERBOARD_SIZE = 10
export const MEDALS = ['🥇', '🥈', '🥉']
export const PRIZES = [
  { medal: '🥇', place: '1st Place', amount: 'KSh 15,500' },
  { medal: '🥈', place: '2nd Place', amount: 'KSh 9,700' },
  { medal: '🥉', place: '3rd Place', amount: 'KSh 6,800' },
]

export type PushupEntry = { id: string; name: string; score: number }
