import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { db } from "../db";
import { productFieldVersions } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(new Request(""));
  const productId = decodeURIComponent(params.id ?? "");

  try {
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
      .where(eq(productFieldVersions.productId, productId))
      .where(eq(productFieldVersions.shopId, session.shop))
      .orderBy(desc(productFieldVersions.version));

    // Group by field
    const groupedVersions: Record<string, Array<{ version: number; createdAt: Date; source: string }>> = {};

    versions.forEach((version) => {
      if (!groupedVersions[version.field]) {
        groupedVersions[version.field] = [];
      }
      groupedVersions[version.field].push({
        version: version.version,
        createdAt: version.createdAt,
        source: version.source,
      });
    });

    return Response.json({ versions: groupedVersions });
  } catch (error) {
    console.error("Load versions error:", error);
    return Response.json(
      { error: "Failed to load field versions" },
      { status: 500 }
    );
  }
};