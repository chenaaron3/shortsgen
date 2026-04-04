export type LandingScrubStep = {
  id: "breakdown" | "script" | "verify" | "export";
  title: string;
  description: string;
};

export const LANDING_SCRUB_STEPS: LandingScrubStep[] = [
  {
    id: "breakdown",
    title: "Breakdown",
    description:
      "Start from one source block, then split it into focused clips you can shape.",
  },
  {
    id: "script",
    title: "Create Script",
    description:
      "Refine into a hook and tight body copy that reads like a publish-ready short.",
  },
  {
    id: "verify",
    title: "Human Verify",
    description:
      "Stay in control: highlight edits, confirm changes, and lock your final phrasing.",
  },
  {
    id: "export",
    title: "Generate & Export",
    description:
      "Generate visuals, finalize assets, and export a vertical short in one flow.",
  },
];

export const SCRUB_BREAKDOWN_SOURCE =
  "Most creators lose hours turning one long source into short-form clips worth posting.";

export const SCRUB_BREAKDOWN_CLIPS = [
  "Clip 01: Hook",
  "Clip 02: Problem",
  "Clip 03: Shift",
  "Clip 04: Framework",
  "Clip 05: CTA",
];

export const SCRUB_SCRIPT_HOOK = "Stop wasting 6 hours on one short.";
export const SCRUB_SCRIPT_BODY =
  "Turn one source into scripted scenes, visuals, and captions in minutes.";

export const SCRUB_VERIFY_TEXT = [
  "Stop wasting hours on one short.",
  "Turn one source into scenes, visuals, and captions quickly.",
];

export const LANDING_PREVIEW_ASSET_BASE_URL =
  "/landing-preview/run-bb1af5f4-7ee0fd33";
