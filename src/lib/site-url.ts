/**
 * The public origin for absolute links (emails, invites, payment callbacks).
 * NEXT_PUBLIC_SITE_URL wins; on Vercel we fall back to the project's production domain
 * so links never point at localhost just because the variable was left unset.
 */
export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelDomain) return `https://${vercelDomain.replace(/\/$/, '')}`
  return 'http://localhost:3000'
}
