"use client";

/**
 * Returns pipeline config based on user tier.
 * Free → prototype (gpt-4o-mini, cheap images). Paid → default (gpt-4o, full quality).
 * For now, all users use prototype.
 */
export function useUserConfig(): { config: "prototype" | "default" } {
  // TODO: Check session.user.tier or subscription when billing is added
  // const { data: session } = useSession();
  // const tier = session?.user?.tier ?? "free";
  // return { config: tier === "paid" ? "default" : "prototype" };
  return { config: "prototype" };
}
