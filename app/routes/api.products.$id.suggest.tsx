import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { PRODUCT_QUERY, type Product } from "../lib/checklist";
import {
  generateTitle,
  generateSeoTitle,
  generateSeoDescription,
  generateProductDescription,
  generateTags,
  generateImageAltText,
  isAIAvailable,
  type ProductContext,
} from "../lib/ai";

export type SuggestionType = 
  | "title"
  | "seo_title" 
  | "seo_description" 
  | "description" 
  | "tags" 
  | "image_alt_text";

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const productId = decodeURIComponent(params.id!);
  
  const formData = await request.formData();
  const type = formData.get("type") as SuggestionType;
  const imageIndex = formData.get("imageIndex") ? parseInt(formData.get("imageIndex") as string, 10) : 0;

  if (!isAIAvailable()) {
    return Response.json(
      { error: "AI is not configured. Please set OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  // Fetch product from Shopify
  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: productId },
  });

  const json = await response.json();
  const product = json.data?.product as Product | null;

  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  // Build context for AI
  const context: ProductContext = {
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    productType: product.productType,
    vendor: product.vendor,
    tags: product.tags,
    collections: product.collections?.nodes,
  };

  try {
    let suggestion: string | string[];

    switch (type) {
      case "title":
        suggestion = await generateTitle(context);
        break;
      case "seo_title":
        suggestion = await generateSeoTitle(context);
        break;
      case "seo_description":
        suggestion = await generateSeoDescription(context);
        break;
      case "description":
        suggestion = await generateProductDescription(context);
        break;
      case "tags":
        suggestion = await generateTags(context);
        break;
      case "image_alt_text":
        suggestion = await generateImageAltText(context, imageIndex);
        break;
      default:
        return Response.json({ error: "Invalid suggestion type" }, { status: 400 });
    }

    return Response.json({ suggestion, type });
  } catch (error) {
    console.error("AI suggestion error:", error);
    return Response.json(
      { error: "Failed to generate suggestion. Please try again." },
      { status: 500 }
    );
  }
};

