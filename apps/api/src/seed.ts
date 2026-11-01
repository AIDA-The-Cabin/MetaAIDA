import { eq } from 'drizzle-orm';
import * as schema from './db/schema';
import type { DB } from './db/client';
import { DEFAULT_TENANT_ID, ADMIN_USER_ID } from './auth';
import { activeProfile } from './profiles';
import { newId, sha256Hex } from './util';

export async function seed(db: DB): Promise<{ tenant: string; user: string; profile: string; sdkApiKey?: string }> {
  const now = Date.now();

  const tenant = await db.select().from(schema.tenants).where(eq(schema.tenants.id, DEFAULT_TENANT_ID)).get();
  if (!tenant) {
    await db
      .insert(schema.tenants)
      .values({
        id: DEFAULT_TENANT_ID,
        name: 'Default (Fashion Days demo)',
        type: 'retailer',
        domains: JSON.stringify(['fashiondays.ro', 'localhost', '127.0.0.1']),
        status: 'active',
        settings: JSON.stringify({ fullPageEnabled: true, buttonMode: 'branded' }),
        createdAt: now,
      })
      .run();
  }

  const user = await db.select().from(schema.users).where(eq(schema.users.id, ADMIN_USER_ID)).get();
  if (!user) {
    await db
      .insert(schema.users)
      .values({ id: ADMIN_USER_ID, tenantId: DEFAULT_TENANT_ID, displayName: 'admin', status: 'active', credits: 100, createdAt: now })
      .run();
  }
  const profile = await activeProfile(db, ADMIN_USER_ID); // every account has at least one profile

  let sdkApiKey: string | undefined;
  const existingKey = await db
    .select()
    .from(schema.tenantApiKeys)
    .where(eq(schema.tenantApiKeys.tenantId, DEFAULT_TENANT_ID))
    .get();
  if (!existingKey) {
    sdkApiKey = 'cabin_dev_' + crypto.randomUUID().replace(/-/g, '');
    await db
      .insert(schema.tenantApiKeys)
      .values({ id: newId('tak'), tenantId: DEFAULT_TENANT_ID, keyHash: await sha256Hex(sdkApiKey), label: 'dev', createdAt: now })
      .run();
  }

  return { tenant: DEFAULT_TENANT_ID, user: ADMIN_USER_ID, profile: profile.id, sdkApiKey };
}
