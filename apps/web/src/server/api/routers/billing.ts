import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

import { creditBalance, subscription, user } from "@shortgen/db";

import type { Tier } from "@shortgen/db";

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

const PRICE_TO_TIER: Record<string, Tier> = {
  [env.STRIPE_PRICE_BASIC ?? ""]: "basic",
  [env.STRIPE_PRICE_PRO ?? ""]: "pro",
  [env.STRIPE_PRICE_BUSINESS ?? ""]: "business",
};

function getTierFromPriceId(priceId: string): Tier {
  return PRICE_TO_TIER[priceId] ?? "free";
}

export const billingRouter = createTRPCRouter({
  /** Get subscription and credit balance for current user. */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const [sub] = await ctx.db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, ctx.session.user.id));

    const [bal] = await ctx.db
      .select()
      .from(creditBalance)
      .where(eq(creditBalance.userId, ctx.session.user.id));

    const notExpired = !sub?.currentPeriodEnd || sub.currentPeriodEnd > new Date();
    const isActive =
      (sub?.status === "active" || sub?.status === "trialing") && notExpired;

    const dbTier = sub?.tier as Tier | undefined;
    const resolvedTier =
      dbTier && dbTier !== "free"
        ? dbTier
        : sub?.priceId
          ? getTierFromPriceId(sub.priceId)
          : "free";
    const effectiveTier: Tier = isActive ? resolvedTier : "free";

    return {
      tier: effectiveTier,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      creditsBalance: bal?.balance ?? 0,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
    };
  }),

  /** Create Stripe Checkout session for subscription. */
  createCheckout: protectedProcedure
    .input(
      z.object({
        priceId: z.enum(["basic", "pro", "business"]),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!stripe) {
        throw new Error("Billing is not configured");
      }

      const priceIdMap = {
        basic: env.STRIPE_PRICE_BASIC,
        pro: env.STRIPE_PRICE_PRO,
        business: env.STRIPE_PRICE_BUSINESS,
      } as const;

      const priceId = priceIdMap[input.priceId];
      if (!priceId) {
        throw new Error(`Price not configured for ${input.priceId}`);
      }

      const [existingSub] = await ctx.db
        .select({ status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd })
        .from(subscription)
        .where(eq(subscription.userId, ctx.session.user.id));

      const hasActiveSub =
        existingSub &&
        (existingSub.status === "active" || existingSub.status === "trialing") &&
        (!existingSub.currentPeriodEnd || existingSub.currentPeriodEnd > new Date());

      if (hasActiveSub) {
        throw new Error(
          "You already have an active subscription. Use Manage subscription to change your plan.",
        );
      }

      const [dbUser] = await ctx.db
        .select({ stripeCustomerId: user.stripeCustomerId })
        .from(user)
        .where(eq(user.id, ctx.session.user.id));

      const customerId = dbUser?.stripeCustomerId ?? undefined;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        customer_email: customerId
          ? undefined
          : (ctx.session.user.email ?? undefined),
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { userId: ctx.session.user.id },
        subscription_data: {
          metadata: { userId: ctx.session.user.id },
        },
      });

      if (
        session.customer &&
        typeof session.customer === "string" &&
        !customerId
      ) {
        await ctx.db
          .update(user)
          .set({ stripeCustomerId: session.customer })
          .where(eq(user.id, ctx.session.user.id));
      }

      return { url: session.url };
    }),

  /** Create Stripe Checkout session for one-time credit purchase. */
  createCreditPurchase: protectedProcedure
    .input(
      z.object({
        quantity: z.number().int().min(1).max(100).default(1),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!stripe) {
        throw new Error("Billing is not configured");
      }

      const priceId = env.STRIPE_PRICE_CREDITS_100;
      if (!priceId) {
        throw new Error("Credit product not configured");
      }

      const [dbUser] = await ctx.db
        .select({ stripeCustomerId: user.stripeCustomerId })
        .from(user)
        .where(eq(user.id, ctx.session.user.id));

      const customerId = dbUser?.stripeCustomerId ?? undefined;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        customer_email: customerId
          ? undefined
          : (ctx.session.user.email ?? undefined),
        line_items: [{ price: priceId, quantity: input.quantity }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { userId: ctx.session.user.id },
      });

      if (
        session.customer &&
        typeof session.customer === "string" &&
        !customerId
      ) {
        await ctx.db
          .update(user)
          .set({ stripeCustomerId: session.customer })
          .where(eq(user.id, ctx.session.user.id));
      }

      return { url: session.url };
    }),

  /** Create Stripe Customer Portal session. */
  createPortalSession: protectedProcedure
    .input(
      z.object({
        returnUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!stripe) {
        throw new Error("Billing is not configured");
      }

      const [dbUser] = await ctx.db
        .select({ stripeCustomerId: user.stripeCustomerId })
        .from(user)
        .where(eq(user.id, ctx.session.user.id));

      const customerId = dbUser?.stripeCustomerId;
      if (!customerId) {
        throw new Error("No billing account found. Subscribe first.");
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: input.returnUrl,
      });

      return { url: session.url };
    }),
});
