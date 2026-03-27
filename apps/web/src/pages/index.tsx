"use client";

import { useSession } from "next-auth/react";
import Head from "next/head";

import { LandingPage } from "~/components/landing/LandingPage";
import { RunList } from "~/components/list/RunList";

function DashboardPage() {
  return (
    <>
      <Head>
        <title>Your Runs | Shortgen</title>
        <meta
          name="description"
          content="Create faceless short videos from your content"
        />
      </Head>
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-8 text-2xl font-bold">Your Runs</h1>
          <RunList />
        </div>
      </main>
    </>
  );
}

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        Loading…
      </div>
    );
  }

  return session ? <DashboardPage /> : <LandingPage />;
}
