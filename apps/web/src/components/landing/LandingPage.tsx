"use client";

import { motion, useReducedMotion } from 'framer-motion';
import { MousePointerClick, UserRoundCheck } from 'lucide-react';
import { signIn } from 'next-auth/react';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button, buttonVariants } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Button as MovingBorderButton } from '~/components/ui/moving-border';
import { SHORTGEN_PENDING_SOURCE_KEY } from '~/constants/pendingSource';
import { cn } from '~/lib/utils';

import { SIGNUP_CREDITS } from '@shortgen/db';

import { HeroRemotionPreview } from './HeroRemotionPreview';
import { VerticalScrubSection } from './VerticalScrubSection';

import type { ComponentProps } from 'react';

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

  const heroMotion = reduceMotion
    ? {}
    : ({
      initial: "hidden" as const,
      animate: "show" as const,
      variants: heroContainer,
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
      <main className="relative min-h-screen overflow-x-clip bg-background">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-15%,oklch(0.55_0.14_230/0.28),transparent_58%)]" />
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
          <motion.div className="mx-auto max-w-6xl" {...heroMotion}>
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="text-center lg:text-left">
                <motion.h1
                  className="text-4xl font-bold tracking-tight md:text-5xl lg:text-[3.25rem] lg:leading-tight"
                  variants={reduceMotion ? undefined : heroItem}
                >
                  Shorts from a link, article, or your text—
                  <span className="text-primary"> you stay in control</span>
                </motion.h1>
                <motion.p
                  className="mt-5 text-lg text-muted-foreground md:text-xl lg:max-w-2xl"
                  variants={reduceMotion ? undefined : heroItem}
                >
                  Paste a YouTube or blog URL, or write your own. One click
                  begins the pipeline; you review scripts and scenes before
                  images and voice ship.
                </motion.p>
                <motion.div
                  className="mx-auto mt-8 w-full max-w-xl lg:mx-0"
                  variants={reduceMotion ? undefined : heroItem}
                >
                  <div className="relative flex items-center rounded-xl border border-input bg-background/70 p-1 shadow-xs">
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
                      className="h-11 flex-1 border-0 bg-transparent px-3 text-base shadow-none focus-visible:ring-0"
                    />
                    <div className="relative">
                      {reduceMotion ? (
                        <Button
                          size="lg"
                          className="h-11 min-w-[170px] rounded-lg"
                          disabled={!heroInput.trim()}
                          onClick={handleGetStarted}
                        >
                          Get started
                        </Button>
                      ) : (
                        <MovingBorderButton
                          duration={2200}
                          borderRadius="0.62rem"
                          disabled={!heroInput.trim()}
                          onClick={handleGetStarted}
                          containerClassName="h-11 min-w-[170px] w-auto"
                          className="h-full w-full rounded-[calc(var(--radius)-2px)] border-border bg-primary text-primary-foreground text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
                          borderClassName="bg-[radial-gradient(oklch(0.8_0.15_240)_35%,transparent_65%)] opacity-90"
                        >
                          Get started
                        </MovingBorderButton>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>

              <motion.div
                variants={reduceMotion ? undefined : heroItem}
                className="mx-auto w-full max-w-[380px]"
              >
                <HeroRemotionPreview />
              </motion.div>
            </div>
          </motion.div>
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
            <Card className="border-primary/20 bg-linear-to-br from-card to-primary/5">
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

        <VerticalScrubSection />

        {/* Pricing CTA */}
        <section className="px-4 py-16 md:py-24">
          <motion.div
            className="mx-auto max-w-2xl"
            {...scrollMotion}
          >
            <Card className="overflow-hidden border-primary/25 bg-linear-to-b from-card to-primary/5 shadow-lg shadow-primary/5">
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
