import type { MetadataRoute } from 'next'

/**
 * Public acquisition pages stay crawlable. Tenant screens, API routes and the
 * answer-bearing report URL do not: an indexable query string would make a
 * visitor's company name, website and objective part of a public URL.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/intelligence/report',
          '/ledger',
          '/approvals',
          '/capabilities',
          '/funnel',
          '/install',
          '/select-workspace',
        ],
      },
    ],
    sitemap: 'https://agentport.relayforge.in/sitemap.xml',
  }
}
