# Stripe, Credits & Billing

Overview of the billing system: credit costs, tiers, Stripe integration, and webhooks.

---

## Pricing & tiers

| Tier    | Price   | Credits/mo |
| ------- | ------- | ---------- |
| Free   | $0      | 0 (500 signup) |
| Basic  | $29/mo  | 4,500       |
| Pro    | $69/mo  | 14,000      |
| Business | $179/mo | 45,000    |

**One-time:** 100 credits for $1

Constants live in `packages/db/credits.ts`: `TIER_PRICE_CENTS`, `TIER_CREDIT_ALLOWANCE`, `TIER_NAMES`, `formatTierPrice()`, `CREDITS_PER_DOLLAR`.

---

## Credit costs

| Action         | Cost |
| -------------- | ---- |
| Create run (ingest) | 100 |
| Finalize video (assets) | 300 per video |
| Image regen         | 50  |
| Script regen        | Free (10 per run), then upgrade |
| Export              | 0   |

Constants: `CREDITS_INGEST_PER_RUN`, `CREDITS_ASSETS_PER_VIDEO`, `CREDITS_IMAGE_REGEN`, `SCRIPT_REGEN_FREE_LIMIT`, `SIGNUP_CREDITS` in `packages/db/credits.ts`.

---

## Credit gates

Credits are debited in `apps/web/src/server/api/routers/runs.ts`:

- **createRun** — 100 before creating
- **finalizeAll** — 300 × video count
- **updateImagery** — 50 per regen
- **updateClipFeedback** — script regen: free up to 10, then `PRECONDITION_FAILED`

Insufficient credits → `PRECONDITION_FAILED` → global toast with link to `/billing` (see `utils/api.ts` `defaultOptions.mutations.onError`).

---

## Environment variables

In `apps/web/.env`:

```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_BUSINESS=price_...
STRIPE_PRICE_CREDITS_100=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

Create products and prices in [Stripe Dashboard](https://dashboard.stripe.com/products), then copy the price IDs into `.env`.

---

## Customer Portal (upgrade / downgrade)

Upgrade and downgrade are handled by Stripe's [Customer Portal](https://dashboard.stripe.com/settings/billing/portal). Users click **Manage subscription** on the billing page → Stripe hosts the flow (plan change, cancel, payment method).

**Configuration:**

1. [Stripe Dashboard → Settings → Billing → Customer portal](https://dashboard.stripe.com/settings/billing/portal)
2. Turn on **Customers can switch plans**
3. Under **Products**, add Basic, Pro, and Business (or the product that contains these prices). Stripe will show these as options when the customer updates their subscription.
4. Optionally: **Customers can cancel subscriptions** (if you allow cancels)

**Backend:** No extra code. `customer.subscription.updated` already updates our subscription row and grants credit deltas for upgrades (`webhooks/stripe/route.ts`).

**Best practice:** Put Basic, Pro, and Business as prices on a single Product (e.g. "Shortgen Subscription") so the portal offers them as plan choices.

---

## Webhooks

### Local development (localhost)

Use the Stripe CLI to forward webhooks to your local server:

1. Install: `brew install stripe/stripe-cli/stripe`
2. Login: `stripe login`
3. Forward: `pnpm stripe:listen` (or `stripe listen --forward-to localhost:3000/api/webhooks/stripe`)
4. Copy the signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` in `.env`
5. Run `pnpm web` in another terminal

The CLI creates a temporary tunnel; the secret changes each run.

**Important:** Use the webhook secret from `stripe listen` in your `.env`, not the Dashboard webhook secret. If they mismatch, signature verification fails and credits won't be granted.

### Deployed (staging/production)

Use a persistent webhook in Stripe:

1. [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**
2. **URL:** `https://your-domain.com/api/webhooks/stripe`
3. **Events:** `invoice.paid`, `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the signing secret and set `STRIPE_WEBHOOK_SECRET` in your deployment env

---

## Events handled

| Event                         | Action                                             |
| ----------------------------- | -------------------------------------------------- |
| `invoice.paid`                | Grant subscription credits                         |
| `checkout.session.completed`  | Grant credits for one-time purchase (mode=payment) |
| `customer.subscription.created` | Upsert subscription record                        |
| `customer.subscription.updated` | Upgrade: grant delta. Downgrade: no clawback      |
| `customer.subscription.deleted` | Mark subscription canceled                        |

Handler: `apps/web/src/app/api/webhooks/stripe/route.ts`

---

## Invariant

**subscription exists ⇒ user.stripeCustomerId is set**

The webhook always updates `user.stripeCustomerId` when processing subscription events (`invoice.paid`, `customer.subscription.created`/`updated`) and `checkout.session.completed` (payment mode). Billing procedures read only from `user.stripeCustomerId`; no fallback to the subscription table.

To backfill legacy data: `UPDATE shortgen_user u SET "stripeCustomerId" = s."stripeCustomerId" FROM shortgen_subscription s WHERE s."userId" = u.id AND u."stripeCustomerId" IS NULL AND s."stripeCustomerId" IS NOT NULL;`

---

## Key files

| Path | Purpose |
| ---- | ------- |
| `packages/db/credits.ts` | Credit and tier constants |
| `apps/web/src/server/credits.ts` | `debitCredits`, `grantCredits` |
| `apps/web/src/server/api/routers/billing.ts` | `getSubscription`, `createCheckout`, `createCreditPurchase` |
| `apps/web/src/server/api/routers/runs.ts` | Credit gates (createRun, finalizeAll, updateImagery, updateClipFeedback) |
| `apps/web/src/app/api/webhooks/stripe/route.ts` | Webhook handler |
| `apps/web/src/utils/api.ts` | Global `PRECONDITION_FAILED` toast |
