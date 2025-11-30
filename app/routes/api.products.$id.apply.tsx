import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { auditProduct } from "../lib/services/audit.server";

export type ApplyType = 
  | "seo_title" 
  | "seo_description" 
  | "description" 
  | "tags";

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productId = decodeURIComponent(params.id!);
  const shop = session.shop;

  const formData = await request.formData();
  const type = formData.get("type") as ApplyType;
  const value = formData.get("value") as string;

  if (!type || !value) {
    return Response.json({ error: "Missing type or value" }, { status: 400 });
  }

  // Build the mutation input based on type
  let input: Record<string, unknown> = { id: productId };

  switch (type) {
    case "seo_title":
      input.seo = { title: value };
      break;
    case "seo_description":
      input.seo = { description: value };
      break;
    case "description":
      input.descriptionHtml = `<p>${value.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
      break;
    case "tags":
      input.tags = value;
      break;
    default:
      return Response.json({ error: "Invalid apply type" }, { status: 400 });
  }

  try {
    const response = await admin.graphql(
      `#graphql
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            seo {
              title
              description
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { input } }
    );

    const json = await response.json();
    const errors = json.data?.productUpdate?.userErrors;

    if (errors && errors.length > 0) {
      console.error("Shopify update errors:", errors);
      return Response.json(
        { error: errors[0].message },
        { status: 400 }
      );
    }

    // Re-run the audit to update status
    await auditProduct(shop, productId, admin);

    return Response.json({ 
      success: true, 
      message: "Applied successfully",
      product: json.data?.productUpdate?.product 
    });
  } catch (error) {
    console.error("Apply suggestion error:", error);
    return Response.json(
      { error: "Failed to apply suggestion" },
      { status: 500 }
    );
  }
};

