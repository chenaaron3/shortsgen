"use client";

import { Check } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import Head from 'next/head';
import Link from 'next/link';
import { BuyCreditsForm } from '~/components/billing/BuyCreditsForm';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
} from '~/components/ui/card';
import { useUserConfig } from '~/hooks/useUserConfig';
import { cn } from '~/lib/utils';
import { api } from '~/utils/api';

import { SIGNUP_CREDITS, TIER_CREDIT_ALLOWANCE, TIER_NAMES, TIER_PRICE_CENTS } from '@shortgen/db';

const TIER_ORDER = { free: 0, basic: 1, pro: 2, business: 3 } as const;

function tierRank(id: string): number {
  return (TIER_ORDER as Record<string, number>)[id] ?? -1;
}

const TIER_FEATURES: Record<string, string[]> = {
  free: [
    `${SIGNUP_CREDITS} signup credits`,
    "AI scripting & voiceover",
    "Basic image quality",
    "Script edits",
    "Export to video",
  ],
  basic: [
    `${TIER_CREDIT_ALLOWANCE.basic.toLocaleString()} credits/month`,
    "Full-quality images & models",
    "AI scripting & voiceover",
    "Unlimited script edits",
    "Image regeneration",
    "Export to video",
  ],
  pro: [
    `${TIER_CREDIT_ALLOWANCE.pro.toLocaleString()} credits/month`,
    "Full-quality images & models",
    "AI scripting & voiceover",
    "Unlimited script edits",
    "Image regeneration",
    "Export to video",
    "Priority support",
  ],
  business: [
    `${TIER_CREDIT_ALLOWANCE.business.toLocaleString()} credits/month`,
    "Full-quality images & models",
    "AI scripting & voiceover",
    "Unlimited script edits",
    "Image regeneration",
    "Export to video",
    "Priority support",
    "Dedicated account manager",
  ],
};

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: null,
    description: "For trying out the platform",
    features: TIER_FEATURES.free ?? [],
    popular: false,
  },
  {
    id: "basic",
    name: TIER_NAMES.basic,
    price: `$${(TIER_PRICE_CENTS.basic / 100).toFixed(0)}`,
    period: "/mo",
    description: "For creators getting started",
    features: TIER_FEATURES.basic ?? [],
    popular: false,
  },
  {
    id: "pro",
    name: TIER_NAMES.pro,
    price: `$${(TIER_PRICE_CENTS.pro / 100).toFixed(0)}`,
    period: "/mo",
    description: "For serious content creators",
    features: TIER_FEATURES.pro ?? [],
    popular: true,
  },
  {
    id: "business",
    name: TIER_NAMES.business,
    price: `$${(TIER_PRICE_CENTS.business / 100).toFixed(0)}`,
    period: "/mo",
    description: "For teams and agencies",
    features: TIER_FEATURES.business ?? [],
    popular: false,
  },
] as const;

function PricingCard({
  plan,
  session,
  currentTier,
  onUpgrade,
  isUpgrading,
}: {
  plan: (typeof PLANS)[number];
  session: ReturnType<typeof useSession>["data"];
  currentTier: string;
  onUpgrade: (priceId: "basic" | "pro" | "business") => void;
  isUpgrading: boolean;
}) {
  const planRank = tierRank(plan.id);
  const userRank = tierRank(currentTier);
  const isCheaper = planRank < userRank;
  const isCurrent = plan.id === currentTier;
  const isUpgrade = planRank > userRank && plan.id !== "free";

  let cta: React.ReactNode;
  if (!session) {
    cta = (
      <Button
        variant={plan.popular ? "default" : "outline"}
        className="w-full"
        onClick={() => void signIn()}
      >
        Get started
      </Button>
    );
  } else if (isCurrent) {
    cta = (
      <Button variant="outline" className="w-full" disabled>
        Current plan
      </Button>
    );
  } else if (isCheaper) {
    cta = (
      <Link href="/billing">
        <Button variant="ghost" className="w-full text-muted-foreground">
          Manage in billing
        </Button>
      </Link>
    );
  } else {
    cta = (
      <Button
        variant={plan.popular ? "default" : "outline"}
        className="w-full"
        onClick={() => onUpgrade(plan.id as "basic" | "pro" | "business")}
        disabled={isUpgrading}
      >
        {userRank > 0 && isUpgrade ? "Upgrade" : "Subscribe"}
      </Button>
    );
  }

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        plan.popular &&
        "overflow-visible border-primary shadow-lg shadow-primary/10 ring-2 ring-primary",
        isCheaper && "opacity-60",
      )}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge>Most popular</Badge>
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          {plan.name}
        </CardTitle>
        <CardDescription>{plan.description}</CardDescription>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
          {plan.period && (
            <span className="text-muted-foreground">{plan.period}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pt-0">
        <ul className="space-y-2.5">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="pt-4">{cta}</CardFooter>
    </Card>
  );
}

export default function PricingPage() {
  const { data: session, status } = useSession();
  const { tier: currentTier } = useUserConfig();
  const createCheckout = api.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        Loading…
      </div>
    );
  }

  const handleUpgrade = (priceId: "basic" | "pro" | "business") => {
    createCheckout.mutate({
      priceId,
      successUrl: `${baseUrl}/billing?success=true`,
      cancelUrl: `${baseUrl}/pricing`,
    });
  };

  return (
    <>
      <Head>
        <title>Pricing | Shortgen</title>
        <meta
          name="description"
          content="Plans and pricing for Shortgen. Create short videos from your content."
        />
      </Head>
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Simple, transparent pricing
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Start free with {SIGNUP_CREDITS} credits. Upgrade when you need
              more.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                session={session}
                currentTier={session ? currentTier : "free"}
                onUpgrade={handleUpgrade}
                isUpgrading={createCheckout.isPending}
              />
            ))}
          </div>

          <div className="mx-auto mt-16 max-w-5xl">
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Buy credits</CardTitle>
                <CardDescription>
                  Need more credits without a subscription? Purchase a one-time
                  pack.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BuyCreditsForm
                  successUrl={`${baseUrl}/billing?success=true`}
                  cancelUrl={`${baseUrl}/pricing`}
                  session={session}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
