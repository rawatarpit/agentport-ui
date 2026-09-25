/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The SDK is a workspace sibling consumed via file:, so Next must transpile it.
  transpilePackages: ['@agentport/sdk'],
}

export default nextConfig
