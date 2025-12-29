import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import { db } from "~/db";
import { shops, productAudits, productFieldVersions } from "~/db/schema";
import { eq } from "drizzle-orm";

/**
 * Unified GDPR Compliance Webhook Handler
 * 
 * Handles all three mandatory compliance webhooks:
 * - customers/data_request: Customer requests their data
 * - customers/redact: Request to delete customer data
 * - shop/redact: Request to delete all shop data (48h after uninstall)
 * 
 * See: https://shopify.dev/docs/apps/build/privacy-law-compliance
 */
export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log("[GDPR] Received", topic, "webhook for shop:", shop);
  console.log("[GDPR] Payload:", JSON.stringify(payload));

  switch (topic) {
    case "customers/data_request":
      // Customer requests their data
      // This app doesn't store customer-specific data (only product data)
      // Return empty JSON as per spec
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    case "customers/redact":
      // Request to delete customer data
      // This app doesn't store customer-specific data
      // Simply acknowledge the request
      return new Response("OK", { status: 200 });

    case "shop/redact":
      // 48 hours after uninstall - delete ALL shop data
      try {
        // Delete all shop-related data from the database
        // Order matters due to foreign key constraints

        // 1. Delete field versions for this shop
        await db.delete(productFieldVersions).where(eq(productFieldVersions.shopId, shop));
        console.log(`[GDPR] Deleted field versions for shop: ${shop}`);

        // 2. Delete product audits for this shop
        await db.delete(productAudits).where(eq(productAudits.shopId, shop));
        console.log(`[GDPR] Deleted product audits for shop: ${shop}`);

        // 3. Delete the shop record itself
        await db.delete(shops).where(eq(shops.shopDomain, shop));
        console.log(`[GDPR] Deleted shop record for: ${shop}`);

        console.log(`[GDPR] Successfully completed shop redact for: ${shop}`);
      } catch (error) {
        console.error(`[GDPR] Error during shop redact for ${shop}:`, error);
        // Still return 200 to acknowledge receipt - Shopify will retry if we fail
      }
      return new Response("OK", { status: 200 });

    default:
      console.warn(`[GDPR] Unknown compliance topic: ${topic}`);
      return new Response("Unknown topic", { status: 400 });
  }
}

