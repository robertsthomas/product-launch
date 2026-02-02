import "@shopify/shopify-app-react-router/adapters/node"
import { BillingInterval } from "@shopify/shopify-api"
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server"
import { sessionStorage } from "./db/session-storage"

// Plan names must match exactly when calling billing.request()
export const BILLING_PLANS = {
  PRO_MONTHLY: "Pro Monthly",
  PRO_YEARLY: "Pro Yearly",
} as const

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: sessionStorage as any,
  distribution: AppDistribution.AppStore,
  ...(process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}),
  billing: {
    [BILLING_PLANS.PRO_MONTHLY]: {
      lineItems: [
        {
          amount: 19.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: 7,
    },
    [BILLING_PLANS.PRO_YEARLY]: {
      lineItems: [
        {
          amount: 180.0, // ~$15/mo, 2 months free
          currencyCode: "USD",
          interval: BillingInterval.Annual,
        },
      ],
      trialDays: 7,
    },
  },
})

export default shopify
export const apiVersion = ApiVersion.October25
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders
export const authenticate = shopify.authenticate
export const unauthenticated = shopify.unauthenticated
export const login = shopify.login
export const registerWebhooks = shopify.registerWebhooks
export { sessionStorage }
