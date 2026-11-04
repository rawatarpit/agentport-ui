import { MapWorkbench } from '@/components/map-workbench'

/**
 * Next requires a route module to expose a default export. The workbench
 * itself lives in components/ so the route stays a wrapper: this page used
 * to be a stale copy of the component and shipped no default export, which
 * made the whole route a "Module" to the server-component renderer.
 */
export default function MapPage() {
  return <MapWorkbench />
}
