import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { syncPlanFromShopify } from "~/lib/billing";

/**
 * GET /api/billing/callback
 * 
 * Called after merchant approves/declines subscription.
 * Syncs plan from Shopify and redirects to app.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  try {
    // Sync plan from Shopify (handles approval/decline)
    const plan = await syncPlanFromShopify(admin, session.shop);
    
    console.log(`Plan synced for ${session.shop}: ${plan}`);
    
    // Redirect back to app home
    return redirect("/app");
  } catch (error) {
    console.error("Billing callback error:", error);
    return redirect("/app?billing_error=true");
  }
}

