import { z } from 'zod';

export const tryonRequestSchema = z.object({
  garmentImageUrl: z.string().url(),
  pageUrl: z.string().url(),
  productRef: z.string().max(300).optional(),
  category: z.enum(['auto', 'tops', 'bottoms', 'one-pieces']).default('auto'),
  batchId: z.string().max(80).optional(), // groups a whole-page product batch
});
export type TryonRequest = z.infer<typeof tryonRequestSchema>;

export const cabinAddSchema = z.object({
  garmentImageUrl: z.string().url(),
  pageUrl: z.string().url(),
  productRef: z.string().max(300).optional(),
  name: z.string().max(200).optional(),
  batchId: z.string().max(80).optional(),
});
export type CabinAddRequest = z.infer<typeof cabinAddSchema>;

// Cache-only batch lookup — try-ons that already exist for a page's images, never generate.
export const lookupSchema = z.object({
  garmentImageUrls: z.array(z.string().url()).max(40),
});
export type LookupRequest = z.infer<typeof lookupSchema>;

export const profileUpdateSchema = z.object({
  displayName: z.string().max(120).optional(),
  heightCm: z.number().int().min(80).max(250).optional(),
  weightKg: z.number().int().min(30).max(300).optional(),
  gender: z.enum(['female', 'male', 'other']).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const consentSchema = z.object({
  version: z.string().max(40),
  granted: z.boolean(),
});
export type ConsentRequest = z.infer<typeof consentSchema>;
