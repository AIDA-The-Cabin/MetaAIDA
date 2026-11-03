export const API_VERSION = 'v1';

export const CACHE_TTL_DAYS = 30;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export const BUTTON_MODES = ['native', 'branded'] as const;
export type ButtonMode = (typeof BUTTON_MODES)[number];

export const CONSENT_VERSION = 'v1';

export const ROUTES = {
  health: `/${API_VERSION}/health`,
  tryon: `/${API_VERSION}/tryon`,
  tryonStatus: (id: string) => `/${API_VERSION}/tryon/${id}`,
  cabin: `/${API_VERSION}/cabin`,
  cabinItem: (id: string) => `/${API_VERSION}/cabin/${id}`,
  profile: `/${API_VERSION}/profile`,
  profilePhoto: `/${API_VERSION}/profile/photo`,
  profiles: `/${API_VERSION}/profiles`,
  profileActivate: (id: string) => `/${API_VERSION}/profiles/${id}/activate`,
  profileAvatar: (id: string) => `/${API_VERSION}/profiles/${id}/avatar`,
  consent: `/${API_VERSION}/consent`,
  accountDelete: `/${API_VERSION}/account/delete`,
  images: (key: string) => `/${API_VERSION}/images/${key}`,
  sdkBootstrap: `/${API_VERSION}/sdk/bootstrap`,
  adminUsage: `/${API_VERSION}/admin/usage`,
  convertPlan: `/${API_VERSION}/convert/plan`,
  tryons: `/${API_VERSION}/tryons`,
  outfits: `/${API_VERSION}/outfits`,
  profileFigure: `/${API_VERSION}/profile/figure`,
} as const;
