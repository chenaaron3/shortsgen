"use client";

import { index } from 'drizzle-orm/gel-core';
import {
    AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring
} from 'framer-motion';
import { Download, Sparkles, UserRoundCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

import {
    LANDING_SCRUB_STEPS, SCRUB_BREAKDOWN_CLIPS, SCRUB_BREAKDOWN_SOURCE, SCRUB_SCRIPT_BODY,
    SCRUB_SCRIPT_HOOK
} from './landingPreviewData';

const STEP_COUNT = LANDING_SCRUB_STEPS.length;
const PHONE_FRAME_CLASS =
  "aspect-[9/16] w-full overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-2xl shadow-black/35";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizedStepProgress(value: number, stepIndex: number) {
  return clamp01(value * STEP_COUNT - stepIndex);
}

function MobilePreviewCard() {
  return (
    <div className={PHONE_FRAME_CLASS}>
      <div className="relative h-full w-full overflow-hidden bg-linear-to-b from-slate-900 via-indigo-950/90 to-slate-950 p-5">
        <div className="absolute inset-0 opacity-35">
          <div className="absolute -top-10 left-4 h-28 w-28 rounded-full bg-cyan-400/35 blur-2xl" />
          <div className="absolute bottom-6 right-4 h-24 w-24 rounded-full bg-fuchsia-400/35 blur-2xl" />
        </div>
        <div className="relative flex h-full flex-col justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="bg-black/40 text-[11px] text-white">
              Shorts Preview
            </Badge>
            <p className="max-w-[85%] text-sm font-semibold text-white">
              Stop wasting 6 hours on one short.
            </p>
          </div>
          <div className="space-y-3 rounded-2xl border border-white/20 bg-black/35 p-3">
            <div className="flex items-center justify-between text-xs text-white/80">
              <span>Generate</span>
              <span>100%</span>
            </div>
            <div className="h-2 rounded-full bg-white/20">
              <div className="h-full w-full rounded-full bg-emerald-300" />
            </div>
            <div className="flex items-center justify-end text-white">
              <Download className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VerticalScrubSection() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const smoothProgress = useSpring(scrollYProgress, {
    damping: 28,
    stiffness: 180,
    mass: 0.24,
  });
  const [scrubState, setScrubState] = useState({
    global: 0,
    step1: 0,
    step2: 0,
    step3: 0,
    step4: 0,
    activeStep: 0,
    typedChars: 0,
    exportPercent: 0,
  });

  const scriptTarget = `${SCRUB_SCRIPT_HOOK}\n${SCRUB_SCRIPT_BODY}`;
  useMotionValueEvent(smoothProgress, "change", (latest) => {
    const global = clamp01(latest);
    const step1 = normalizedStepProgress(global, 0);
    const step2 = normalizedStepProgress(global, 1);
    const step3 = normalizedStepProgress(global, 2);
    const step4 = normalizedStepProgress(global, 3);
    const nextActive = Math.min(
      STEP_COUNT - 1,
      Math.max(0, Math.floor(global * STEP_COUNT)),
    );

    setScrubState({
      global,
      step1,
      step2,
      step3,
      step4,
      activeStep: nextActive,
      typedChars: Math.floor(scriptTarget.length * step2),
      exportPercent: Math.round(step4 * 100),
    });
  });

  const typedDisplay = scriptTarget.slice(0, scrubState.typedChars);
  const typedParts = typedDisplay.split("\n");
  const verifyHighlightAlpha = 0.38 * scrubState.step3;
  const verifyOpacity = 0.45 + scrubState.step3 * 0.55;
  const exportLayerOpacity = scrubState.step4;
  const clipTargets = [
    { x: -68, y: -82, rotate: -8 },
    { x: 70, y: -76, rotate: 6 },
    { x: -78, y: 4, rotate: -4 },
    { x: 74, y: 8, rotate: 5 },
    { x: -4, y: 88, rotate: -2 },
  ] as const;

  if (reduceMotion) {
    return (
      <section className="border-b border-border px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-2 inline-flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium uppercase tracking-wider">
                Scroll Narrative
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              One source, four visible transformations
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              The preview is simplified when reduced motion is enabled.
            </p>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-[320px_minmax(0,1fr)]">
            <MobilePreviewCard />
            <div className="space-y-4">
              {LANDING_SCRUB_STEPS.map((step, index) => (
                <Card key={step.id} className="border-border/80 bg-card/90">
                  <CardHeader>
                    <div className="mb-1 font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <CardTitle>{step.title}</CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="border-b border-border px-4 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-2 inline-flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium uppercase tracking-wider">
              Scroll Narrative
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            One source, four visible transformations
          </h2>
          <p className="mt-3 text-muted-foreground md:text-lg">
            Scroll to scrub each stage forward or backward in the same vertical
            Shorts preview.
          </p>
        </div>

        <div className="mt-10 md:hidden">
          <div className="mx-auto max-w-[340px]">
            <MobilePreviewCard />
          </div>
          <div className="mt-8 space-y-4">
            {LANDING_SCRUB_STEPS.map((step, index) => (
              <Card key={step.id} className="border-border/80 bg-card/90">
                <CardHeader>
                  <div className="mb-1 font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>

        <div
          className="relative mt-12 hidden md:block"
          style={{ minHeight: `${STEP_COUNT * 100}vh` }}
        >
          <div className="sticky top-24 h-[calc(100vh-8rem)]">
            <div className="grid h-full grid-cols-[minmax(0,1fr)_360px] items-center gap-8">
              <div className="relative">
                <div className="relative h-[300px] w-full max-w-[680px]">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={scrubState.activeStep}
                      className="absolute inset-x-0 top-1/2 -translate-y-1/2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.28,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      {(() => {
                        const index = scrubState.activeStep;
                        const step = LANDING_SCRUB_STEPS[index];
                        if (!step) return null;
                        return (
                          <Card
                            className={cn(
                              "w-full border-border/70 bg-card/86 backdrop-blur-[2px]",
                              "border-primary/60 bg-primary/6",
                            )}
                          >
                            <CardHeader>
                              <div className="mb-1 font-mono text-xs text-muted-foreground">
                                {String(index + 1).padStart(2, "0")}
                              </div>
                              <CardTitle className="text-2xl">{step.title}</CardTitle>
                              <CardDescription className="text-base leading-relaxed">
                                {step.description}
                              </CardDescription>
                            </CardHeader>
                          </Card>
                        );
                      })()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className={cn(PHONE_FRAME_CLASS, "w-[360px]")}>
                <div className="relative h-full w-full overflow-hidden bg-slate-950">
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      y: 18 - scrubState.global * 36,
                      background:
                        "radial-gradient(circle at 20% 20%, rgba(34,211,238,0.35), transparent 44%), radial-gradient(circle at 80% 82%, rgba(167,139,250,0.36), transparent 52%), linear-gradient(180deg, #0b1020 0%, #090d19 100%)",
                    }}
                  />
                  <motion.div
                    className="absolute inset-0 opacity-30"
                    style={{
                      y: 12 - scrubState.global * 24,
                      backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)",
                      backgroundSize: "52px 52px",
                    }}
                  />

                  <motion.div
                    className="absolute inset-0 p-5"
                    style={{ y: 8 - scrubState.global * 16 }}
                  >
                    <div className="relative flex h-full flex-col justify-between">
                      <Badge
                        variant="secondary"
                        className="w-fit bg-black/35 text-[11px] text-white"
                      >
                        Shorts Preview
                      </Badge>

                      <div className="relative mx-auto h-[56%] w-[88%]">
                        {scrubState.activeStep === 0 ? (
                          <>
                            <motion.div
                              className="absolute left-1/2 top-1/2 w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/20 bg-black/45 p-4 text-sm text-white/95"
                              style={{
                                opacity: 1 - scrubState.step1,
                                scale: 1 - scrubState.step1 * 0.07,
                              }}
                            >
                              {SCRUB_BREAKDOWN_SOURCE}
                            </motion.div>

                            {SCRUB_BREAKDOWN_CLIPS.map((label, index) => (
                              <motion.div
                                key={label}
                                className="absolute left-1/2 top-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-cyan-200/35 bg-cyan-400/18 p-2 text-[11px] font-medium text-cyan-50"
                                style={{
                                  x: scrubState.step1 * (clipTargets[index]?.x ?? 0),
                                  y: scrubState.step1 * (clipTargets[index]?.y ?? 0),
                                  rotate: scrubState.step1 * (clipTargets[index]?.rotate ?? 0),
                                  opacity: scrubState.step1 <= 0.15
                                    ? (scrubState.step1 / 0.15) * 0.7
                                    : 0.7 + ((scrubState.step1 - 0.15) / 0.85) * 0.3,
                                  scale: 0.9 + scrubState.step1 * 0.1,
                                }}
                              >
                                {label}
                              </motion.div>
                            ))}
                          </>
                        ) : null}

                        {scrubState.activeStep === 1 ? (
                          <motion.div
                            className="absolute inset-x-0 bottom-6 rounded-2xl border border-violet-200/30 bg-violet-400/12 p-4 text-left text-[13px] text-violet-50"
                            style={{
                              opacity: scrubState.step2,
                              y: 12 - scrubState.step2 * 12,
                            }}
                          >
                            <p className="font-semibold">
                              {typedParts[0] ?? ""}
                              <span
                                className={scrubState.typedChars < scriptTarget.length ? "inline" : "hidden"}
                              >
                                |
                              </span>
                            </p>
                            <p className="mt-2 text-violet-100/90">{typedParts[1] ?? ""}</p>
                          </motion.div>
                        ) : null}

                        {scrubState.activeStep === 2 ? (
                          <motion.div
                            className="absolute inset-x-2 top-5 rounded-xl border border-emerald-200/30 bg-black/35 p-3 text-[12px] text-white"
                            style={{ opacity: verifyOpacity }}
                          >
                            <div className="mb-2 flex items-center gap-2 text-emerald-300">
                              <motion.span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-300/20"
                                style={{
                                  scale: 0.9 + scrubState.step3 * 0.17,
                                }}
                              >
                                <UserRoundCheck className="h-3.5 w-3.5" />
                              </motion.span>
                              <span className="font-medium">Verified edits</span>
                            </div>
                            <p>
                              Stop wasting{" "}
                              <motion.span
                                style={{
                                  backgroundColor: `rgba(16,185,129,${verifyHighlightAlpha})`,
                                }}
                                className="rounded px-1"
                              >
                                hours
                              </motion.span>{" "}
                              on one short.
                            </p>
                            <p className="mt-1">
                              Turn one source into{" "}
                              <motion.span
                                style={{
                                  backgroundColor: `rgba(59,130,246,${0.36 * scrubState.step3})`,
                                }}
                                className="rounded px-1"
                              >
                                scenes and captions
                              </motion.span>{" "}
                              quickly.
                            </p>
                          </motion.div>
                        ) : null}

                        {scrubState.activeStep === 3 ? (
                          <motion.div
                            className="absolute inset-0"
                            style={{ opacity: exportLayerOpacity }}
                          >
                            <motion.div
                              className="absolute -left-10 top-4 h-32 w-32 rounded-3xl bg-amber-300/30 blur-2xl"
                              style={{ y: 10 - scrubState.step4 * 18 }}
                            />
                            <motion.div
                              className="absolute -right-8 bottom-12 h-36 w-36 rounded-3xl bg-fuchsia-300/30 blur-2xl"
                              style={{ y: 8 - scrubState.step4 * 20 }}
                            />
                          </motion.div>
                        ) : null}
                      </div>

                      {scrubState.activeStep === 3 ? (
                        <motion.div
                          className="rounded-2xl border border-white/20 bg-black/35 p-3"
                          style={{
                            opacity: 0.4 + scrubState.step4 * 0.6,
                            y: 8 - scrubState.step4 * 8,
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between text-xs text-white/85">
                            <span>Export progress</span>
                            <span>{scrubState.exportPercent}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/20">
                            <motion.div
                              className="h-full rounded-full bg-emerald-300"
                              style={{ width: `${scrubState.exportPercent}%` }}
                            />
                          </div>
                          <motion.div
                            className="mt-2 flex justify-end text-white"
                            style={{
                              opacity: scrubState.step4 <= 0.8
                                ? 0
                                : (scrubState.step4 - 0.8) / 0.2,
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </motion.div>
                        </motion.div>
                      ) : (
                        <div className="h-16" aria-hidden />
                      )}
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section >
  );
}
