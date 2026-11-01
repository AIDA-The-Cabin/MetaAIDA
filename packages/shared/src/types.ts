import type { ButtonMode } from './constants';

export type TryonStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface TryonResult {
  id: string;
  status: TryonStatus;
  resultUrl?: string;
  cached: boolean;
  latencyMs?: number;
  error?: string;
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
