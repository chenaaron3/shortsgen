import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { db } from "~/server/db";
import { env } from "~/env";
import { videos } from "@shortgen/db";
import { eq, and } from "drizzle-orm";

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; videoId: string; path?: string[] }> }
) {
  const { runId, videoId, path } = await params;

  const bucket = env.SHORTGEN_BUCKET_NAME;
  if (!bucket) {
    return NextResponse.json(
      { error: "SHORTGEN_BUCKET_NAME not configured" },
      { status: 503 }
    );
  }

  const [video] = await db
    .select({ s3Prefix: videos.s3Prefix })
    .from(videos)
    .where(
      and(
        eq(videos.id, videoId),
        eq(videos.runId, runId)
      )
    );

  if (!video?.s3Prefix) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const pathSegments = path ?? [];
  const objectKey =
    pathSegments.length > 0
      ? `${video.s3Prefix}${pathSegments.join("/")}`
      : `${video.s3Prefix}manifest.json`;

  try {
    const client = new S3Client({});
    const { Body, ContentType } = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      })
    );

    if (!Body) {
      return NextResponse.json({ error: "Empty object" }, { status: 404 });
    }

    const ext = pathSegments[pathSegments.length - 1]?.split(".").pop() ?? "json";
    const contentType = ContentType ?? CONTENT_TYPES[ext] ?? "application/octet-stream";
    const bytes = await Body.transformToByteArray();
    // S3 returns a plain ArrayBuffer; assert for BodyInit compatibility with strict BufferSource types
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[asset-proxy]", err);
    return NextResponse.json(
      { error: "Failed to fetch asset" },
      { status: 500 }
    );
  }
}
