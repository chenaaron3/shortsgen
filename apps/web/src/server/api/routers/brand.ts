import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

import { brand } from "@shortgen/db";

const s3 = new S3Client({});

const avatarContentTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);

function cdnUrlForKey(key: string | null): string | null {
  if (!key) return null;
  const base = env.SHORTGEN_CDN_URL.replace(/\/$/, "");
  return `${base}/${key}`;
}

function extForContentType(ct: z.infer<typeof avatarContentTypeSchema>): string {
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/webp") return "webp";
  return "png";
}

function avatarKeyForUserBrand(
  userId: string,
  brandId: string,
  ext: string,
): string {
  return `users/${userId}/brand/${brandId}/avatar.${ext}`;
}

export const brandRouter = createTRPCRouter({
  latest: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select()
      .from(brand)
      .where(eq(brand.userId, ctx.session.user.id))
      .orderBy(desc(brand.created_at))
      .limit(1);
    if (!row) return null;
    return { ...row, avatarUrl: cdnUrlForKey(row.avatar_s3_key) };
  }),

  /**
   * Append-only: one insert per save. If `avatarContentType` is set, `avatar_s3_key` is written
   * on insert (no later updates). Client then presigns + PUT; `avatarUrl` is already correct from
   * this response (no follow-up RPC). Key is not accepted from the client — server derives it.
   */
  create: protectedProcedure
    .input(
      z.object({
        style_prompt: z.string().max(8000).optional(),
        mascot_description: z.string().max(4000).optional(),
        avatarContentType: avatarContentTypeSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const ct = input.avatarContentType;
      const id = ct ? randomUUID() : undefined;
      const avatar_s3_key =
        ct && id
          ? avatarKeyForUserBrand(userId, id, extForContentType(ct))
          : null;

      const [inserted] = await ctx.db
        .insert(brand)
        .values({
          ...(id ? { id } : {}),
          userId,
          style_prompt: input.style_prompt?.trim() || null,
          mascot_description: input.mascot_description?.trim() || null,
          avatar_s3_key,
        })
        .returning();

      if (!inserted) {
        throw new Error("Failed to create brand");
      }

      return {
        ...inserted,
        avatarUrl: cdnUrlForKey(inserted.avatar_s3_key),
      };
    }),

  /** Presigned PUT URL for browser → S3. Row must already have matching `avatar_s3_key` from create. */
  presignAvatarUpload: protectedProcedure
    .input(
      z.object({
        brandId: z.string().uuid(),
        contentType: avatarContentTypeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const ext = extForContentType(input.contentType);
      const key = avatarKeyForUserBrand(userId, input.brandId, ext);

      const [row] = await ctx.db
        .select({ avatar_s3_key: brand.avatar_s3_key })
        .from(brand)
        .where(and(eq(brand.id, input.brandId), eq(brand.userId, userId)))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      }
      if (!row.avatar_s3_key || row.avatar_s3_key !== key) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Avatar key does not match this brand row. Save again with the same image type.",
        });
      }

      const bucket = env.SHORTGEN_BUCKET_NAME;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: input.contentType,
      });
      // Duplicate @aws-sdk minor versions (web vs Remotion); runtime client is valid for presign.
      const uploadUrl = await getSignedUrl(
        s3 as unknown as Parameters<typeof getSignedUrl>[0],
        command,
        { expiresIn: 3600 },
      );
      return { uploadUrl, key };
    }),
});
