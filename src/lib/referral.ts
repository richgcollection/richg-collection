/** Shared by proxy.ts (sets it) and checkout (reads it), so keep this file free of server-only imports. */
export const REFERRAL_COOKIE = 'rg_ref'
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
export const REFERRAL_PARAM = 'ref'

const REFERRAL_CODE_PATTERN = /^[A-Z0-9-]{3,32}$/

/** Uppercases and validates a referral code; returns null for anything malformed. */
export function normalizeReferralCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase()
  return code && REFERRAL_CODE_PATTERN.test(code) ? code : null
}
