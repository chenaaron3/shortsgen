/**
 * Credit cost constants and tier allowances.
 * Used by credits.ts (debit/grant) and billing logic.
 */

export const CREDITS_INGEST_PER_RUN = 100;
export const CREDITS_ASSETS_PER_VIDEO = 300;
export const CREDITS_IMAGE_REGEN = 50;
export const SCRIPT_REGEN_FREE_LIMIT = 10;
export const SIGNUP_CREDITS = 500;
export const CREDITS_PER_DOLLAR = 100;

/** Monthly price in cents per tier. */
export const TIER_PRICE_CENTS = {
  basic: 2900,
  pro: 6900,
  business: 17900,
} as const;

/** Tier display names. */
export const TIER_NAMES = {
  basic: "Basic",
  pro: "Pro",
  business: "Business",
} as const;

/** Monthly credit allowance per tier. */
export const TIER_CREDIT_ALLOWANCE = {
  free: 0,
  basic: 4500,
  pro: 14000,
  business: 45000,
} as const satisfies Record<string, number>;

/** e.g. "Basic — $29/mo" */
export function formatTierPrice(
  tierId: keyof typeof TIER_PRICE_CENTS,
): string {
  return `${TIER_NAMES[tierId]} — $${(TIER_PRICE_CENTS[tierId] / 100).toFixed(0)}/mo`;
}
