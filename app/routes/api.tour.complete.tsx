import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { db } from "~/db";
import { shops } from "~/db/schema";
import { eq } from "drizzle-orm";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    // Update tour completion timestamp
    await db
      .update(shops)
      .set({
        tourCompletedAt: new Date(),
      })
      .where(eq(shops.shopDomain, shop));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error saving tour completion:", error);
    return Response.json({ error: "Failed to save tour completion" }, { status: 500 });
  }
};