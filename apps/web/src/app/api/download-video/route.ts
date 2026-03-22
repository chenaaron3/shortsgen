import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

import { runs } from "@shortgen/db";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * Proxies S3/CDN assets to avoid CORS. Path must be under runs/{runId}/ and user must own the run.
 * GET /api/download-video?path=runs/{runId}/{videoId}/short.mp4
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get("path");

  if (!rawPath || typeof rawPath !== "string") {
    return NextResponse.json(
      { error: "path query param required" },
      { status: 400 }
    );
  }

  const path = rawPath.replace(/^\/+/, "").replace(/\/+/g, "/");
  if (path.includes("..") || !path.startsWith("runs/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const segments = path.split("/");
  const runId = segments[1];
  if (!runId || !UUID_REGEX.test(runId)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const [run] = await db
    .select({ userId: runs.userId })
    .from(runs)
    .where(eq(runs.id, runId));

  if (!run || run.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cdnBase = env.SHORTGEN_CDN_URL.replace(/\/$/, "");
  const url = `${cdnBase}/${path}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch from CDN" },
        { status: 502 }
      );
    }

    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      res.headers.get("Content-Type") ??
      CONTENT_TYPES[ext] ??
      "application/octet-stream";
    const filename = path.split("/").pop() ?? "download";

    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    const contentLength = res.headers.get("Content-Length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(res.body, { headers });
  } catch (e) {
    console.error("[download-video] fetch error:", e);
    return NextResponse.json(
      { error: "Failed to proxy asset" },
      { status: 502 }
    );
  }
}
