import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";

/**
 * POST /api/billing/cancel
 * 
 * With managed pricing, subscription cancellation is handled through Shopify's admin.
 * This endpoint just provides info on how to cancel.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // With Shopify managed pricing, merchants cancel through Shopify admin
  // Navigate to: Settings > Apps and sales channels > [App] > Cancel subscription
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "launch-ready";
  const manageSubscriptionUrl = `https://admin.shopify.com/store/${session.shop.replace('.myshopify.com', '')}/charges/${appHandle}/pricing_plans`;

  return Response.json({ 
    success: true, 
    message: "To cancel your subscription, please visit the Shopify admin.",
    redirectUrl: manageSubscriptionUrl
  });
}

