// GraphQL operations for Shopify billing

// Create subscription with trial
export const CREATE_SUBSCRIPTION_MUTATION = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $trialDays: Int
    $test: Boolean
    $replacementBehavior: AppSubscriptionReplacementBehavior
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      lineItems: $lineItems
      trialDays: $trialDays
      test: $test
      replacementBehavior: $replacementBehavior
    ) {
      appSubscription {
        id
        name
        status
        trialDays
        currentPeriodEnd
        test
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

// Cancel subscription
export const CANCEL_SUBSCRIPTION_MUTATION = `#graphql
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Get current app installation with active subscriptions
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


