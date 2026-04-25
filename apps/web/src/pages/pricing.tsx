"use client";

import Head from 'next/head';
import { PricingSection } from "~/components/billing/PricingSection";

export default function PricingPage() {
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
        <PricingSection cancelPath="/pricing" />
      </main>
    </>
  );
}
