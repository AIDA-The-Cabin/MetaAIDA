import { and, asc, eq, sql } from 'drizzle-orm';
import { ROUTES, type ProfileSummary } from '@aida/shared';
import * as schema from './db/schema';
import type { DB } from './db/client';
import { newId } from './util';

export type ProfileRow = typeof schema.profiles.$inferSelect;

export async function listProfiles(db: DB, userId: string): Promise<ProfileRow[]> {
  return db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).orderBy(asc(schema.profiles.createdAt)).all();
}

export async function createProfile(db: DB, userId: string, name: string | null): Promise<ProfileRow> {
  const now = Date.now();
  const row: ProfileRow = {
    id: newId('prf'),
    userId,
    name,
    bodyVersion: 0,
    primaryPhotoId: null,
    avatarR2Key: null,
    heightCm: null,
    weightKg: null,
    gender: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.profiles).values(row).run();
  return row;
}

export async function setActiveProfile(db: DB, userId: string, profileId: string): Promise<void> {
  await db.update(schema.users).set({ activeProfileId: profileId }).where(eq(schema.users.id, userId)).run();
}

/** The account's active profile. An account always has one — created on the fly if it has none. */
export async function activeProfile(db: DB, userId: string): Promise<ProfileRow> {
  const u = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (u?.activeProfileId) {
    const p = await db
      .select()
      .from(schema.profiles)
      .where(and(eq(schema.profiles.id, u.activeProfileId), eq(schema.profiles.userId, userId)))
      .get();
    if (p) return p;
  }
  const p = (await listProfiles(db, userId))[0] ?? (await createProfile(db, userId, null));
  await setActiveProfile(db, userId, p.id);
  return p;
}

/**
 * Next photo version for the ACCOUNT. Versions are unique across the account's profiles, so a try-on's
 * cache key (user + version + garment) and its R2 key never collide between two people on one account.
 */
export async function nextBodyVersion(db: DB, userId: string): Promise<number> {
  const r = await db
    .select({ v: sql<number>`max(${schema.profiles.bodyVersion})` })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .get();
  return (r?.v ?? 0) + 1;
}

/** What clients see. The avatar URL changes with every new photo, so it can be cached forever. */
export function profileSummary(p: ProfileRow): ProfileSummary {
  return {
    id: p.id,
    name: p.name ?? undefined,
    hasPhoto: !!p.primaryPhotoId,
    avatarUrl: p.primaryPhotoId ? `${ROUTES.profileAvatar(p.id)}?v=${p.primaryPhotoId}` : undefined,
  };
}
