/**
 * Drizzle schema for Auth.js (NextAuth) and app tables.
 * Used by apps/web via @shortgen/db.
 * Exports Zod schemas via drizzle-zod for types/table and Python codegen.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  uuid,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Table prefix (change here to rename all tables)
const TABLE_PREFIX = "shortgen_";
const t = (name: string) => `${TABLE_PREFIX}${name}`;

// Auth.js tables (see https://authjs.dev/getting-started/adapters/drizzle)

export const user = pgTable(t("user"), {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const account = pgTable(
  t("account"),
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const session = pgTable(t("session"), {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationToken = pgTable(
  t("verification_token"),
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// Run-Video flow: one run (source text) can have many videos
// Keys match DB column names (snake_case) for consistency with Python and drizzle-zod output.

export const runs = pgTable(t("runs"), {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  user_input: text("user_input").notNull(),
  status: text("status")
    .$type<"pending" | "processing" | "completed" | "failed">()
    .default("pending"),
  created_at: timestamp("created_at").defaultNow(),
});

export const videos = pgTable(t("videos"), {
  id: uuid("id").primaryKey().defaultRandom(),
  run_id: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  s3_prefix: text("s3_prefix"),
  source_text: text("source_text"), // Raw source chunk for this clip (nugget.original_text)
  status: text("status")
    .$type<"created" | "scripts" | "assets" | "export" | "failed">()
    .default("created"),
  script: text("script"),
  chunks: text("chunks"), // JSON: Chunks from pipeline
  cache_key: text("cache_key"),
  config_hash: text("config_hash"),
  created_at: timestamp("created_at").defaultNow(),
});

export const runsRelations = relations(runs, ({ one, many }) => ({
  user: one(user, {
    fields: [runs.userId],
    references: [user.id],
  }),
  videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one }) => ({
  run: one(runs, {
    fields: [videos.run_id],
    references: [runs.id],
  }),
}));

// Zod schemas for API validation and Python codegen (types:sync)
// Override timestamp fields to string for JSON Schema / Python compatibility
const timestampSchema = z.string().optional();
export const runSchema = createSelectSchema(runs, {
  created_at: timestampSchema,
});
export const videoSchema = createSelectSchema(videos, {
  created_at: timestampSchema,
});
export type Run = z.infer<typeof runSchema>;
export type Video = z.infer<typeof videoSchema>;
