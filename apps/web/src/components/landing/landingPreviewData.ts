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
      "Start by entering a YouTube video, Reddit post, or custom text. Our AI will split that source into focused clips.",
  },
  {
    id: "scriptVerify",
    title: "Generate Script + Verify",
    description:
      "Then our AI will generate a draft script for you. You can review and approve it before moving forward.",
  },
  {
    id: "assets",
    title: "Generate Assets with AI",
    description:
      "Lastly, we will automatically generate the visuals and voiceover to create your short.",
  },
  {
    id: "upload",
    title: "Upload",
    description:
      "Export and publish your short to YouTube or TikTok, and start growing your channel.",
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
