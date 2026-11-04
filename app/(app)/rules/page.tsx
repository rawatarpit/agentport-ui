import { RulesEditor } from '@/components/rules-editor'

/**
 * Same shape as /map: the editor lives in components/ and this route only
 * supplies the default export the App Router requires. The stale inline copy
 * had no default export and broke static generation.
 */
export default function RulesPage() {
  return <RulesEditor />
}
