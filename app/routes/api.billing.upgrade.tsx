import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "~/shopify.server";
import { isDevStore, syncPlanFromShopify } from "~/lib/billing";
import { PLANS } from "~/lib/billing/constants";

/**
 * POST /api/billing/upgrade?plan=pro
 *
 * With managed pricing, subscriptions are created through Shopify's hosted plan selection page.
 * This endpoint now redirects merchants to Shopify's hosted pricing page.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") as "pro";

  if (!plan || plan !== "pro") {
    return Response.json({ error: "Invalid plan. Must be 'pro'" }, { status: 400 });
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

    // Redirect to Shopify's hosted plan selection page
    // URL pattern: https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
    // IMPORTANT: Replace this with your actual app handle from Partner Dashboard
    // Find it at: https://partners.shopify.com/[partner_id]/apps/[app_handle]
    const appHandle = process.env.SHOPIFY_APP_HANDLE || "299712806913";
    const pricingPlansUrl = `https://admin.shopify.com/store/${session.shop}/charges/${appHandle}/pricing_plans`;

    return redirect(pricingPlansUrl);
  } catch (error) {
    console.error("Billing redirect failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to redirect to pricing page" },
      { status: 500 }
    );
  }
}




