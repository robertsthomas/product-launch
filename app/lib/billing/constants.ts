// Plan identifiers
export enum PLANS {
  FREE = "free",
  PRO = "pro",
}

export type PlanType = PLANS;

// Bulk limits
export const BULK_LIMITS = {
  [PLANS.FREE]: 10, // max 10 products per bulk action
  [PLANS.PRO]: 100, // higher batch sizes
} as const;

// AI Credit costs per action
// Model: gpt-4o-mini (cheap + good)
// Budget: keep total AI cost < $19/mo per merchant
export const AI_CREDIT_COSTS = {
  seoTitle: 1, // ~120-250 output tokens
  seoDescription: 1, // ~300-700 output tokens
  metaDescription: 1, // ~120-250 output tokens
  tags: 1, // ~60-120 output tokens
  altText: 1, // per image, ~60-120 output tokens
  fullProductRefresh: 3, // title + meta + tags bundle
  bulkSeoMeta: 1, // per product in bulk
} as const;

// Token limits per generation (prevents runaway costs)
export const AI_TOKEN_LIMITS = {
  maxInputTokens: 2000, // truncate long product data
  maxOutputTokens: {
    title: 120,
    meta: 250,
    tags: 120,
    description: 700,
    altText: 120,
  },
  regenLimitPerFieldPerDay: 3, // prevent regen abuse
} as const;

// Pricing configuration
export const PLAN_CONFIG = {
  [PLANS.FREE]: {
    name: "Free",
    price: 0,
    trialDays: 0,
    auditsPerMonth: -1, // unlimited audits
    aiCredits: 0,
    versionHistoryDays: 1, // 24 hours
    bulkLimit: BULK_LIMITS[PLANS.FREE],
    features: {
      audits: true,
      guidedFix: true, // non-AI fixes with confirmation
      autoFix: false, // no auto-run-all
      aiGeneration: false,
      bulkAI: false,
      bulkGuidedFix: true, // limited bulk (max 10)
      customRules: false,
      versionHistory: true,
      scheduledAudits: false,
      brandVoice: false,
    },
  },
  [PLANS.PRO]: {
    name: "Pro",
    price: 19, // $19/mo
    trialDays: 7,
    auditsPerMonth: -1, // unlimited
    aiCredits: 100, // per month
    trialAiCredits: 20, // during 7-day trial
    versionHistoryDays: 30, // 30 days
    bulkLimit: BULK_LIMITS[PLANS.PRO],
    features: {
      audits: true,
      guidedFix: true,
      autoFix: true,
      aiGeneration: true,
      bulkAI: true,
      bulkGuidedFix: true,
      customRules: true,
      versionHistory: true,
      scheduledAudits: true,
      brandVoice: true,
    },
  },
} as const;

// Error codes for feature gating
export const BILLING_ERRORS = {
  AI_FEATURE_LOCKED: "AI_FEATURE_LOCKED",
  AI_LIMIT_REACHED: "AI_LIMIT_REACHED",
  AUTOFIX_LOCKED: "AUTOFIX_LOCKED",
  BULK_LIMIT_EXCEEDED: "BULK_LIMIT_EXCEEDED",
  CUSTOM_RULES_LOCKED: "CUSTOM_RULES_LOCKED",
  AUDIT_LIMIT_REACHED: "AUDIT_LIMIT_REACHED",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  SCHEDULED_AUDITS_LOCKED: "SCHEDULED_AUDITS_LOCKED",
  BRAND_VOICE_LOCKED: "BRAND_VOICE_LOCKED",
} as const;

// Subscription statuses
export const SUBSCRIPTION_STATUS = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  FROZEN: "FROZEN",
} as const;


