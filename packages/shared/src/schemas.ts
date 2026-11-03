import { z } from 'zod';

export const tryonRequestSchema = z.object({
  garmentImageUrl: z.string().url(),
  pageUrl: z.string().url(),
  productRef: z.string().max(300).optional(),
  category: z.enum(['auto', 'tops', 'bottoms', 'one-pieces']).default('auto'),
  batchId: z.string().max(80).optional(), // groups a whole-page product batch
  // Whole-page conversion: only photos with exactly one person, in the store's scene — anything else is skipped (free).
  sceneOnly: z.boolean().optional(),
  // With sceneOnly: photos with several people too — every one of them becomes the customer.
  allPeople: z.boolean().optional(),
  // The product the photo belongs to, where the page shows it (its link and name) — for the Cabin's lists.
  productUrl: z.string().url().max(2000).optional(),
  name: z.string().max(200).optional(),
});
export type TryonRequest = z.infer<typeof tryonRequestSchema>;

export const cabinAddSchema = z.object({
  garmentImageUrl: z.string().url(),
  pageUrl: z.string().url(),
  productRef: z.string().max(300).optional(),
  name: z.string().max(200).optional(),
  batchId: z.string().max(80).optional(),
  productUrl: z.string().url().max(2000).optional(),
});
export type CabinAddRequest = z.infer<typeof cabinAddSchema>;

// Cache-only batch lookup — try-ons that already exist for a page's images, never generate.
export const lookupSchema = z.object({
  garmentImageUrls: z.array(z.string().url()).max(40),
});
export type LookupRequest = z.infer<typeof lookupSchema>;

// Dry run of a whole-page conversion: what is cached, what would be generated, what it would cost (no AI calls).
export const convertPlanSchema = z.object({
  imageUrls: z.array(z.string().url()).max(40),
});
export type ConvertPlanRequest = z.infer<typeof convertPlanSchema>;

export const profileUpdateSchema = z.object({
  name: z.string().max(60).optional(), // empty string clears it
  heightCm: z.number().int().min(80).max(250).optional(),
  weightKg: z.number().int().min(30).max(300).optional(),
  gender: z.enum(['female', 'male', 'other']).optional(),
  // Where this person receives store newsletters; empty string clears it.
  email: z.union([z.string().trim().email().max(200), z.literal('')]).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const profileCreateSchema = z.object({
  name: z.string().max(60).optional(),
});
export type ProfileCreate = z.infer<typeof profileCreateSchema>;

export const consentSchema = z.object({
  version: z.string().max(40),
  granted: z.boolean(),
});
export type ConsentRequest = z.infer<typeof consentSchema>;

// Cache-only: every try-on the active profile has from one site's pages ("Show my try-ons" in the extension).
export const lookupSiteSchema = z.object({
  pageUrl: z.string().url(),
});
export type LookupSiteRequest = z.infer<typeof lookupSiteSchema>;

// An outfit from the Cabin: for each zone dropped on the figure, the try-on whose piece goes there.
export const OUTFIT_SLOTS = ['hat', 'jewelry', 'top', 'bottoms', 'shoes'] as const;
export const outfitCreateSchema = z.object({
  slots: z
    .object({
      hat: z.string().max(80).optional(),
      jewelry: z.string().max(80).optional(),
      top: z.string().max(80).optional(),
      bottoms: z.string().max(80).optional(),
      shoes: z.string().max(80).optional(),
    })
    .refine((s) => Object.values(s).some(Boolean), 'at least one piece'),
});
export type OutfitCreateRequest = z.infer<typeof outfitCreateSchema>;

// ── Store newsletters (B2B) ──
export const nlPreviewSchema = z.object({ url: z.string().url().max(2000) });

export const nlCampaignCreateSchema = z.object({
  storeName: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(160),
  intro: z.string().trim().max(1200).optional(),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        imageUrl: z.string().url().max(2000),
        productUrl: z.string().url().max(2000).optional(),
        price: z.string().trim().max(40).optional(),
      }),
    )
    .min(1)
    .max(12),
  recipients: z.array(z.string().trim().toLowerCase().email().max(200)).min(1).max(500),
});
export type NlCampaignCreate = z.infer<typeof nlCampaignCreateSchema>;

export const nlRunSchema = z.object({ recipientId: z.string().max(80), productId: z.string().max(80) });
