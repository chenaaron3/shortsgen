"use client";

import { api } from "~/utils/api";

/**
 * Returns pipeline config and billing state based on user tier.
 * Free → prototype (gpt-4o-mini, cheap images). Paid → default (gpt-4o, full quality).
 */
export function useUserConfig(): {
  config: "prototype" | "default";
  tier: "free" | "basic" | "pro" | "business";
  creditsBalance: number;
  isLoading: boolean;
} {
  const { data, isLoading } = api.billing.getSubscription.useQuery(undefined, {
    enabled: true,
  });
  const tier = data?.tier ?? "free";
  const creditsBalance = data?.creditsBalance ?? 0;

  const config: "prototype" | "default" =
    tier === "free" ? "prototype" : "default";

  return {
    config,
    tier,
    creditsBalance,
    isLoading,
  };
}
