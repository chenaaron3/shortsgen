import type { RunPhase } from "~/components/edit/RunProgressSteps";

/** Video is in (or entering) asset pipeline where images/voice are expected for scenes. */
export function expectsSceneAssetsForVideo(
  runPhase: RunPhase,
  videoStatus: string | null | undefined,
): boolean {
  if (runPhase !== "asset_gen" && runPhase !== "export") return false;
  if (!videoStatus || videoStatus === "failed") return false;
  return (
    videoStatus === "scripts" ||
    videoStatus === "assets" ||
    videoStatus === "exported" ||
    videoStatus === "exporting"
  );
}
