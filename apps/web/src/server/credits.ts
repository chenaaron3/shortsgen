import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
  CREDITS_IMAGE_REGEN,
  creditBalance,
  creditTransaction,
  SCRIPT_REGEN_FREE_LIMIT,
  type CreditTransactionType,
  type Tier,
} from "@shortgen/db";
import type { InferSelectModel } from "drizzle-orm";

export type DebitResult =
  | { ok: true; balanceRemaining: number }
  | { ok: false; error: string };

export type GrantResult =
  | { ok: true; balanceRemaining: number }
  | { ok: false; error: string };

type Db = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Debit credits atomically with row-level lock. Rejects if insufficient.
 */
export async function debitCredits(
  db: Db,
  userId: string,
  cost: number,
  reference: string,
  type: Extract<CreditTransactionType, "usage"> = "usage",
): Promise<DebitResult> {
  if (cost <= 0) {
    return { ok: true, balanceRemaining: 0 };
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(creditBalance)
      .where(eq(creditBalance.userId, userId))
      .for("update");

    if (!row) {
      return { ok: false, error: "Insufficient credits" };
    }

    if (row.balance < cost) {
      return { ok: false, error: "Insufficient credits" };
    }

    const newBalance = row.balance - cost;

    await tx
      .update(creditBalance)
      .set({ balance: newBalance, updated_at: new Date() })
      .where(eq(creditBalance.userId, userId));

    await tx.insert(creditTransaction).values({
      userId,
      amount: -cost,
      type,
      reference,
      stripe_event_id: null,
    });

    return { ok: true, balanceRemaining: newBalance };
  });
}

/**
 * Grant credits. Deduplicates by stripe_event_id if provided.
 */
export async function grantCredits(
  db: Db,
  userId: string,
  amount: number,
  type: Exclude<CreditTransactionType, "usage">,
  stripeEventId?: string | null,
): Promise<GrantResult> {
  if (amount <= 0) {
    return { ok: true, balanceRemaining: 0 };
  }

  return db.transaction(async (tx) => {
    if (stripeEventId) {
      const existing = await tx
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.stripe_event_id, stripeEventId))
        .limit(1);

      if (existing.length > 0) {
        const [row] = await tx
          .select()
          .from(creditBalance)
          .where(eq(creditBalance.userId, userId));
        return {
          ok: true,
          balanceRemaining: row?.balance ?? 0,
        };
      }
    }

    const [row] = await tx
      .select()
      .from(creditBalance)
      .where(eq(creditBalance.userId, userId));

    const currentBalance = row?.balance ?? 0;
    const newBalance = currentBalance + amount;

    if (row) {
      await tx
        .update(creditBalance)
        .set({ balance: newBalance, updated_at: new Date() })
        .where(eq(creditBalance.userId, userId));
    } else {
      await tx.insert(creditBalance).values({
        userId,
        balance: newBalance,
        updated_at: new Date(),
      });
    }

    await tx.insert(creditTransaction).values({
      userId,
      amount,
      type,
      reference: stripeEventId ?? undefined,
      stripe_event_id: stripeEventId ?? null,
    });

    return { ok: true, balanceRemaining: newBalance };
  });
}

/**
 * Get current balance for a user.
 */
export async function getBalance(
  db: Db,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select()
    .from(creditBalance)
    .where(eq(creditBalance.userId, userId));
  return row?.balance ?? 0;
}

/**
 * Ensure user has a credit_balance row (for signup bonus). Idempotent.
 */
export async function ensureCreditBalance(
  db: Db,
  userId: string,
  signupCredits: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(creditBalance)
    .where(eq(creditBalance.userId, userId));

  if (existing) return;

  await db.transaction(async (tx) => {
    await tx.insert(creditBalance).values({
      userId,
      balance: signupCredits,
      updated_at: new Date(),
    });
    await tx.insert(creditTransaction).values({
      userId,
      amount: signupCredits,
      type: "signup_bonus",
      stripe_event_id: null,
    });
  });
}

export { CREDITS_IMAGE_REGEN, SCRIPT_REGEN_FREE_LIMIT };
