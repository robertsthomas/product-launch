import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { createSubscription, isDevStore, syncPlanFromShopify } from "~/lib/billing";
import { PLANS } from "~/lib/billing/constants";

/**
 * POST /api/billing/upgrade?plan=starter|pro
 * 
 * Creates a subscription and returns the confirmation URL.
 * Client should redirect to confirmationUrl using top-level navigation.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") as "starter" | "pro";

  if (!plan || !["starter", "pro"].includes(plan)) {
    return Response.json({ error: "Invalid plan. Must be 'starter' or 'pro'" }, { status: 400 });
  }

  try {
    // Check if dev store - they get Pro free
    const isDev = await isDevStore(admin);
    if (isDev) {
      await syncPlanFromShopify(admin, session.shop);
      return Response.json({ 
        success: true, 
        plan: PLANS.PRO, 
        message: "Development store - Pro features enabled for free" 
      });
    }

    // Build return URL (where merchant returns after approval)
    const appUrl = process.env.SHOPIFY_APP_URL || "";
    const returnUrl = `${appUrl}/api/billing/callback?shop=${session.shop}`;

    // Determine if this is a test charge
    const isTest = process.env.NODE_ENV !== "production";

    // Create the subscription
    const result = await createSubscription(
      admin,
      plan,
      session.shop,
      returnUrl,
      isTest
    );

    return Response.json({
      success: true,
      confirmationUrl: result.confirmationUrl,
      subscriptionId: result.subscriptionId,
    });
  } catch (error) {
    console.error("Subscription creation failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create subscription" },
      { status: 500 }
    );
  }
}

