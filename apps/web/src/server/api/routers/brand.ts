import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
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

const REUSE_AVATAR_KEY_TAIL =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.(png|jpg|jpeg|webp)$/i;

/** True if `key` is exactly `users/{userId}/brand/{uuid}/avatar.(png|jpg|jpeg|webp)`. */
function isUserScopedAvatarKey(userId: string, key: string): boolean {
  const prefix = `users/${userId}/brand/`;
  if (!key.startsWith(prefix)) return false;
  return REUSE_AVATAR_KEY_TAIL.test(key.slice(prefix.length));
}

/** Newest rows to load; results are deduped by `avatar_s3_key`. */
const AVATAR_HISTORY_LIMIT = 80;

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

  /** Past avatars, newest first, one entry per `avatar_s3_key` (reuse creates duplicate rows with the same key). */
  avatarHistory: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: brand.id,
        created_at: brand.created_at,
        avatar_s3_key: brand.avatar_s3_key,
      })
      .from(brand)
      .where(
        and(eq(brand.userId, ctx.session.user.id), isNotNull(brand.avatar_s3_key)),
      )
      .orderBy(desc(brand.created_at))
      .limit(AVATAR_HISTORY_LIMIT);

    const seenKeys = new Set<string>();
    const deduped: {
      id: string;
      created_at: Date | null;
      avatar_s3_key: string;
      avatarUrl: string | null;
    }[] = [];

    for (const r of rows) {
      const key = r.avatar_s3_key as string;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      deduped.push({
        id: r.id,
        created_at: r.created_at,
        avatar_s3_key: key,
        avatarUrl: cdnUrlForKey(r.avatar_s3_key),
      });
    }

    return deduped;
  }),

  /**
   * Append-only: one insert per save.
   * - If `avatarContentType` is set, `avatar_s3_key` is derived; client presigns + PUT.
   * - Else if `reuseAvatarS3Key` is set, key must match this user’s prefix and exist on a prior row.
   * - Else `avatar_s3_key` is null.
   * `avatarContentType` and `reuseAvatarS3Key` are mutually exclusive.
   */
  create: protectedProcedure
    .input(
      z
        .object({
          style_prompt: z.string().max(8000).optional(),
          mascot_description: z.string().max(4000).optional(),
          avatarContentType: avatarContentTypeSchema.optional(),
          reuseAvatarS3Key: z.string().min(1).max(512).optional(),
        })
        .superRefine((data, ctx) => {
          if (data.avatarContentType && data.reuseAvatarS3Key) {
            ctx.addIssue({
              code: "custom",
              message: "Cannot upload a new avatar and reuse an old one in the same save.",
              path: ["reuseAvatarS3Key"],
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const ct = input.avatarContentType;
      const reuseRaw = input.reuseAvatarS3Key?.trim();
      if (ct && reuseRaw) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot upload a new avatar and reuse an old one in the same save.",
        });
      }

      let id: string | undefined;
      let avatar_s3_key: string | null = null;

      if (ct) {
        id = randomUUID();
        avatar_s3_key = avatarKeyForUserBrand(
          userId,
          id,
          extForContentType(ct),
        );
      } else if (reuseRaw) {
        if (!isUserScopedAvatarKey(userId, reuseRaw)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid avatar key.",
          });
        }
        const [prior] = await ctx.db
          .select({ id: brand.id })
          .from(brand)
          .where(
            and(eq(brand.userId, userId), eq(brand.avatar_s3_key, reuseRaw)),
          )
          .limit(1);
        if (!prior) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That avatar is not in your history.",
          });
        }
        avatar_s3_key = reuseRaw;
      }

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
