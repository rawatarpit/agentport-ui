/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The SDK is a workspace sibling consumed via file:, so Next must transpile it.
  transpilePackages: ['@agentport/sdk'],

  /**
   * Fail the build if a server-only Supabase credential is exposed to the client.
   *
   * `.gitignore` covers `.env.local`, and it does nothing about this. A
   * `NEXT_PUBLIC_` variable is inlined into client JavaScript by the bundler:
   * there is no runtime check, no warning, and no trace left in the repository.
   * The key simply ships to every visitor's devtools.
   *
   * `SUPABASE_SERVICE_ROLE_KEY` bypasses row level security, so it reads every
   * tenant's rows — and `SUPABASE_ACCESS_TOKEN` is account-admin: it reads every
   * API key and can drop the database. Both would be one accidental prefix away
   * from being public.
   *
   * The only real protection is the variable *name*, which is why the name is
   * checked here rather than trusted to review. See TASKS.md -> What to push to
   * GitHub.
   */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      const forbidden = [
        'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
        'NEXT_PUBLIC_SUPABASE_ACCESS_TOKEN',
        'NEXT_PUBLIC_AGENTPORT_SIGNING_SECRET',
      ]
      for (const key of forbidden) {
        if (process.env[key] !== undefined) {
          throw new Error(
            `${key} is set. NEXT_PUBLIC_ variables are inlined into client JavaScript, ` +
              `so this credential would be readable by every visitor. Remove the prefix ` +
              `and rebuild. See TASKS.md -> What to push to GitHub.`,
          )
        }
      }
    }
    return config
  },
}

export default nextConfig