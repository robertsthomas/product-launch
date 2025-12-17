import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { db } from "~/db";
import { shops } from "~/db/schema";
import { eq } from "drizzle-orm";
import { cancelSubscription, handleSubscriptionCancelled } from "~/lib/billing";

/**
 * POST /api/billing/cancel
 * 
 * Cancels the current subscription and downgrades to Free.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Get current shop
    const [shop] = await db
      .select()
      .from(shops)
      .where(eq(shops.shopDomain, session.shop))
      .limit(1);

    if (!shop?.subscriptionId) {
      return Response.json({ error: "No active subscription" }, { status: 400 });
    }

    // Cancel in Shopify
    await cancelSubscription(admin, shop.subscriptionId);

    // Update local state
    await handleSubscriptionCancelled(session.shop);

    return Response.json({ success: true, message: "Subscription cancelled" });
  } catch (error) {
    console.error("Subscription cancellation failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}


