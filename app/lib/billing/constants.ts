// Plan identifiers
export const PLANS = {
  FREE: "free",
  STARTER: "starter",
  PRO: "pro",
} as const;

export type PlanType = (typeof PLANS)[keyof typeof PLANS];

// Pricing configuration
export const PLAN_CONFIG = {
  [PLANS.FREE]: {
    name: "Free",
    price: 0,
    trialDays: 0,
    auditsPerMonth: 20,
    aiCredits: 0,
    features: {
      audits: true,
      autoFix: false,
      aiGeneration: false,
      bulkAI: false,
      customRules: false,
    },
  },
  [PLANS.STARTER]: {
    name: "Starter",
    price: 12,
    trialDays: 7,
    auditsPerMonth: -1, // unlimited
    aiCredits: 0,
    features: {
      audits: true,
      autoFix: true,
      aiGeneration: false,
      bulkAI: false,
      customRules: false,
    },
  },
  [PLANS.PRO]: {
    name: "Pro",
    price: 39,
    trialDays: 7,
    auditsPerMonth: -1, // unlimited
    aiCredits: 100, // per month
    trialAiCredits: 15, // during trial
    features: {
      audits: true,
      autoFix: true,
      aiGeneration: true,
      bulkAI: true,
      customRules: true,
    },
  },
} as const;

// Error codes for feature gating
export const BILLING_ERRORS = {
  AI_FEATURE_LOCKED: "AI_FEATURE_LOCKED",
  AI_LIMIT_REACHED: "AI_LIMIT_REACHED",
  AUTOFIX_LOCKED: "AUTOFIX_LOCKED",
  CUSTOM_RULES_LOCKED: "CUSTOM_RULES_LOCKED",
  AUDIT_LIMIT_REACHED: "AUDIT_LIMIT_REACHED",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
} as const;

// Subscription statuses
export const SUBSCRIPTION_STATUS = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  FROZEN: "FROZEN",
} as const;

