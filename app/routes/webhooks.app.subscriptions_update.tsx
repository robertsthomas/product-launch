import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { syncPlanFromShopify } from "~/lib/billing";

/**
 * Webhook handler for APP_SUBSCRIPTIONS_UPDATE
 *
 * This webhook is triggered when a subscription is created, updated, or cancelled
 * through Shopify's managed pricing. We use it to sync the plan state in our database.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.webhook(request);

  try {
    // Sync the plan from Shopify's current subscription state
    const plan = await syncPlanFromShopify(admin, session.shop);

    console.log(`Plan synced for shop ${session.shop}: ${plan}`);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to sync plan from subscription update webhook:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to sync plan" },
      { status: 500 }
    );
  }
}
