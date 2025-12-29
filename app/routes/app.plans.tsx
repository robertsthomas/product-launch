import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Redirect to Shopify's hosted plan selection page
  // URL pattern: https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
  // IMPORTANT: Replace this with your actual app handle from Partner Dashboard
  // Find it at: https://partners.shopify.com/[partner_id]/apps/[app_handle]
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "299712806913";
  const pricingPlansUrl = `https://admin.shopify.com/store/${shop}/charges/${appHandle}/pricing_plans`;

  return redirect(pricingPlansUrl);
};

// This component is no longer needed - we redirect to Shopify's hosted plan selection page

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

