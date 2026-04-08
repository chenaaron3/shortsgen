export type LandingScrubStep = {
  id: "clips" | "scriptVerify" | "assets" | "upload";
  title: string;
  description: string;
};

export const LANDING_SCRUB_STEPS: LandingScrubStep[] = [
  {
    id: "clips",
    title: "Identify Clips",
    description:
      "Split one source into focused clips you can turn into consistent posts.",
  },
  {
    id: "scriptVerify",
    title: "Generate Script + Verify",
    description:
      "Generate draft copy fast, then scan and approve it before moving forward.",
  },
  {
    id: "assets",
    title: "Generate Assets with AI",
    description:
      "Create visuals and voiceover from the approved script in one step.",
  },
  {
    id: "upload",
    title: "Upload",
    description:
      "Export and publish quickly so your channel can grow and monetize consistently.",
  },
];

export const SCRUB_BREAKDOWN_SOURCE =
  "Long-form source in. Scan each section and mark the exact moments worth turning into short clips.";

export const SCRUB_BREAKDOWN_CLIPS = [
  "Clip 01: Hook",
  "Clip 02: Problem",
  "Clip 03: Shift",
  "Clip 04: Framework",
  "Clip 05: CTA",
];

export const SCRUB_SCRIPT_HOOK = "Stop wasting 6 hours on one short.";
export const SCRUB_SCRIPT_BODY =
  "Generate a concise script from the selected highlight, then verify quality before producing assets.";

export const SCRUB_VERIFY_TEXT = [
  "Hook is clear and on-brand.",
  "Script approved for asset generation.",
];

export const LANDING_PREVIEW_ASSET_BASE_URL =
  "/landing-preview/run-bb1af5f4-7ee0fd33";
