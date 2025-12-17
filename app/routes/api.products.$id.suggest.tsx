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
import { checkAIGate, consumeAICredit, PLAN_CONFIG, type PlanType } from "../lib/billing";
import { db } from "../db";
import { productFieldVersions, shops } from "../db/schema";
import { eq, desc, and, lt } from "drizzle-orm";

/**
 * AI suggestion endpoint.
 *
 * Billing/abuse protections:
 * - Requires Pro plan (unless dev store bypass is enabled in DB)
 * - Enforces a hard credit cap (trial vs paid)
 * - Credits are decremented ONLY after a successful AI response
 */
export type SuggestionType =
  | "title"
  | "seo_title"
  | "seo_description"
  | "description"
  | "tags"
  | "image_alt_text";

export type GenerationMode = "generate" | "expand" | "improve" | "replace";

// Helper function to save current field value as a version
// Respects plan-based retention: Free=none, Starter=24hr, Pro=30 days
const saveFieldVersion = async (
  shopId: string,
  productId: string,
  field: string,
  currentValue: string | string[],
  mode: GenerationMode
) => {
  // Get shop settings to check plan and version history enabled
  const [shopData] = await db
    .select({ plan: shops.plan, versionHistoryEnabled: shops.versionHistoryEnabled })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);

  if (!shopData) return;

  const plan = shopData.plan as PlanType;
  const planConfig = PLAN_CONFIG[plan];

  // Check if version history is enabled and allowed for this plan
  if (!shopData.versionHistoryEnabled || !planConfig.features.versionHistory) {
    return; // Don't save version history
  }

  const retentionDays = planConfig.versionHistoryDays;
  if (retentionDays <= 0) {
    return; // No retention for this plan
  }

  const sourceMap: Record<GenerationMode, "ai_generate" | "ai_expand" | "ai_improve" | "ai_replace"> = {
    generate: "ai_generate",
    expand: "ai_expand",
    improve: "ai_improve",
    replace: "ai_replace",
  };

  const source = sourceMap[mode];
  
  // Get the latest version number for this field
  const latestVersion = await db
    .select({ version: productFieldVersions.version })
    .from(productFieldVersions)
    .where(
      and(
        eq(productFieldVersions.productId, productId),
        eq(productFieldVersions.field, field)
      )
    )
    .orderBy(desc(productFieldVersions.version))
    .limit(1);

  const nextVersion = latestVersion.length > 0 ? latestVersion[0].version + 1 : 1;

  // Save the current value as a version
  await db.insert(productFieldVersions).values({
    shopId,
    productId,
    field,
    value: Array.isArray(currentValue) ? JSON.stringify(currentValue) : currentValue,
    version: nextVersion,
    source,
  });

  // Clean up old versions beyond retention period
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  await db
    .delete(productFieldVersions)
    .where(
      and(
        eq(productFieldVersions.shopId, shopId),
        lt(productFieldVersions.createdAt, cutoffDate)
      )
    );
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productId = decodeURIComponent(params.id ?? "");
  
  const formData = await request.formData();
  const type = formData.get("type") as SuggestionType;
  const mode = (formData.get("mode") as GenerationMode) || "generate";
  const imageIndex = formData.get("imageIndex") ? Number.parseInt(formData.get("imageIndex") as string) : 0;
  // Enforce Pro-plan + credit limits BEFORE calling OpenAI.
  const aiGate = await checkAIGate(session.shop);
  if (!aiGate.allowed) {
    return Response.json(
      { 
        error: aiGate.message, 
        errorCode: aiGate.errorCode,
        creditsRemaining: aiGate.creditsRemaining,
        creditsLimit: aiGate.creditsLimit,
      },
      { status: 403 }
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
    // Get the shop ID from the database (needed for FK constraint)
    const [shop] = await db
      .select({ id: shops.id })
      .from(shops)
      .where(eq(shops.shopDomain, session.shop))
      .limit(1);

    // Map suggestion types to database field names
    const fieldMapping: Record<SuggestionType, string> = {
      title: "title",
      seo_title: "seoTitle",
      seo_description: "seoDescription",
      description: "description",
      tags: "tags",
      image_alt_text: "imageAltText",
    };

    const dbField = fieldMapping[type];

    // Save current field value as a version before generating (only if shop exists)
    if (dbField && shop) {
      let currentValue: string | string[];

      switch (type) {
        case "title":
          currentValue = product.title || "";
          break;
        case "seo_title":
          currentValue = product.seo?.title || "";
          break;
        case "seo_description":
          currentValue = product.seo?.description || "";
          break;
        case "description":
          currentValue = product.descriptionHtml || "";
          break;
        case "tags":
          currentValue = product.tags || [];
          break;
        case "image_alt_text": {
          // For alt text, we need to get the specific image
          const images = product.images?.nodes || [];
          currentValue = images[imageIndex]?.altText || "";
          break;
        }
      }

      await saveFieldVersion(
        shop.id, // Use shop.id (CUID) instead of session.shop (domain)
        productId,
        dbField,
        currentValue,
        mode
      );
    }

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

    // Decrement credits only after a successful generation.
    const creditResult = await consumeAICredit(session.shop);

    return Response.json({ 
      suggestion, 
      type,
      creditsRemaining: creditResult.creditsRemaining,
      creditsLimit: creditResult.creditsLimit,
    });
  } catch (error) {
    console.error("AI suggestion error:", error);
    return Response.json(
      { error: "Failed to generate suggestion. Please try again." },
      { status: 500 }
    );
  }
};

