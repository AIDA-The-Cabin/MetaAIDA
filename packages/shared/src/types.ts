import type { ButtonMode } from './constants';

export type TryonStatus = 'queued' | 'processing' | 'done' | 'failed' | 'skipped';

export interface TryonResult {
  id: string;
  status: TryonStatus;
  resultUrl?: string;
  cached: boolean;
  latencyMs?: number;
  error?: string;
  /** Why a whole-page conversion left this photo alone: no person in it, more than one, or no try-on of it passed the quality check. */
  skipped?: 'no_person' | 'group' | 'rejected';
}

/** One photo in a whole-page conversion dry run. */
export interface ConvertPlanItem {
  url: string;
  /** cached = already converted · ready = person found, will generate · new = not analysed yet · skip = no person · unreachable = can't fetch */
  state: 'cached' | 'ready' | 'new' | 'skip' | 'unreachable';
}

export interface ConvertPlan {
  items: ConvertPlanItem[];
  /** Upper bound in USD for converting everything not cached yet (SAM analysis + Muse Image). */
  estimateUsd: number;
}

export interface CabinItem {
  id: string;
  /** tryon_result id (GET /v1/tryon/:resultId returns its status). */
  resultId?: string;
  name?: string;
  garmentImageUrl: string;
  pageUrl: string;
  resultUrl?: string;
  status: TryonStatus;
  addedAt: number;
}

export interface Profile {
  id: string;
  /** Optional name of the person in this profile. */
  name?: string;
  displayName: string;
  hasPhoto: boolean;
  bodyVersion: number;
  avatarUrl?: string;
  heightCm?: number;
  weightKg?: number;
  gender?: string;
  consentVersion?: string;
  /** Where this person receives store newsletters. */
  email?: string;
}

/** One person on the account. Photo, avatar, try-ons and Cabin all belong to a profile. */
export interface ProfileSummary {
  id: string;
  name?: string;
  hasPhoto: boolean;
  /** Face-only avatar cut from the profile photo (relative URL). */
  avatarUrl?: string;
}

export interface ProfilesResponse {
  activeId: string;
  profiles: ProfileSummary[];
}

/** Returned by /v1/sdk/bootstrap — tells the embedded widget how to behave on this tenant. */
export interface SdkConfig {
  tenantId: string;
  buttonMode: ButtonMode;
  fullPageEnabled: boolean;
  apiBase: string;
  theme?: Record<string, string>;
}

export interface ApiError {
  error: string;
  detail?: string;
}

/** One converted photo of the active profile (the Cabin's "Try ons" list and its dressing bar). */
export interface TryonItem {
  /** tryon_result id */
  id: string;
  resultUrl: string;
  garmentImageUrl: string;
  /** The product's own page when known, else the page the photo was converted on. */
  productUrl?: string;
  pageUrl?: string;
  name?: string;
  /** Host of the store, without www. */
  site: string;
  createdAt: number;
}

export type OutfitSlot = 'hat' | 'jewelry' | 'top' | 'bottoms' | 'shoes';

/** One piece of an outfit: which zone, from which try-on, and the product it came from. */
export interface OutfitPiece {
  slot: OutfitSlot;
  tryonId: string;
  /** The try-on the piece was taken from (relative URL). */
  imageUrl?: string;
  garmentImageUrl: string;
  productUrl?: string;
  name?: string;
  site: string;
}

export interface Outfit {
  id: string;
  resultUrl: string;
  pieces: OutfitPiece[];
  createdAt: number;
}

/** Where the person stands in the profile photo, as fractions of its width and height (0–1). */
export interface FigureBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface ProfileFigure {
  /** Photo size in pixels. */
  w: number;
  h: number;
  person?: FigureBox;
  face?: FigureBox;
}
