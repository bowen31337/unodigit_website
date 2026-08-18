import type { CategoryName } from '@unodigit/ba-bot-contract'

/**
 * Per-category cost multipliers.
 *
 * A flat per-task rate ignores real complexity variance: an Integrations task
 * (third-party auth, webhooks, retries) is not a UI/UX task (a loading state).
 * These weights are deliberate commercial policy, not measurements — change
 * them when delivery data says to, not to make a number look better.
 */
export const CATEGORY_WEIGHTS: Record<CategoryName, number> = {
  'Integrations': 1.5,
  'Core functionality': 1.2,
  'API layer': 1.0,
  'Authentication & User Management': 1.0,
  'Data management': 1.0,
  'Admin features': 0.9,
  'UI/UX': 0.8,
}
