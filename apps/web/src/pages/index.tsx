"use client";

import { signIn, useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { FileText, Share2, Sparkles } from "lucide-react";

import { RunList } from "~/components/list/RunList";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { SIGNUP_CREDITS } from "@shortgen/db";

const STEPS = [
  {
    step: 1,
    title: "Paste content",
    description: "Add your article, transcript, or script.",
    icon: FileText,
  },
  {
    step: 2,
    title: "AI adapts it",
    description: "Scripting, imagery, and voiceover generated automatically.",
    icon: Sparkles,
  },
  {
    step: 3,
    title: "Export & share",
    description: "Download or export to your platforms.",
    icon: Share2,
  },
] as const;

function LandingPage() {
  return (
    <>
      <Head>
        <title>Shortgen | Create Short Videos from Your Content</title>
        <meta
          name="description"
          content="Turn long-form content into faceless short videos. AI-powered scripting, imagery, and voiceover."
        />
      </Head>
      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="border-b border-border px-4 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              AI-powered short videos
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Turn your content into short videos
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              AI-powered scripting, imagery, and voiceover. Paste your text and
              get faceless shorts in minutes.
            </p>
            <Button size="lg" className="mt-8" onClick={() => void signIn()}>
              Get started
            </Button>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b border-border px-4 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">
                How it works
              </h2>
              <p className="mt-2 text-muted-foreground">
                Three simple steps to create short-form content at scale.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {STEPS.map((item) => (
                <Card key={item.step}>
                  <CardHeader>
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="px-4 py-16 md:py-24">
          <div className="mx-auto max-w-2xl">
            <Card className="overflow-hidden bg-card">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-semibold">
                  Simple, transparent pricing
                </CardTitle>
                <CardDescription className="text-base">
                  Start free with {SIGNUP_CREDITS} signup credits. Upgrade when
                  you need more.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center pb-8">
                <Link href="/pricing">
                  <Button size="lg">View pricing</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </>
  );
}

function DashboardPage() {
  return (
    <>
      <Head>
        <title>Your Runs | Shortgen</title>
        <meta name="description" content="Create faceless short videos from your content" />
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
