import type { TimerPhase } from '@/lib/pushup-challenge'

/** The big number for the current timer phase. Renders nothing while idle. */
export function ChallengeClock({ phase, size = 'md' }: { phase: TimerPhase; size?: 'md' | 'lg' }) {
  if (phase.phase === 'idle') return null

  const digits = size === 'lg' ? 'text-8xl sm:text-9xl' : 'text-6xl'
  const label = size === 'lg' ? 'text-sm' : 'text-xs'

  if (phase.phase === 'finished') {
    return (
      <div className="text-center">
        <div className={`${digits} font-black text-red-600 tabular-nums dark:text-red-400`}>TIME</div>
        <div className={`${label} tracking-widest uppercase opacity-60`}>Round over</div>
      </div>
    )
  }

  const isCountdown = phase.phase === 'countdown'
  return (
    <div className="text-center" aria-live="polite">
      {isCountdown && (
        <div
          className={`${size === 'lg' ? 'text-lg sm:text-2xl' : 'text-sm'} mb-1 font-semibold tracking-widest text-[#b8942a] uppercase dark:text-[#d4af37]`}
        >
          Challenge about to begin
        </div>
      )}
      <div className={`${digits} font-black tabular-nums ${isCountdown ? 'opacity-80' : ''}`}>{phase.secondsLeft}</div>
      <div className={`${label} tracking-widest uppercase opacity-60`}>
        {phase.paused ? 'Paused' : isCountdown ? 'Get ready' : 'Seconds'}
      </div>
    </div>
  )
}
