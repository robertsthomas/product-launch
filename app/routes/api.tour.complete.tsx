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
    const formData = await request.formData();
    const tourType = formData.get("tourType") as string || "product";

    // Update appropriate tour completion timestamp based on type
    if (tourType === "dashboard") {
      await db
        .update(shops)
        .set({
          dashboardTourCompletedAt: new Date(),
        })
        .where(eq(shops.shopDomain, shop));
    } else {
      // Default to product tour
      await db
        .update(shops)
        .set({
          tourCompletedAt: new Date(),
        })
        .where(eq(shops.shopDomain, shop));
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error saving tour completion:", error);
    return Response.json({ error: "Failed to save tour completion" }, { status: 500 });
  }
};