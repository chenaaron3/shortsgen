"use client";

import { motion, useReducedMotion } from 'framer-motion';
import { Clapperboard, MousePointerClick, Share2, Sparkles, UserRoundCheck } from 'lucide-react';
import { signIn } from 'next-auth/react';
import Head from 'next/head';
import Link from 'next/link';
import { ComponentProps, type, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { SHORTGEN_PENDING_SOURCE_KEY } from '~/constants/pendingSource';
import { cn } from '~/lib/utils';

import { SIGNUP_CREDITS } from '@shortgen/db';

const STEPS = [
  {
    step: 1,
    title: "Paste or link",
    description:
      "Drop a YouTube URL, article link, or your own text—we’ll take it from there.",
    icon: MousePointerClick,
  },
  {
    step: 2,
    title: "One click to start",
    description:
      "Create kicks off scripting and scene breakdown automatically.",
    icon: Sparkles,
  },
  {
    step: 3,
    title: "Review before assets",
    description:
      "Refine scripts and scenes while you’re in the loop—then images and voice run.",
    icon: UserRoundCheck,
  },
  {
    step: 4,
    title: "Export & share",
    description: "Download or push to the platforms you use.",
    icon: Share2,
  },
] as const;

const heroContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.06 },
  },
};

const heroItem = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 380, damping: 28 },
  },
};

const sectionView = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 26 },
  },
};

const stepsParent = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.08 },
  },
};

const stepCard = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 26 },
  },
};

export function LandingPage() {
  const [heroInput, setHeroInput] = useState("");
  const reduceMotion = useReducedMotion();

  const handleGetStarted = () => {
    const v = heroInput.trim();
    if (!v) return;
    sessionStorage.setItem(SHORTGEN_PENDING_SOURCE_KEY, v);
    void signIn("google", { callbackUrl: "/create" });
  };

  const scrollMotion = reduceMotion
    ? {}
    : ({
      initial: "hidden" as const,
      whileInView: "show" as const,
      viewport: { once: true, amount: 0.22 },
      variants: sectionView,
    } satisfies ComponentProps<typeof motion.div>);

  const stepsMotion = reduceMotion
    ? {}
    : ({
      initial: "hidden" as const,
      whileInView: "show" as const,
      viewport: { once: true, amount: 0.18 },
      variants: stepsParent,
    } satisfies ComponentProps<typeof motion.div>);

  return (
    <>
      <Head>
        <title>Shortgen | One-click shorts from links or text</title>
        <meta
          name="description"
          content="Start from a YouTube link, blog URL, or your own text. One click creates your draft—review scripts and scenes before images and voice."
        />
      </Head>
      <main className="relative min-h-screen overflow-x-hidden bg-background">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-15%,oklch(0.55_0.14_230_/_0.28),transparent_58%)]" />
          <div className="absolute right-[-20%] top-1/4 h-[420px] w-[420px] rounded-full bg-primary/12 blur-[100px]" />
          <div className="absolute bottom-0 left-[-15%] h-[360px] w-[360px] rounded-full bg-chart-3/15 blur-[90px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(oklch(0.98 0 0 / 0.14) 1px, transparent 1px),
                linear-gradient(90deg, oklch(0.98 0 0 / 0.14) 1px, transparent 1px)`,
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        {/* Hero */}
        <section className="border-b border-border px-4 pb-20 pt-20 md:pb-28 md:pt-28">
          {reduceMotion ? (
            <div className="mx-auto max-w-6xl">
              <div className="mx-auto max-w-3xl text-center">
                <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
                  <Badge variant="secondary">One-click start</Badge>
                  <Badge variant="outline" className="border-primary/35">
                    Human in the loop
                  </Badge>
                </div>
                <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-[3.25rem] lg:leading-tight">
                  Shorts from a link, article, or your text—
                  <span className="text-primary"> you stay in control</span>
                </h1>
                <p className="mt-5 text-lg text-muted-foreground md:text-xl">
                  Paste a YouTube or blog URL, or write your own. One click
                  begins the pipeline; you review scripts and scenes before
                  images and voice ship.
                </p>
                <div className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-stretch">
                  <Input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    placeholder="YouTube or article URL, or paste your text..."
                    value={heroInput}
                    onChange={(e) => setHeroInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleGetStarted();
                    }}
                    className="h-11 flex-1 px-3 text-base"
                  />
                </div>
                <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    size="lg"
                    className="min-w-[180px]"
                    disabled={!heroInput.trim()}
                    onClick={handleGetStarted}
                  >
                    Get started
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <motion.div
              className="mx-auto max-w-6xl"
              variants={heroContainer}
              initial="hidden"
              animate="show"
            >
              <div className="mx-auto max-w-3xl text-center">
                <motion.div
                  className="mb-5 flex flex-wrap items-center justify-center gap-2"
                  variants={heroItem}
                >
                  <Badge variant="secondary">One-click start</Badge>
                  <Badge variant="outline" className="border-primary/35">
                    Human in the loop
                  </Badge>
                </motion.div>
                <motion.h1
                  className="text-4xl font-bold tracking-tight md:text-5xl lg:text-[3.25rem] lg:leading-tight"
                  variants={heroItem}
                >
                  Shorts from a link, article, or your text—
                  <span className="text-primary"> you stay in control</span>
                </motion.h1>
                <motion.p
                  className="mt-5 text-lg text-muted-foreground md:text-xl"
                  variants={heroItem}
                >
                  Paste a YouTube or blog URL, or write your own. One click
                  begins the pipeline; you review scripts and scenes before
                  images and voice ship.
                </motion.p>
                <motion.div
                  className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-stretch"
                  variants={heroItem}
                >
                  <Input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    placeholder="YouTube or article URL, or paste your text..."
                    value={heroInput}
                    onChange={(e) => setHeroInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleGetStarted();
                    }}
                    className="h-11 flex-1 px-3 text-base"
                  />
                </motion.div>
                <motion.div
                  className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row"
                  variants={heroItem}
                >
                  <Button
                    size="lg"
                    className="min-w-[180px]"
                    disabled={!heroInput.trim()}
                    onClick={handleGetStarted}
                  >
                    Get started
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </section>

        {/* Value split */}
        <section className="border-b border-border px-4 py-16 md:py-24">
          <motion.div
            className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2 md:gap-10"
            {...scrollMotion}
          >
            <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <MousePointerClick className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">Fast to start</CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  Go from a single field to a working draft. Links and pasted
                  text both flow into the same pipeline—no extra tooling.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <UserRoundCheck className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">You approve what ships</CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  Human-in-the-loop review means you adjust scripts and scenes
                  before we burn credits on imagery and voice—quality without
                  surprises.
                </CardDescription>
              </CardHeader>
            </Card>
          </motion.div>
        </section>

        {/* How it works */}
        <section className="border-b border-border px-4 py-16 md:py-24">
          <div className="mx-auto max-w-6xl">
            <motion.div
              className="mx-auto max-w-2xl text-center"
              {...scrollMotion}
            >
              <div className="mb-2 inline-flex items-center gap-2 text-primary">
                <Clapperboard className="h-5 w-5" aria-hidden />
                <span className="text-sm font-medium uppercase tracking-wider">
                  Workflow
                </span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                How it works
              </h2>
              <p className="mt-3 text-muted-foreground md:text-lg">
                Four steps from idea to export—with a clear checkpoint for your
                review.
              </p>
            </motion.div>
            <motion.div
              className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
              {...stepsMotion}
            >
              {STEPS.map((item) =>
                reduceMotion ? (
                  <div key={item.step}>
                    <Card className="h-full border-border/80 bg-card/90">
                      <CardHeader>
                        <div className="mb-1 font-mono text-xs text-muted-foreground">
                          {String(item.step).padStart(2, "0")}
                        </div>
                        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {item.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </div>
                ) : (
                  <motion.div key={item.step} variants={stepCard}>
                    <Card className="h-full border-border/80 bg-card/90">
                      <CardHeader>
                        <div className="mb-1 font-mono text-xs text-muted-foreground">
                          {String(item.step).padStart(2, "0")}
                        </div>
                        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {item.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </motion.div>
                ),
              )}
            </motion.div>
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="px-4 py-16 md:py-24">
          <motion.div
            className="mx-auto max-w-2xl"
            {...scrollMotion}
          >
            <Card className="overflow-hidden border-primary/25 bg-gradient-to-b from-card to-primary/5 shadow-lg shadow-primary/5">
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
                <Link
                  href="/pricing"
                  className={cn(buttonVariants({ variant: "default", size: "lg" }))}
                >
                  View pricing
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </main>
    </>
  );
}
