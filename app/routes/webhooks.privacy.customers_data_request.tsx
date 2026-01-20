import type { ActionFunctionArgs } from "react-router"
import { authenticate } from "~/shopify.server"

/**
 * GDPR Webhook: Customer Data Request
 *
 * Triggered when a customer requests their data from a store.
 * Your app should return any customer data you have stored.
 *
 * Since this app doesn't store customer-specific data (only product data),
 * we simply acknowledge the request.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request)

  console.log(`[GDPR] Received ${topic} webhook for shop: ${shop}`)
  console.log(`[GDPR] Customer data request payload:`, JSON.stringify(payload))

  // This app doesn't store customer-specific data
  // If you add customer data storage in the future, implement data export here

  return new Response("OK", { status: 200 })
}
