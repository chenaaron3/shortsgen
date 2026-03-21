import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { env } from "~/env";
import { db } from "~/server/db";
import { grantCredits } from "~/server/credits";
import {
  CREDITS_PER_DOLLAR,
  subscription,
  TIER_CREDIT_ALLOWANCE,
  type Tier,
} from "@shortgen/db";

const stripe = env.STRIPE_SECRET_KEY && new Stripe(env.STRIPE_SECRET_KEY);

const PRICE_TO_TIER: Record<string, Tier> = {
  [env.STRIPE_PRICE_BASIC ?? ""]: "basic",
  [env.STRIPE_PRICE_PRO ?? ""]: "pro",
  [env.STRIPE_PRICE_BUSINESS ?? ""]: "business",
};

function getTierFromPriceId(priceId: string): Tier {
  return PRICE_TO_TIER[priceId] ?? "free";
}

export async function POST(request: Request) {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    console.warn("[stripe-webhook] Stripe not configured, skipping");
    return new Response("OK", { status: 200 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    console.warn("[stripe-webhook] Missing stripe-signature header");
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription;
        if (!subId || typeof subId !== "string") break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const priceId = sub.items.data[0]?.price?.id;
        if (!priceId) break;

        const tier = getTierFromPriceId(priceId);
        const allowance = TIER_CREDIT_ALLOWANCE[tier];
        if (allowance <= 0) break;

        const userId = (sub.metadata?.userId as string) ?? undefined;
        if (!userId) {
          console.warn("[stripe-webhook] invoice.paid missing userId in subscription metadata");
          break;
        }

        await grantCredits(db, userId, allowance, "subscription_grant", event.id);

        await db
          .insert(subscription)
          .values({
            userId,
            stripeCustomerId: sub.customer as string,
            stripeSubscriptionId: sub.id,
            priceId,
            status: sub.status as "active" | "canceled" | "past_due" | "unpaid" | "trialing",
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            tier,
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: subscription.userId,
            set: {
              stripeSubscriptionId: sub.id,
              priceId,
              status: sub.status as "active" | "canceled" | "past_due" | "unpaid" | "trialing",
              currentPeriodEnd: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null,
              tier,
              updated_at: new Date(),
            },
          });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId as string | undefined;
        if (!userId) {
          console.warn("[stripe-webhook] checkout.session.completed missing userId in metadata");
          break;
        }

        if (session.mode === "subscription") {
          break;
        }

        if (session.mode === "payment" && session.amount_total != null) {
          // amount_total is in cents; $1 = CREDITS_PER_DOLLAR credits
          const credits = Math.round(
            (session.amount_total / 100) * CREDITS_PER_DOLLAR,
          );
          if (credits > 0) {
            await grantCredits(db, userId, credits, "purchase", event.id);
          }
        }
        break;
      }

      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId as string | undefined;
        if (!userId) break;

        const priceId = sub.items.data[0]?.price?.id;
        const tier = priceId ? getTierFromPriceId(priceId) : "free";

        await db
          .insert(subscription)
          .values({
            userId,
            stripeCustomerId: sub.customer as string,
            stripeSubscriptionId: sub.id,
            priceId: priceId ?? null,
            status: sub.status as "active" | "canceled" | "past_due" | "unpaid" | "trialing",
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            tier,
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: subscription.userId,
            set: {
              stripeSubscriptionId: sub.id,
              priceId: priceId ?? null,
              status: sub.status as "active" | "canceled" | "past_due" | "unpaid" | "trialing",
              currentPeriodEnd: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null,
              tier,
              updated_at: new Date(),
            },
          });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId as string | undefined;
        if (!userId) break;

        const priceId = sub.items.data[0]?.price?.id;
        const tier = priceId ? getTierFromPriceId(priceId) : "free";

        const [existing] = await db
          .select()
          .from(subscription)
          .where(eq(subscription.userId, userId));

        const oldTier = (existing?.tier ?? "free") as Tier;
        const oldAllowance = TIER_CREDIT_ALLOWANCE[oldTier];
        const newAllowance = TIER_CREDIT_ALLOWANCE[tier];

        if (newAllowance > oldAllowance) {
          const delta = newAllowance - oldAllowance;
          await grantCredits(db, userId, delta, "subscription_grant", event.id);
        }

        await db
          .insert(subscription)
          .values({
            userId,
            stripeCustomerId: sub.customer as string,
            stripeSubscriptionId: sub.id,
            priceId: priceId ?? null,
            status: sub.status as "active" | "canceled" | "past_due" | "unpaid" | "trialing",
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            tier,
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: subscription.userId,
            set: {
              stripeSubscriptionId: sub.id,
              priceId: priceId ?? null,
              status: sub.status as "active" | "canceled" | "past_due" | "unpaid" | "trialing",
              currentPeriodEnd: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null,
              tier,
              updated_at: new Date(),
            },
          });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId as string | undefined;
        if (!userId) break;

        await db
          .update(subscription)
          .set({
            status: "canceled",
            stripeSubscriptionId: null,
            updated_at: new Date(),
          })
          .where(eq(subscription.userId, userId));
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] Event handling failed:", event.type, err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
