/**
 * The single allowlist of event names that may be stored in
 * `acquisition_events`. Browser code, server components, the ingestion route,
 * and the funnel dashboard all derive their vocabulary from this list.
 *
 * A name here is not permission to attach a payload: the route stores only the
 * name, ids, the server-resolved identity, and a pathname.
 */
export const FUNNEL_EVENT_TYPES = [
  'intelligence_viewed',
  'report_generated',
  'report_saved',
  'report_refreshed',
  'signup_started',
  'signup_completed',
  'assessment_started',
  'assessment_completed',
  'installation_started',
  'github_app_installed',
  'repository_connected',
  'pull_request_created',
  'configuration_applied',
  'installation_completed',
  'deployment_verified',
  'merchant_profile_completed',
  'industry_selected',
  'geography_selected',
  'signup_submitted',
  'verification_email_sent',
  'recommendation_viewed',
  'intelligence_page_viewed',
  'report_viewed',
  'integration_started',
  'integration_completed',
  'pilot_requested',
  'hero_primary_cta_clicked',
  'hero_demo_cta_clicked',
  'product_demo_interaction',
  'integration_section_viewed',
  'pilot_section_viewed',
  'pilot_form_started',
  'pilot_form_submitted',
  'pilot_form_submission_failed',
] as const

export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number]

/**
 * Milestones that claim a durable server fact. The browser may display them,
 * but only server writers may store them; otherwise a tenant member could make
 * the funnel claim a config is applied or an install is complete.
 */
export const SERVER_ONLY_FUNNEL_EVENT_TYPES: readonly FunnelEventType[] = [
  'report_saved',
  'report_refreshed',
  'installation_started',
  'integration_started',
  'github_app_installed',
  'repository_connected',
  'pull_request_created',
  'configuration_applied',
  'deployment_verified',
  'installation_completed',
  'integration_completed',
  'recommendation_viewed',
]

const ALLOWED = new Set<string>(FUNNEL_EVENT_TYPES)
const SERVER_ONLY = new Set<string>(SERVER_ONLY_FUNNEL_EVENT_TYPES)

export function isFunnelEventType(value: unknown): value is FunnelEventType {
  return typeof value === 'string' && ALLOWED.has(value)
}

export function isClientWritableFunnelEventType(value: unknown): value is FunnelEventType {
  return isFunnelEventType(value) && !SERVER_ONLY.has(value)
}
