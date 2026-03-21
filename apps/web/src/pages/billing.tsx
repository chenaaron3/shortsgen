"use client";

import { useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { BuyCreditsForm } from "~/components/billing/BuyCreditsForm";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useUserConfig } from "~/hooks/useUserConfig";
import { api } from "~/utils/api";

import { formatTierPrice } from "@shortgen/db";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  business: "Business",
};

export default function BillingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { creditsBalance, tier, isLoading } = useUserConfig();
  const { data: sub } = api.billing.getSubscription.useQuery();
  const createCheckout = api.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });
  const createPortal = api.billing.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const success = router.query.success === "true";

  if (status === "loading" || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p>Sign in to manage billing.</p>
        <Link href="/">Back</Link>
      </div>
    );
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <Head>
        <title>Billing | Shortgen</title>
      </Head>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="mb-6 inline-block text-muted-foreground hover:text-foreground">
            ← Back
          </Link>

          {success && (
            <div className="mb-6 rounded-md border border-green-600/50 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
              Payment successful. Credits have been added to your account.
            </div>
          )}

          <h1 className="mb-8 text-2xl font-bold">Billing</h1>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Credit balance</CardTitle>
              <CardDescription>
                Use credits to create and refine videos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{creditsBalance}</p>
              <p className="mt-1 text-sm text-muted-foreground">credits</p>
              <BuyCreditsForm
                successUrl={`${baseUrl}/billing?success=true`}
                cancelUrl={`${baseUrl}/billing`}
                session={session}
                className="mt-4"
              />
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Plan</CardTitle>
              <CardDescription>Current plan: {TIER_LABELS[tier] ?? tier}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sub?.currentPeriodEnd && (
                <p className="text-sm text-muted-foreground">
                  Renews: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              {tier !== "free" ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    createPortal.mutate({
                      returnUrl: `${baseUrl}/billing`,
                    })
                  }
                  disabled={createPortal.isPending}
                >
                  Manage subscription
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Upgrade for better models, image editing, and more credits.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        createCheckout.mutate({
                          priceId: "basic",
                          successUrl: `${baseUrl}/billing?success=true`,
                          cancelUrl: `${baseUrl}/billing`,
                        })
                      }
                      disabled={createCheckout.isPending}
                    >
                      {formatTierPrice("basic")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        createCheckout.mutate({
                          priceId: "pro",
                          successUrl: `${baseUrl}/billing?success=true`,
                          cancelUrl: `${baseUrl}/billing`,
                        })
                      }
                      disabled={createCheckout.isPending}
                    >
                      {formatTierPrice("pro")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        createCheckout.mutate({
                          priceId: "business",
                          successUrl: `${baseUrl}/billing?success=true`,
                          cancelUrl: `${baseUrl}/billing`,
                        })
                      }
                      disabled={createCheckout.isPending}
                    >
                      {formatTierPrice("business")}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {(createCheckout.isError || createPortal.isError) && (
            <p className="text-destructive">
              {(createCheckout.error ?? createPortal.error)?.message}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
