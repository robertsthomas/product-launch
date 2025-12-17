import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { db } from "../db";
import { productFieldVersions } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productId = decodeURIComponent(params.id ?? "");

  const formData = await request.formData();
  const field = formData.get("field") as string;
  const version = parseInt(formData.get("version") as string, 10);

  if (!field || !version) {
    return Response.json({ error: "Field and version are required" }, { status: 400 });
  }

  // Map database field names to form field names
  const fieldMapping: Record<string, string> = {
    title: "title",
    description: "description",
    seoTitle: "seoTitle",
    seoDescription: "seoDescription",
    tags: "tags",
    vendor: "vendor",
    productType: "productType",
  };

  const formField = fieldMapping[field] || field;

  try {
    // Get the specific version to revert to
    const targetVersion = await db
      .select()
      .from(productFieldVersions)
      .where(and(
        eq(productFieldVersions.productId, productId),
        eq(productFieldVersions.field, field),
        eq(productFieldVersions.version, version),
        eq(productFieldVersions.shopId, session.shop)
      ))
      .limit(1);

    if (!targetVersion.length) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    const versionData = targetVersion[0];

    // Parse the value (handle arrays for tags)
    let value: string | string[];
    try {
      const parsed = JSON.parse(versionData.value);
      // If it's an array, keep it as array, otherwise use as string
      value = Array.isArray(parsed) ? parsed : versionData.value;
    } catch {
      // If JSON parsing fails, treat as plain string
      value = versionData.value;
    }

    // Update the product in Shopify based on the field
    try {
      let updateVariables: any = { id: productId };

      switch (field) {
        case "title":
          updateVariables.title = value;
          break;
        case "description":
          updateVariables.descriptionHtml = value;
          break;
        case "seoTitle":
          updateVariables.seo = { title: value };
          break;
        case "seoDescription":
          updateVariables.seo = { description: value };
          break;
        case "tags":
          updateVariables.tags = Array.isArray(value) ? value : [];
          break;
        case "vendor":
          updateVariables.vendor = value;
          break;
        case "productType":
          updateVariables.productType = value;
          break;
      }

      const response = await admin.graphql(
        `#graphql
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id }
            userErrors { field message }
          }
        }`,
        { variables: { input: updateVariables } }
      );

      const json = await response.json();
      if (json.data?.productUpdate?.userErrors?.length > 0) {
        return Response.json(
          { error: json.data.productUpdate.userErrors[0].message },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error("Failed to update product:", error);
      return Response.json(
        { error: "Failed to update product" },
        { status: 500 }
      );
    }

    return Response.json({
      field,
      value,
      version: versionData.version,
      revertedFrom: versionData.createdAt,
    });
  } catch (error) {
    console.error("Revert error:", error);
    return Response.json(
      { error: "Failed to revert field version" },
      { status: 500 }
    );
  }
};
