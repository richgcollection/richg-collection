const PRODUCTION_ORIGIN = 'https://richgcollection.com'

/**
 * The public origin for absolute links (emails, invites, referral links, payment callbacks).
 * NEXT_PUBLIC_SITE_URL wins; any Vercel deploy falls back to the storefront domain
 * so links never point at localhost (or another project domain) when the variable is unset.
 */
export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (process.env.VERCEL) return PRODUCTION_ORIGIN
  return 'http://localhost:3000'
}
