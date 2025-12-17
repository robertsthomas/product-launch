import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { db } from "../db";
import { productFieldVersions, shops } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const productId = decodeURIComponent(params.id ?? "");

  try {
    // Get shop ID from domain
    const [shop] = await db
      .select({ id: shops.id })
      .from(shops)
      .where(eq(shops.shopDomain, session.shop))
      .limit(1);

    if (!shop) {
      return Response.json({ versions: {} });
    }

    // Get all versions for this product, grouped by field
    const versions = await db
      .select({
        id: productFieldVersions.id,
        field: productFieldVersions.field,
        version: productFieldVersions.version,
        source: productFieldVersions.source,
        createdAt: productFieldVersions.createdAt,
      })
      .from(productFieldVersions)
      .where(
        and(
          eq(productFieldVersions.productId, productId),
          eq(productFieldVersions.shopId, shop.id)
        )
      )
      .orderBy(desc(productFieldVersions.version));

    // Group by field
    const groupedVersions: Record<string, Array<{ version: number; createdAt: Date; source: string }>> = {};

    for (const version of versions) {
      if (!groupedVersions[version.field]) {
        groupedVersions[version.field] = [];
      }
      groupedVersions[version.field].push({
        version: version.version,
        createdAt: version.createdAt,
        source: version.source,
      });
    }

    return Response.json({ versions: groupedVersions });
  } catch (error) {
    console.error("Load versions error:", error);
    return Response.json(
      { error: "Failed to load field versions" },
      { status: 500 }
    );
  }
};