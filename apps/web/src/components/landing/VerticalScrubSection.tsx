"use client";

import {
  AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring
} from 'framer-motion';
import {
  CheckCircle2, Coins, FileText, Image, Mic, Play, Sparkles, UserRoundCheck, Youtube
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

import { LANDING_SCRUB_STEPS, SCRUB_BREAKDOWN_CLIPS } from './landingPreviewData';

const STEP_COUNT = LANDING_SCRUB_STEPS.length;
const STEP_COMPLETE_AT = 0.78;
const STEP_FADE_IN_END = 0.1;
const STEP_FADE_OUT_START = 0.94;
const PROGRESS_EPSILON = 0.002;
const REDDIT_ICON_SRC = "/icons/reddit.svg";
const PHONE_FRAME_CLASS =
  "aspect-[9/16] w-full overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-2xl shadow-black/35";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizedStepProgress(value: number, stepIndex: number) {
  return clamp01(value * STEP_COUNT - stepIndex);
}

function stepLayerVisibility(globalProgress: number, stepIndex: number) {
  const local = normalizedStepProgress(globalProgress, stepIndex);
  if (local < STEP_FADE_IN_END) {
    return local / STEP_FADE_IN_END;
  }
  if (local > STEP_FADE_OUT_START) {
    return (1 - local) / (1 - STEP_FADE_OUT_START);
  }
  return 1;
}

function stepAnimationProgress(globalProgress: number, stepIndex: number) {
  const local = normalizedStepProgress(globalProgress, stepIndex);
  return clamp01(local / STEP_COMPLETE_AT);
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
              AI Preview
            </Badge>
            <p className="max-w-[85%] text-sm font-semibold text-white">
              Source to upload in four clear stages.
            </p>
          </div>
          <div className="space-y-2 rounded-2xl border border-white/20 bg-black/35 p-3 text-[11px] text-white/90">
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
              <span>1. Identify clips</span>
              <span>Done</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
              <span>2. Script + verify</span>
              <UserRoundCheck className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
              <span>3. Generate assets</span>
              <span>92%</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-2 py-1.5">
              <span>4. Upload</span>
              <Coins className="h-3.5 w-3.5" />
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
  const scrubTrackRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: scrubTrackRef,
    offset: ["start start", "end end"],
  });
  const smoothProgress = useSpring(scrollYProgress, {
    damping: 36,
    stiffness: 140,
    mass: 0.32,
  });
  const [scrubState, setScrubState] = useState({
    global: 0,
    stage1: 0,
    stage2: 0,
    stage3: 0,
    stage4: 0,
    activeStep: 0,
    exportPercent: 0,
    assetsPercent: 0,
  });
  useMotionValueEvent(smoothProgress, "change", (latest) => {
    const global = clamp01(latest);
    const stage1 = stepAnimationProgress(global, 0);
    const stage2 = stepAnimationProgress(global, 1);
    const stage3 = stepAnimationProgress(global, 2);
    const stage4 = stepAnimationProgress(global, 3);
    const nextActive = Math.min(
      STEP_COUNT - 1,
      Math.max(0, Math.floor(global * STEP_COUNT)),
    );

    setScrubState((prev) => {
      const nextExportPercent = Math.round(stage4 * 100);
      const nextAssetsPercent = Math.round(stage3 * 100);
      const unchanged =
        Math.abs(prev.global - global) < PROGRESS_EPSILON
        && Math.abs(prev.stage1 - stage1) < PROGRESS_EPSILON
        && Math.abs(prev.stage2 - stage2) < PROGRESS_EPSILON
        && Math.abs(prev.stage3 - stage3) < PROGRESS_EPSILON
        && Math.abs(prev.stage4 - stage4) < PROGRESS_EPSILON
        && prev.activeStep === nextActive
        && prev.exportPercent === nextExportPercent
        && prev.assetsPercent === nextAssetsPercent;
      if (unchanged) return prev;
      return {
        global,
        stage1,
        stage2,
        stage3,
        stage4,
        activeStep: nextActive,
        exportPercent: nextExportPercent,
        assetsPercent: nextAssetsPercent,
      };
    });
  });
  const step2GenerateProgress = clamp01(scrubState.stage2 / 0.5);
  const step2VerifyProgress = clamp01((scrubState.stage2 - 0.5) / 0.5);
  const step3AppearProgress = clamp01(scrubState.stage3 / 0.42);
  const step3MergeProgress = clamp01((scrubState.stage3 - 0.42) / 0.32);
  const step3ShortReveal = clamp01((scrubState.stage3 - 0.62) / 0.38);
  const layerOpacities = LANDING_SCRUB_STEPS.map((_, index) =>
    stepLayerVisibility(scrubState.global, index),
  );
  const layer0 = layerOpacities[0] ?? 0;
  const layer1 = layerOpacities[1] ?? 0;
  const layer2 = layerOpacities[2] ?? 0;
  const layer3 = layerOpacities[3] ?? 0;
  const assetNodes = [
    { x: -90, y: -78, icon: Image, tone: "text-sky-100 border-sky-200/55 bg-sky-400/18" },
    { x: 92, y: -72, icon: Mic, tone: "text-violet-100 border-violet-200/55 bg-violet-400/18" },
    { x: -102, y: -8, icon: Image, tone: "text-sky-100 border-sky-200/55 bg-sky-400/18" },
    { x: 98, y: 4, icon: Mic, tone: "text-violet-100 border-violet-200/55 bg-violet-400/18" },
    { x: -76, y: 84, icon: Image, tone: "text-sky-100 border-sky-200/55 bg-sky-400/18" },
    { x: 80, y: 88, icon: Mic, tone: "text-violet-100 border-violet-200/55 bg-violet-400/18" },
  ] as const;
  const abstractDocumentRows = Array.from({ length: 8 });
  const abstractScriptRows = Array.from({ length: 16 });

  if (reduceMotion) {
    return (
      <section className="border-b border-border px-4 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-2 inline-flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium uppercase tracking-wider">
                Workflow preview
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              One source, four outcomes
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
              See how it works
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Generate shorts with one-click
          </h2>
          <p className="mt-3 text-muted-foreground md:text-lg">
            AI powers the entire process: identify clips, generate scripts, create assets, and edits the video.
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
          ref={scrubTrackRef}
          className="relative mt-12 hidden md:block"
          style={{ minHeight: `${STEP_COUNT * 140}vh` }}
        >
          <div className="sticky top-24 h-[calc(100vh-8rem)]">
            <div className="grid h-full grid-cols-[minmax(0,1fr)_360px] items-center gap-8">
              <div className="relative">
                <div className="relative h-[300px] w-full max-w-[680px]">
                  <AnimatePresence mode="sync" initial={false}>
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
                    <div className="relative flex h-full flex-col">
                      <div className="pointer-events-none absolute inset-x-0 top-12 z-30 flex justify-center">
                        <div className="px-1 text-center text-xl font-semibold tracking-wide text-white/95">
                          {LANDING_SCRUB_STEPS[scrubState.activeStep]?.title ?? "Workflow step"}
                        </div>
                      </div>

                      <div className="relative flex flex-1 items-center justify-center">
                        <div className="relative h-[56%] w-[88%] overflow-hidden">
                          <motion.div
                            className="absolute inset-0"
                            style={{
                              opacity: layer0,
                              y: (1 - layer0) * 10,
                            }}
                          >
                            <motion.div
                              className="absolute inset-x-0 top-0 z-20"
                              style={{
                                opacity: clamp01(scrubState.stage1 * 1.5),
                                y: 6 - clamp01(scrubState.stage1 * 1.5) * 6,
                              }}
                            >
                              <div className="relative mx-auto flex w-[86%] items-center justify-between">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-200/45 bg-red-400/18 text-red-100 shadow-[0_6px_20px_rgba(239,68,68,0.25)]">
                                  <Youtube className="h-5 w-5" />
                                </div>
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-orange-200/45 bg-orange-400/18 text-orange-100 shadow-[0_6px_20px_rgba(251,146,60,0.25)]">
                                  <img
                                    src={REDDIT_ICON_SRC}
                                    alt="Reddit"
                                    className="h-8 w-8 rounded-full object-contain"
                                  />
                                </div>
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200/45 bg-sky-400/18 text-sky-100 shadow-[0_6px_20px_rgba(56,189,248,0.25)]">
                                  <FileText className="h-5 w-5" />
                                </div>
                                <svg
                                  className="pointer-events-none absolute inset-x-0 top-9 h-12 w-full"
                                  viewBox="0 0 100 30"
                                  preserveAspectRatio="none"
                                  aria-hidden
                                >
                                  <path d="M10 1 C18 10, 26 16, 34 29" stroke="rgba(148,163,184,0.5)" strokeWidth="1.2" strokeDasharray="3 3" fill="none" />
                                  <path d="M50 1 C50 11, 50 18, 50 29" stroke="rgba(148,163,184,0.5)" strokeWidth="1.2" strokeDasharray="3 3" fill="none" />
                                  <path d="M90 1 C82 10, 74 16, 66 29" stroke="rgba(148,163,184,0.5)" strokeWidth="1.2" strokeDasharray="3 3" fill="none" />
                                </svg>
                              </div>
                            </motion.div>
                            <div className="absolute inset-x-0 top-[3.2rem] bottom-0 rounded-2xl border border-white/15 bg-slate-900/65 p-2.5 text-[11px] text-slate-100">
                              <div className="relative h-full overflow-hidden rounded-xl border border-white/10 bg-black/30 p-2.5">
                                <motion.div
                                  className="pointer-events-none absolute inset-x-3 h-px bg-cyan-200/90 shadow-[0_0_14px_rgba(34,211,238,0.85)]"
                                  style={{ y: scrubState.stage1 * 188 }}
                                />
                                <div className="space-y-1.5">
                                  {abstractDocumentRows.map((_, index) => {
                                    const rowProgress = clamp01(scrubState.stage1 * 2.1 - index * 0.13);
                                    return (
                                      <motion.div
                                        key={`abstract-row-${index}`}
                                        className="rounded-md border border-white/10 px-2 py-1.5"
                                        style={{
                                          backgroundColor: `rgba(34, 211, 238, ${0.05 + rowProgress * 0.22})`,
                                          borderColor: `rgba(103, 232, 249, ${0.22 + rowProgress * 0.5})`,
                                        }}
                                      >
                                        <div className="space-y-1">
                                          <div className="h-1.5 w-[58%] rounded-full bg-slate-200/70" />
                                          <div className="h-1.5 w-[36%] rounded-full bg-slate-200/45" />
                                        </div>
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </motion.div>

                          <motion.div
                            className="absolute inset-0"
                            style={{
                              opacity: layer1,
                              y: (1 - layer1) * 10,
                            }}
                          >
                            <motion.div
                              className="absolute inset-0 rounded-2xl border border-violet-200/35 bg-violet-400/12 p-4"
                              style={{
                                opacity: 0.2 + scrubState.stage2 * 0.82,
                                y: 8 - scrubState.stage2 * 8,
                              }}
                            >
                              <div className="h-full space-y-1.5 pt-11">
                                {abstractScriptRows.map((_, index) => {
                                  const rowReveal = clamp01(step2GenerateProgress * 2.2 - index * 0.12);
                                  return (
                                    <motion.div
                                      key={`script-row-${index}`}
                                      className="h-1.5 rounded-full bg-violet-100/80"
                                      style={{
                                        width: `${94 - (index % 5) * 10}%`,
                                        opacity: 0.14 + rowReveal * 0.86,
                                        scaleX: 0.25 + rowReveal * 0.75,
                                        transformOrigin: "left center",
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </motion.div>

                            <motion.div
                              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-100 drop-shadow-[0_0_10px_rgba(16,185,129,0.8)]"
                              style={{
                                opacity: step2VerifyProgress,
                                scale: 0.65 + step2VerifyProgress * 0.35,
                              }}
                            >
                              <CheckCircle2 className="h-14 w-14 stroke-[2.5]" />
                            </motion.div>
                          </motion.div>

                          <motion.div
                            className="absolute inset-0"
                            style={{
                              opacity: layer2,
                              y: (1 - layer2) * 10,
                            }}
                          >
                            <div className="absolute inset-0 rounded-2xl border border-white/15 bg-slate-900/58 p-3">
                              <div className="mb-2 flex items-center justify-between text-[11px] text-white/90">
                                <span></span>
                                <span>{scrubState.assetsPercent}%</span>
                              </div>

                              <div className="relative h-[180px]">
                                {assetNodes.map((node, index) => {
                                  const pop = clamp01(step3AppearProgress * 1.8 - index * 0.12);
                                  const merge = step3MergeProgress;
                                  const NodeIcon = node.icon;
                                  return (
                                    <motion.div
                                      key={`${node.x}-${node.y}-${index}`}
                                      className={cn(
                                        "absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border",
                                        node.tone,
                                      )}
                                      style={{
                                        x: node.x * (1 - merge),
                                        y: node.y * (1 - merge),
                                        opacity: pop * (1 - merge * 0.7) * (1 - step3ShortReveal),
                                        scale: 0.74 + pop * 0.26,
                                      }}
                                    >
                                      <NodeIcon className="h-4 w-4" />
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>

                          <motion.div
                            className="absolute inset-0"
                            style={{
                              opacity: layer3,
                              y: (1 - layer3) * 10,
                            }}
                          >
                            <div className="absolute inset-0 rounded-2xl border border-white/15 bg-slate-900/55 p-3 text-white">
                              <div className="relative mx-auto h-full w-full">
                                <motion.div
                                  className="absolute left-1/2 top-3 -translate-x-1/2 text-slate-100"
                                  style={{ opacity: 0.5 + scrubState.stage4 * 0.5 }}
                                >
                                  <Youtube className="h-8 w-8" />
                                </motion.div>

                                <div className="absolute left-1/2 top-10 h-[110px] w-px -translate-x-1/2 border-l border-dashed border-white/30" />

                              </div>
                            </div>
                          </motion.div>
                          <AnimatePresence mode="sync" initial={false}>
                            {scrubState.stage4 < 0.02 ? (
                              <motion.div
                                key="assembled-short"
                                className="absolute left-1/2 top-1/2 z-30 aspect-9/16 h-[144px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/22 bg-black/45 px-2 py-2 text-center text-white"
                                style={{
                                  opacity: step3ShortReveal * layer2,
                                  scale: 0.9 + step3ShortReveal * 0.1,
                                }}
                              >
                                <Play className="mx-auto mt-12 h-4 w-4" />
                                <div className="mt-2 text-[11px]">Short</div>
                              </motion.div>
                            ) : (
                              <motion.div
                                key="ready-short"
                                className="absolute left-1/2 top-[9.1rem] z-30 aspect-9/16 h-[144px] -translate-x-1/2 rounded-xl border border-white/25 bg-black/45 px-2 py-2 text-center text-white"
                                style={{
                                  y: -scrubState.stage4 * 118,
                                  opacity: (0.45 + scrubState.stage4 * 0.55) * layer3,
                                  scale: 0.94 + scrubState.stage4 * 0.06,
                                }}
                              >
                                <Play className="mx-auto mt-12 h-4 w-4" />
                                <div className="mt-2 text-[11px]">Short</div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <motion.div
                        className="grid grid-cols-4 gap-2 rounded-2xl border border-white/20 bg-black/35 p-2"
                        style={{
                          opacity: 0.55 + scrubState.global * 0.45,
                          y: 8 - scrubState.global * 8,
                        }}
                      >
                        {LANDING_SCRUB_STEPS.map((step, index) => (
                          <div
                            key={step.id}
                            className={cn(
                              "rounded-md px-1.5 py-1 text-center text-[10px] text-white/70",
                              scrubState.activeStep === index && "bg-white/10 text-white",
                            )}
                          >
                            {index + 1}
                          </div>
                        ))}
                      </motion.div>
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
