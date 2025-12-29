import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";

/**
 * GDPR Webhook: Customer Redact
 * 
 * Triggered when a store owner requests deletion of customer data,
 * or when a customer requests their data be deleted.
 * 
 * Your app should delete any customer-specific data you have stored.
 * 
 * Since this app doesn't store customer-specific data (only product data),
 * we simply acknowledge the request.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[GDPR] Received ${topic} webhook for shop: ${shop}`);
  console.log(`[GDPR] Customer redact payload:`, JSON.stringify(payload));

  // This app doesn't store customer-specific data
  // If you add customer data storage in the future, implement deletion here

  return new Response("OK", { status: 200 });
}

