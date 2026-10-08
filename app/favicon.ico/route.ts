import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const dynamic = 'force-static'

/**
 * GET /favicon.ico — legacy browsers request this path unprompted. Serves
 * the same vector mark as /icon.svg (SVG bytes, svg content type — modern
 * browsers render it fine). One source of truth: app/icon.svg.
 */
export async function GET() {
  const svg = await readFile(join(process.cwd(), 'app', 'icon.svg'))
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=86400',
    },
  })
}
