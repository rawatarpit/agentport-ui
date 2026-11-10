// Type surface for the runtime module in security-headers.mjs, which is kept as
// .mjs so next.config.mjs can import it and Vitest can test it without a build
// step. tsconfig has allowJs:false, so middleware.ts needs this declaration to
// consume the same policy source rather than duplicating it.

export interface Header {
  key: string
  value: string
}

export interface HeaderEnv {
  production?: boolean
  supabaseUrl?: string | null
}

export interface ContentSecurityPolicyOptions {
  supabaseUrl?: string | null
  nonce?: string
}

export function contentSecurityPolicyReportOnly(options?: ContentSecurityPolicyOptions): string

export function securityHeaders(env?: HeaderEnv): Header[]

export function securityHeaderGroups(env?: HeaderEnv): Array<{ source: string; headers: Header[] }>
