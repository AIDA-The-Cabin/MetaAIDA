export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  // Meta Model API key — Muse Image does the try-on.
  META_KEY: string;
  ENVIRONMENT?: string;
}
