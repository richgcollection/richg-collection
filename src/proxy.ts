import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, REFERRAL_PARAM, normalizeReferralCode } from '@/lib/referral'

/**
 * `?ref=CODE` on any storefront URL stores the affiliate's code for 30 days
 * (last click wins). The code is only checked against the database at
 * checkout, so this stays a cheap cookie write.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const code = normalizeReferralCode(request.nextUrl.searchParams.get(REFERRAL_PARAM))
  if (code) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFERRAL_COOKIE_MAX_AGE,
    })
  }
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api|admin|affiliate|_next/static|_next/image|favicon.ico).*)',
      has: [{ type: 'query', key: 'ref' }],
    },
  ],
}
