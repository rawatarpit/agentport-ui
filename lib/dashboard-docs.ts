/**
 * Installation documentation for the merchant's own repository.
 *
 * This is an inventory of files to create and illustrative snippets, not a
 * work log. Nothing here is executed by the console: the install PR and the
 * downloadable package are built by `buildInstallPackageFrom`, and the hosted
 * governor — not any committed file — decides what runs.
 */

export type DashboardDoc = {
  id: string
  path: string
  purpose: string
  /** Example content, where an example is more useful than a description. */
  snippet?: string
}

export const DOCS_HONESTY_NOTE =
  'These are instructions and illustrative examples for files in your own repository. They are not executed work, and a file you commit does not enforce anything — the hosted governor decides.'

export const DASHBOARD_DOCS: DashboardDoc[] = [
  {
    id: 'site-manifest',
    path: 'public/.well-known/agent.json',
    purpose:
      'Advisory discovery snapshot served from your origin. The hosted governor manifest is authoritative; this file only points at it.',
    snippet: `{
  "generatedBy": "agentport",
  "name": "Your business",
  "baseUrl": "https://<your-governor-host>/t/<tenant-id>",
  "capabilities": [
    {
      "name": "catalog.read",
      "description": "Read the public product catalogue",
      "access": "read",
      "authentication": { "required": false }
    }
  ],
  "policies": { "mode": "governed-by-hosted-manifest" }
}`,
  },
  {
    id: 'llms-txt',
    path: 'public/llms.txt',
    purpose:
      'Agent-readable pointer to the authoritative manifest. Existing content is preserved between the agentport markers.',
    snippet: `# Your business

Agents: the authoritative capability manifest is served by the hosted governor.
Discover it at https://<your-governor-host>/.well-known/agent.json.

<!-- agentport:begin -->
Agent Port capabilities are published through the hosted manifest above.
Only the hosted governor authorises and records calls.
<!-- agentport:end -->`,
  },
  {
    id: 'openapi-annotation',
    path: 'openapi.json',
    purpose:
      'Optional capability annotation for an existing OpenAPI document. Annotations describe intent; they never grant access or execute a call.',
    snippet: `{
  "openapi": "3.0.3",
  "info": { "title": "Your public API", "version": "1.0.0" },
  "paths": {
    "/api/catalog": {
      "get": {
        "operationId": "listCatalog",
        "summary": "Public read-only catalogue",
        "x-agentport": {
          "capability": "catalog.read",
          "access": "read",
          "humanConfirmation": "none",
          "authoritative": false
        }
      }
    },
    "/api/orders/draft": {
      "post": {
        "operationId": "draftOrder",
        "summary": "Prepare an order for human confirmation",
        "x-agentport": {
          "capability": "order.draft",
          "access": "write",
          "humanConfirmation": "required",
          "authoritative": false
        }
      }
    }
  }
}`,
  },
  {
    id: 'package-manifest',
    path: 'agentport/manifest.json',
    purpose: 'Local copy of the generated advisory snapshot for review and verification.',
  },
  {
    id: 'package-config',
    path: 'agentport/config.json',
    purpose: 'Tenant id, site URL and hosted governor URL. No secrets, credentials or ledger keys.',
  },
  {
    id: 'package-access-page',
    path: 'agentport/agent-access.html',
    purpose: 'No-JavaScript landing page for humans and agents, linking the authoritative hosted manifest.',
  },
  {
    id: 'package-publish',
    path: 'agentport/publish.mjs',
    purpose: 'Copies the advisory discovery files into the site output. Run only by your existing build.',
  },
  {
    id: 'package-verify',
    path: 'agentport/verify.mjs',
    purpose: 'Checks the deployed snapshot against the local config and the hosted manifest. Does not prove execution.',
  },
  {
    id: 'package-readme',
    path: 'agentport/README.md',
    purpose: 'Explains what the folder is and is not: discovery pointers, not an enforcement engine.',
  },
]
