import { and, eq, gt, sql } from 'drizzle-orm';
import * as schema from './db/schema';
import type { DB } from './db/client';

/** Atomically spend 1 credit. Returns false if the balance is already 0 (no charge made). */
export async function chargeCredit(db: DB, userId: string): Promise<boolean> {
  const rows = await db
    .update(schema.users)
    .set({ credits: sql`${schema.users.credits} - 1` })
    .where(and(eq(schema.users.id, userId), gt(schema.users.credits, 0)))
    .returning({ credits: schema.users.credits });
  return rows.length > 0;
}

/** Give a credit back when a charged generation never produced an image. */
export async function refundCredit(db: DB, userId: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ credits: sql`${schema.users.credits} + 1` })
    .where(eq(schema.users.id, userId))
    .run();
}

export async function getCredits(db: DB, userId: string): Promise<number> {
  const u = await db.select({ credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId)).get();
  return u?.credits ?? 0;
}
