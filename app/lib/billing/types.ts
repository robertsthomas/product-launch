import type { PlanType } from "./constants"

export interface ShopBillingInfo {
  plan: PlanType
  subscriptionId: string | null
  subscriptionStatus: string | null
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  isDevStore: boolean
  aiCreditsUsed: number
  aiCreditsResetAt: Date | null
  auditsThisMonth: number
  auditsResetAt: Date | null
}

export interface PlanFeatures {
  audits: boolean
  guidedFix: boolean
  autoFix: boolean
  aiGeneration: boolean
  bulkAI: boolean
  bulkGuidedFix: boolean
  customRules: boolean
  versionHistory: boolean
  scheduledAudits: boolean
  brandVoice: boolean
}

export interface ActiveSubscription {
  id: string
  name: string
  status: string
  trialDays: number
  currentPeriodEnd: string | null
  test: boolean
  lineItems: Array<{
    plan: {
      pricingDetails: {
        price: { amount: string; currencyCode: string }
        interval: string
      }
    }
  }>
}

export interface FeatureCheckResult {
  allowed: boolean
  reason?: string
  errorCode?: string
  upgradeRequired?: PlanType
}
