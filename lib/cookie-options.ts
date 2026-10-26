/**
 * One place that decides how this app writes cookies.
 *
 * Session and workspace cookies are bearer credentials. `httpOnly` keeps them
 * out of reach of injected script, `secure` keeps them off plaintext transport,
 * and `sameSite: 'lax'` still lets a top-level GitHub/OAuth return carry the
 * session while blocking cross-site form POSTs. `path: '/'` avoids two copies
 * of the same cookie at different paths.
 *
 * Auth is handled server-side (route handlers / middleware), so there is no
 * browser SDK that needs to read these values. That is what makes `httpOnly`
 * possible here; a browser-side auth client would need a readable cookie.
 */
export type CookieSettings = {
  path?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: boolean | 'lax' | 'strict' | 'none'
  maxAge?: number
  expires?: Date
  domain?: string
  priority?: 'low' | 'medium' | 'high'
  partitioned?: boolean
}

export function hardenedCookieOptions(options: CookieSettings = {}): CookieSettings {
  return {
    ...options,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // At least Lax. Strict is deliberately not forced: GitHub/OAuth returns
    // are top-level cross-site navigations and must still carry the session.
    sameSite: 'lax',
  }
}

export function sessionCookieOptions(maxAge?: number): CookieSettings {
  return hardenedCookieOptions(maxAge === undefined ? {} : { maxAge })
}
