// GraphQL operations for Shopify billing

// Get current app installation with active subscriptions (for managed pricing)
export const GET_CURRENT_SUBSCRIPTION_QUERY = `#graphql
  query GetCurrentSubscription {
    currentAppInstallation {
      id
      activeSubscriptions {
        id
        name
        status
        trialDays
        currentPeriodEnd
        test
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

// Get shop plan to detect dev stores
export const GET_SHOP_PLAN_QUERY = `#graphql
  query GetShopPlan {
    shop {
      id
      name
      plan {
        partnerDevelopment
        shopifyPlus
        publicDisplayName
      }
    }
  }
`;




