import { eq } from "drizzle-orm";
import { env } from "~/env";

import { runs, videos } from "@shortgen/db";

export type Db = typeof import("~/server/db").db;

/**
 * Trigger Remotion Lambda render for one or more videos. Updates run status to "export"
 * and each video to "exporting". Webhook marks videos "exported" on completion.
 */
export async function triggerRemotionExports(
  db: Db,
  runId: string,
  videosToExport: { id: string; s3_prefix: string }[],
) {
  if (videosToExport.length === 0) return { results: [] };

  const {
    REMOTION_LAMBDA_FUNCTION_NAME,
    REMOTION_LAMBDA_REGION,
    REMOTION_LAMBDA_SERVE_URL,
    REMOTION_WEBHOOK_URL,
    REMOTION_WEBHOOK_SECRET,
    SHORTGEN_CDN_URL,
    SHORTGEN_BUCKET_NAME,
  } = env;

  await db
    .update(runs)
    .set({ status: "export" })
    .where(eq(runs.id, runId));

  const cdnBase = SHORTGEN_CDN_URL.replace(/\/$/, "");
  const { renderMediaOnLambda } = await import("@remotion/lambda/client");
  const webhook = {
    url: REMOTION_WEBHOOK_URL,
    secret: REMOTION_WEBHOOK_SECRET,
  };

  const results = await Promise.allSettled(
    videosToExport.map(async (v) => {
      const s3Prefix = v.s3_prefix.replace(/\/$/, "");
      const assetBaseUrl = `${cdnBase}/${s3Prefix}`;
      const outKey = `${s3Prefix}/short.mp4`;
      const backgroundMusicUrl = `${cdnBase}/assets/background_music.mp3`;

      const result = await renderMediaOnLambda({
        region: REMOTION_LAMBDA_REGION as Parameters<
          typeof import("@remotion/lambda/client").renderMediaOnLambda
        >[0]["region"],
        functionName: REMOTION_LAMBDA_FUNCTION_NAME,
        serveUrl: REMOTION_LAMBDA_SERVE_URL,
        composition: "ShortVideo-AssetBase",
        inputProps: { assetBaseUrl, backgroundMusicUrl },
        codec: "h264",
        webhook: {
          ...webhook,
          customData: { runId, videoId: v.id },
        },
        outName: {
          key: outKey,
          bucketName: SHORTGEN_BUCKET_NAME,
        },
        privacy: "no-acl",
      });

      await db
        .update(videos)
        .set({ status: "exporting", render_id: result.renderId })
        .where(eq(videos.id, v.id));

      return result;
    }),
  );

  return { results };
}
