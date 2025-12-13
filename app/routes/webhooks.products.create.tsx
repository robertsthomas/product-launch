import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { auditProduct } from "../lib/services/audit.server";
import { getOrCreateShop } from "../lib/services/shop.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!admin) {
    console.error("No admin API access for webhook");
    return new Response();
  }

  try {
    // Ensure shop is initialized
    const shopRecord = await getOrCreateShop(shop);

    // Check if auto-run on create is enabled
    if (!shopRecord.autoRunOnCreate) {
      console.log(`Auto-run on create disabled for ${shop}, skipping audit`);
      return new Response();
    }

    // Get the product ID from the webhook payload
    const productGid = `gid://shopify/Product/${payload.admin_graphql_api_id?.split("/").pop() ?? payload.id}`;

    console.log(`Running audit for product ${productGid}`);

    // Run the audit - skip metafield update to avoid triggering update webhooks
    await auditProduct(shop, productGid, admin, true);

    console.log(`Audit completed for product ${productGid}`);
  } catch (error) {
    console.error("Error processing product create webhook:", error);
  }

  return new Response();
};

