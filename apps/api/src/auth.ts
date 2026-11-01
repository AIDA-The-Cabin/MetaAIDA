import { and, eq, isNull } from 'drizzle-orm';
import * as schema from './db/schema';
import type { DB } from './db/client';

export const DEFAULT_TENANT_ID = 'tenant_default';
export const ADMIN_USER_ID = 'user_admin';

export interface AuthContext {
  userId: string;
  tenantId: string;
}

// StubAuthProvider — always resolves the seeded "admin" account.
// SECURITRON ("Continue with ARKNET") implements this seam later via users.external_auth_id.
export function stubAuth(): AuthContext {
  return { userId: ADMIN_USER_ID, tenantId: DEFAULT_TENANT_ID };
}

export async function tenantFromApiKey(db: DB, keyHash: string) {
  const key = await db
    .select()
    .from(schema.tenantApiKeys)
    .where(and(eq(schema.tenantApiKeys.keyHash, keyHash), isNull(schema.tenantApiKeys.revokedAt)))
    .get();
  if (!key) return null;
  return (await db.select().from(schema.tenants).where(eq(schema.tenants.id, key.tenantId)).get()) ?? null;
}
