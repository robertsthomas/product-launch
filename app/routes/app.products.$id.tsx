import { useEffect, useState, useCallback, useRef, useId } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate, useBlocker, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getProductAudit, auditProduct, getNextIncompleteProduct, getIncompleteProductCount } from "../lib/services/audit.server";
import { getShopSettings } from "../lib/services/shop.server";
import { saveFieldVersion, getShopId } from "../lib/services/version.server";
import { isAIAvailable } from "../lib/ai";
import { PRODUCT_QUERY, type Product } from "../lib/checklist";

// Helper to strip HTML tags
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&')  // Replace &amp; with &
    .replace(/&lt;/g, '<')   // Replace &lt; with <
    .replace(/&gt;/g, '>')   // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .trim();
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  if (!params.id) {
    throw new Error("Product ID is required");
  }
  const rawId = decodeURIComponent(params.id);
  const productId = rawId.startsWith('gid://') ? rawId : `gid://shopify/Product/${rawId}`;

  // Fetch product with media info
  const response = await admin.graphql(
    `#graphql
    query GetProductForEditor($id: ID!) {
      product(id: $id) {
        id
        title
        descriptionHtml
        vendor
        productType
        tags
        featuredMedia {
          id
          preview {
            image {
              url
            }
          }
        }
        media(first: 50) {
          nodes {
            ... on MediaImage {
              id
              image {
                url
              }
              alt
            }
          }
        }
        seo {
          title
          description
        }
      }
    }`,
    { variables: { id: productId } }
  );
  const json = await response.json();
  const shopifyProduct = json.data?.product;

  if (!shopifyProduct) {
    throw new Response("Product not found", { status: 404 });
  }

  // Fetch for audit
  const auditResponse = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: productId },
  });
  const auditJson = await auditResponse.json();
  const product = auditJson.data?.product as Product | null;

  let audit = await getProductAudit(shop, productId);
  if (!audit && product) {
    await auditProduct(shop, productId, admin);
    audit = await getProductAudit(shop, productId);
  }

  // Get navigation info for incomplete products
  const nextProduct = await getNextIncompleteProduct(shop, productId);
  const incompleteCount = await getIncompleteProductCount(shop);

  // Get shop settings for default collection
  const shopSettings = await getShopSettings(shop);
  const defaultCollectionId = shopSettings?.defaultCollectionId || null;

  // Fetch existing vendors and product types for autocomplete
  const autocompleteResponse = await admin.graphql(`#graphql
    query GetAutocompleteOptions {
      products(first: 250) {
        nodes {
          vendor
          productType
        }
      }
    }
  `);
  const autocompleteJson = await autocompleteResponse.json();
  const allProducts = autocompleteJson.data?.products?.nodes || [];
  
  // Extract unique vendors and product types
  const vendors = [...new Set(
    allProducts
      .map((p: { vendor: string }) => p.vendor)
      .filter((v: string) => v && v.trim() !== "")
  )].sort() as string[];
  
  const productTypes = [...new Set(
    allProducts
      .map((p: { productType: string }) => p.productType)
      .filter((t: string) => t && t.trim() !== "")
  )].sort() as string[];

  // Fetch collections for the picker
  const collectionsResponse = await admin.graphql(`#graphql
    query GetCollections {
      collections(first: 100) {
        nodes {
          id
          title
          productsCount {
            count
          }
        }
      }
    }
  `);
  const collectionsJson = await collectionsResponse.json();
  const collections = (collectionsJson.data?.collections?.nodes || []).map((c: { id: string; title: string; productsCount?: { count: number } }) => ({
    id: c.id,
    title: c.title,
    productsCount: c.productsCount?.count || 0,
  }));

  return {
    product: {
      id: shopifyProduct.id,
      title: shopifyProduct.title,
      descriptionHtml: shopifyProduct.descriptionHtml || "",
      vendor: shopifyProduct.vendor || "",
      productType: shopifyProduct.productType || "",
      tags: shopifyProduct.tags || [],
      seoTitle: shopifyProduct.seo?.title || "",
      seoDescription: shopifyProduct.seo?.description || "",
      featuredImage: shopifyProduct.featuredMedia?.preview?.image?.url || null,
      featuredImageId: shopifyProduct.featuredMedia?.id || null,
      images: shopifyProduct.media?.nodes?.map((node: any) => ({
        id: node.id,
        url: node.image?.url || "",
        altText: node.alt || null,
      })) || [],
    },
    tourCompleted: !!shopSettings?.tourCompletedAt,
    audit: audit ? {
      status: audit.status,
      passedCount: audit.passedCount,
      failedCount: audit.failedCount,
      totalCount: audit.totalCount,
      items: audit.items
        .map(item => ({
          key: item.item.key,
          label: item.item.label,
          status: item.status,
          details: item.details,
        }))
        .sort((a, b) => {
          // Order items to match visual layout on page
          const order: Record<string, number> = {
            min_title_length: 1,
            has_vendor: 2,
            has_product_type: 3,
            min_description_length: 4,
            has_tags: 5,
            min_images: 6,
            images_have_alt_text: 7,
            seo_title: 8,
            seo_description: 9,
            has_collections: 10,
          };
          return (order[a.key] ?? 99) - (order[b.key] ?? 99);
        }),
    } : null,
    aiAvailable: isAIAvailable(),
    navigation: {
      nextProduct,
      incompleteCount,
    },
    defaultCollectionId,
    collections,
    autocomplete: {
      vendors,
      productTypes,
    },
  };
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = decodeURIComponent(params.id!);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save") {
    const title = formData.get("title") as string;
    const descriptionHtml = formData.get("descriptionHtml") as string;
    const vendor = formData.get("vendor") as string;
    const productType = formData.get("productType") as string;
    const tags = formData.get("tags") as string;
    const seoTitle = formData.get("seoTitle") as string;
    const seoDescription = formData.get("seoDescription") as string;

    // Get current product values for version history
    const shopId = await getShopId(shop);
    if (shopId) {
      const currentProductRes = await admin.graphql(`#graphql
        query GetProductForVersionHistory($id: ID!) {
          product(id: $id) {
            title
            descriptionHtml
            tags
            seo { title description }
          }
        }
      `, { variables: { id: productId } });
      const currentProduct = (await currentProductRes.json()).data?.product;

      if (currentProduct) {
        // Save versions for changed fields
        const versionPromises: Promise<void>[] = [];
        
        if (currentProduct.title !== title) {
          versionPromises.push(saveFieldVersion(shopId, productId, "title", currentProduct.title || "", "manual_edit"));
        }
        if (currentProduct.descriptionHtml !== descriptionHtml) {
          versionPromises.push(saveFieldVersion(shopId, productId, "description", currentProduct.descriptionHtml || "", "manual_edit"));
        }
        if ((currentProduct.seo?.title || "") !== seoTitle) {
          versionPromises.push(saveFieldVersion(shopId, productId, "seo_title", currentProduct.seo?.title || "", "manual_edit"));
        }
        if ((currentProduct.seo?.description || "") !== seoDescription) {
          versionPromises.push(saveFieldVersion(shopId, productId, "seo_description", currentProduct.seo?.description || "", "manual_edit"));
        }
        const currentTags = currentProduct.tags?.join(",") || "";
        if (currentTags !== tags) {
          versionPromises.push(saveFieldVersion(shopId, productId, "tags", currentProduct.tags || [], "manual_edit"));
        }

        await Promise.all(versionPromises);
      }
    }

    const response = await admin.graphql(
      `#graphql
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            id: productId,
            title,
            descriptionHtml: `<p>${descriptionHtml.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
            vendor,
            productType,
            tags,
            seo: {
              title: seoTitle || null,
              description: seoDescription || null,
            },
          },
        },
      }
    );

    const json = await response.json();
    const errors = json.data?.productUpdate?.userErrors;

    if (errors?.length > 0) {
      return { success: false, error: errors[0].message };
    }

    // Handle alt text updates
    const altTextUpdates = formData.getAll("altTextUpdates");
    if (altTextUpdates.length > 0) {
      for (const updateStr of altTextUpdates) {
        const { imageId, altText } = JSON.parse(updateStr as string);

        const response = await admin.graphql(
          `#graphql
          mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
            productUpdateMedia(productId: $productId, media: $media) {
              media {
                ... on MediaImage {
                  id
                  alt
                }
              }
              mediaUserErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              productId,
              media: [{
                id: imageId,
                alt: altText,
              }],
            },
          }
        );

        const json = await response.json();
        const errors = json.data?.productUpdateMedia?.mediaUserErrors;
        if (errors?.length > 0) {
          console.error(`Failed to update alt text for image ${imageId}:`, errors[0].message);
        }
      }
    }

    await auditProduct(shop, productId, admin);
    return { success: true, message: "Product saved!" };
  }

  if (intent === "open_product") {
    return { openProduct: productId };
  }

  if (intent === "add_to_collection") {
    const collectionId = formData.get("collectionId") as string;
    if (!collectionId) {
      return { success: false, error: "No default collection configured" };
    }

    try {
      const response = await admin.graphql(`#graphql
        mutation AddProductToCollection($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            collection { id }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          id: collectionId,
          productIds: [productId],
        },
      });
      const data = await response.json();

      if (data.data?.collectionAddProducts?.userErrors?.length > 0) {
        return { success: false, error: data.data.collectionAddProducts.userErrors[0].message };
      }

      // Re-audit the product after adding to collection
      await auditProduct(shop, productId, admin);
      return { success: true, message: "Added to collection!" };
    } catch (error) {
      console.error("Error adding to collection:", error);
      return { success: false, error: "Failed to add to collection" };
    }
  }

  if (intent === "set_default_collection") {
    const collectionId = formData.get("collectionId") as string;
    if (!collectionId) {
      return { success: false, error: "No collection selected" };
    }

    try {
      const { updateShopSettings } = await import("../lib/services/shop.server");
      await updateShopSettings(shop, { defaultCollectionId: collectionId });
      return { success: true, defaultCollectionId: collectionId };
    } catch (error) {
      console.error("Error setting default collection:", error);
      return { success: false, error: "Failed to set default collection" };
    }
  }

  if (intent === "rescan") {
    try {
      await auditProduct(shop, productId, admin);
      return { success: true, message: "Product rescanned!" };
    } catch (error) {
      console.error("Error rescanning product:", error);
      return { success: false, error: "Failed to rescan product" };
    }
  }

  return { success: false };
};

// ============================================
// Image Actions Dropdown Component
// ============================================

function ImageActionsDropdown({
  imageId,
  isFeatured,
  aiAvailable,
  isGeneratingAlt,
  isGeneratingBulkAlt,
  isDeleting,
  onSetFeatured,
  onEdit,
  onGenerateAlt,
  onDelete,
}: {
  imageId: string;
  isFeatured: boolean;
  aiAvailable: boolean;
  isGeneratingAlt: boolean;
  isGeneratingBulkAlt?: boolean;
  isDeleting: boolean;
  onSetFeatured: () => void;
  onEdit: () => void;
  onGenerateAlt: () => void;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (action: "featured" | "edit" | "ai" | "delete") => {
    setIsOpen(false);
    switch (action) {
      case "featured":
        onSetFeatured();
        break;
      case "edit":
        onEdit();
        break;
      case "ai":
        onGenerateAlt();
        break;
      case "delete":
        onDelete();
        break;
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDeleting}
        style={{
          padding: "6px 8px",
          border: "none",
          borderRadius: "var(--radius-full)",
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          color: "var(--color-text)",
          cursor: isDeleting ? "not-allowed" : "pointer",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Image actions"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="1"/>
          <circle cx="12" cy="5" r="1"/>
          <circle cx="12" cy="19" r="1"/>
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 50,
            minWidth: "140px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-elevated)",
            overflow: "hidden",
          }}
        >
          {!isFeatured && (
            <button
              type="button"
              onClick={() => handleSelect("featured")}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                border: "none",
                background: "transparent",
                color: "var(--color-text)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background var(--transition-fast)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              Set as featured
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSelect("edit")}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                border: "none",
                borderTop: !isFeatured ? "1px solid var(--color-border-subtle)" : "none",
                background: "transparent",
                color: "var(--color-text)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background var(--transition-fast)",
              }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Edit alt text
          </button>
          {aiAvailable && (
            <button
              type="button"
              onClick={() => handleSelect("ai")}
              disabled={isGeneratingAlt || isGeneratingBulkAlt}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                border: "none",
                borderTop: "1px solid var(--color-border-subtle)",
                background: "transparent",
                color: (isGeneratingAlt || isGeneratingBulkAlt) ? "var(--color-subtle)" : "var(--color-primary)",
                cursor: (isGeneratingAlt || isGeneratingBulkAlt) ? "not-allowed" : "pointer",
                textAlign: "left",
                transition: "background var(--transition-fast)",
              }}
              onMouseEnter={(e) => { if (!isGeneratingAlt && !isGeneratingBulkAlt) e.currentTarget.style.background = "var(--color-surface-strong)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {isGeneratingAlt ? "Generating..." : isGeneratingBulkAlt ? "Bulk generating..." : "Generate alt text"}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSelect("delete")}
            disabled={isDeleting}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "none",
              borderTop: "1px solid var(--color-border-subtle)",
              background: "transparent",
              color: isDeleting ? "var(--color-subtle)" : "var(--color-error)",
              cursor: isDeleting ? "not-allowed" : "pointer",
              textAlign: "left",
              transition: "background var(--transition-fast)",
            }}
            onMouseEnter={(e) => { if (!isDeleting) e.currentTarget.style.background = "var(--color-surface-strong)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Image Add Dropdown Component
// ============================================

function ImageAddDropdown({
  aiAvailable,
  onUpload,
  onGenerate,
  uploading,
}: {
  aiAvailable: boolean;
  onUpload: () => void;
  onGenerate: () => void;
  uploading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (action: "upload" | "generate") => {
    setIsOpen(false);
    if (action === "upload") {
      onUpload();
    } else if (action === "generate") {
      onGenerate();
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={uploading}
        style={{
          padding: "4px 10px",
          fontSize: "11px",
          fontWeight: 500,
          border: "none",
          borderRadius: "var(--radius-md)",
          backgroundColor: "transparent",
          color: uploading ? "var(--color-subtle)" : "var(--color-muted)",
          cursor: uploading ? "not-allowed" : "pointer",
          transition: "all var(--transition-fast)",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
        }}
        onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.color = "var(--color-text)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = uploading ? "var(--color-subtle)" : "var(--color-muted)"; }}
      >
        {uploading ? "Uploading..." : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Add
          </>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 50,
            minWidth: "140px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-elevated)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => handleSelect("upload")}
            disabled={uploading}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "none",
              background: "transparent",
              color: uploading ? "var(--color-subtle)" : "var(--color-text)",
              cursor: uploading ? "not-allowed" : "pointer",
              textAlign: "left",
              transition: "background var(--transition-fast)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => {
              if (!uploading) e.currentTarget.style.background = "var(--color-surface-strong)";
            }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Upload Image
          </button>

          {aiAvailable && (
            <button
              type="button"
              onClick={() => handleSelect("generate")}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                border: "none",
                borderTop: "1px solid var(--color-border-subtle)",
                background: "transparent",
                color: "var(--color-primary)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background var(--transition-fast)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              Generate Image
            </button>
          )}
        </div>
      )}
    </div>
  );
}
// ============================================
// Onboarding Modal Component
// ============================================

function OnboardingModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  const slides = [
    {
      title: "Welcome to Launch Ready",
      description: "Your all-in-one toolkit to get products from draft to live in seconds. Let's take a quick tour of the features.",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" className="animate-rocket">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.71-2.13.71-2.13l-4.42-.16s-1.29 0-2.13.71zM15 3s-3.33 0-6 2.67a12.11 12.11 0 0 0-3.41 6.83L3 19l5-2 1.39-1.39a12.11 12.11 0 0 0 6.83-3.41C19 9.53 19 6 19 6h2l-3-3z"/>
          <path d="M12 12l4-4"/>
        </svg>
      ),
      color: "var(--color-primary-soft)",
    },
    {
      title: "AI Optimization",
      description: "Generate high-converting titles, descriptions, and SEO metadata. Even create stunning product images with AI.",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5">
          <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
          <path d="M20 4l-1.5 4.5L14 10l4.5 1.5L20 16l1.5-4.5L26 10l-4.5-1.5L20 4z" style={{ transform: "scale(0.5) translate(12px, -12px)" }}/>
        </svg>
      ),
      color: "var(--color-ai-soft)",
    },
    {
      title: "Brand Voice",
      description: "Make the AI sound like you. Set your unique brand voice and custom instructions in Settings to maintain consistency.",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <path d="M8 9h8M8 13h6"/>
        </svg>
      ),
      color: "var(--color-highlight-soft)",
    },
    {
      title: "Version History",
      description: "Every AI generation is saved. Compare current values with previous versions and revert anytime with one click.",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M12 7v5l3 3"/>
        </svg>
      ),
      color: "var(--color-accent-soft)",
    },
    {
      title: "Smart Checklist",
      description: "The sidebar keeps you on track. Automatically fix missing collections, tags, and status issues to ensure every product is launch-ready.",
      icon: (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <path d="M22 4L12 14.01l-3-3"/>
        </svg>
      ),
      color: "var(--color-success-soft)",
    },
  ];

  if (!isOpen) return null;

  const currentSlide = slides[step];
  const isLastStep = step === slides.length - 1;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(45, 42, 38, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "20px",
        backdropFilter: "blur(8px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isLastStep) onClose();
      }}
    >
      <div
        className="animate-scale-in"
        style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: "480px",
          minHeight: "480px", // Consistent height to prevent shifting
          boxShadow: "var(--shadow-elevated)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Bar */}
        <div style={{ display: "flex", height: "4px", background: "transparent" }}>
          {slides.map((_, i) => (
            <div
              key={`dot-${i}`}
              style={{
                flex: 1,
                height: "100%",
                background: i <= step ? "var(--color-primary)" : "var(--color-border-subtle)",
                transition: "all var(--transition-slow)",
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ 
          padding: "48px 32px", 
          textAlign: "center", 
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center"
        }}>
          <div
            style={{
              width: "88px",
              height: "88px",
              borderRadius: "var(--radius-xl)",
              backgroundColor: currentSlide.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 32px",
              transition: "all var(--transition-base)",
            }}
          >
            {currentSlide.icon}
          </div>

          <h2
            style={{
              margin: "0 0 16px",
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-2xl)",
              fontWeight: 600,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
            }}
          >
            {currentSlide.title}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "var(--text-base)",
              color: "var(--color-muted)",
              lineHeight: 1.6,
            }}
          >
            {currentSlide.description}
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "24px 32px",
            borderTop: "1px solid var(--color-border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "transparent",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "var(--text-sm)",
              color: "var(--color-muted)",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Skip tour
          </button>

          <div style={{ display: "flex", gap: "12px" }}>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                style={{
                  padding: "10px 20px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onClose();
                } else {
                  setStep(s => s + 1);
                }
              }}
              style={{
                padding: "10px 24px",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                border: "none",
                borderRadius: "var(--radius-md)",
                background: "var(--gradient-primary)",
                color: "#fff",
                cursor: "pointer",
                boxShadow: "var(--shadow-primary-glow)",
              }}
            >
              {isLastStep ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// AI Upsell Modal Component
// ============================================

function AIUpsellModal({
  isOpen,
  onClose,
  message,
  errorCode,
}: {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
  errorCode?: string;
}) {
  if (!isOpen) return null;

  const isPlanLimit = errorCode === "AI_FEATURE_LOCKED";
  const isCreditLimit = errorCode === "AI_LIMIT_REACHED";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(45, 42, 38, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClose();
        }
      }}
      tabIndex={-1}
      role="presentation"
    >
      <div
        className="animate-scale-in"
        style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "var(--shadow-elevated)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid var(--color-border-subtle)",
            background: "transparent",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-heading)",
                fontSize: "var(--text-xl)",
                fontWeight: 600,
                color: "var(--color-text)",
                letterSpacing: "-0.01em",
              }}
            >
              {isPlanLimit ? "Upgrade to Pro" : "AI Credits Used"}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "var(--text-sm)",
                color: "var(--color-muted)",
              }}
            >
              {isPlanLimit
                ? "Unlock AI-powered features"
                : "You've reached your monthly limit"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "var(--radius-md)",
              color: "var(--color-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all var(--transition-fast)",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-label="Close modal"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--color-surface-strong)",
              borderRadius: "var(--radius-md)",
              marginBottom: "20px",
              border: "1px solid var(--color-border)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-sm)",
                color: "var(--color-text)",
                lineHeight: 1.6,
              }}
            >
              {isPlanLimit
                ? "AI-powered suggestions like title generation, SEO optimization, and product descriptions are available with a Pro plan."
                : "You've used all your AI credits for this month. Upgrade to Pro to get more credits and continue using AI features."}
            </p>
          </div>

          {isPlanLimit && (
            <div
              style={{
                backgroundColor: "var(--color-success-soft)",
                border: "1px solid var(--color-success)",
                borderRadius: "var(--radius-lg)",
                padding: "16px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="2"
                style={{ flexShrink: 0, marginTop: "2px" }}
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <div>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "var(--text-sm)",
                    color: "var(--color-success-strong)",
                    marginBottom: "4px",
                  }}
                >
                  Pro Plan Includes:
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "20px",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-success-strong)",
                  }}
                >
                  <li>Unlimited AI generations per month</li>
                  <li>Advanced product optimization</li>
                  <li>Priority support</li>
                </ul>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            background: "var(--color-surface-strong)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 20px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              cursor: "pointer",
              transition: "all var(--transition-fast)",
            }}
          >
            Maybe Later
          </button>
          <a
            href="/app/plans"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--gradient-primary)",
              color: "#fff",
              cursor: "pointer",
              textDecoration: "none",
              transition: "all var(--transition-fast)",
              boxShadow: "var(--shadow-primary-glow)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
            View Plans
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Generate All Modal Component
// ============================================

function GenerateAllModal({
  isOpen,
  onClose,
  selectedFields,
  onFieldToggle,
  onGenerate,
  isGenerating,
  fieldOptions,
  setFieldOptions,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedFields: string[];
  onFieldToggle: (field: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  fieldOptions: Record<string, string[]>;
  setFieldOptions: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}) {
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const fields = [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "tags", label: "Tags" },
    { key: "seoTitle", label: "SEO Title" },
    { key: "seoDescription", label: "Meta Description" },
    {
      key: "images",
      label: "Images",
      hasOptions: true,
      options: [
        { key: "image", label: "Generate Image" },
        { key: "alt", label: "Generate Alt Text" }
      ]
    },
  ];

  const toggleExpand = (fieldKey: string) => {
    setExpandedFields(prev => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  };


  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(45, 42, 38, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
      tabIndex={-1}
      role="presentation"
    >
      <div
        className="animate-scale-in"
        style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: "500px",
          maxHeight: "70vh",
          boxShadow: "var(--shadow-elevated)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid var(--color-border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "transparent",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-xl)",
              fontWeight: 600,
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Generate All Fields
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "var(--radius-md)",
              color: "var(--color-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all var(--transition-fast)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content - Scrollable list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
          {fields.map((field, idx) => (
            <div key={field.key}>
              <button
                type="button"
                onClick={() => {
                  if (field.hasOptions) {
                    toggleExpand(field.key);
                    // Auto-select all options when expanding for the first time
                    if (!fieldOptions[field.key] && field.options) {
                      setFieldOptions(prev => ({
                        ...prev,
                        [field.key]: field.options?.map(opt => opt.key) || []
                      }));
                    }
                  } else {
                    onFieldToggle(field.key);
                  }
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  border: "none",
                  borderBottom: idx < fields.length - 1 ? "1px solid var(--color-border)" : "none",
                  background: (field.hasOptions ? (fieldOptions[field.key]?.length || 0) > 0 : selectedFields.includes(field.key)) ? "var(--color-primary-soft)" : "transparent",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
                onMouseEnter={(e) => {
                  const isSelected = field.hasOptions ? (fieldOptions[field.key]?.length || 0) > 0 : selectedFields.includes(field.key);
                  if (!isSelected) {
                    e.currentTarget.style.background = "var(--color-surface-strong)";
                  }
                }}
                onMouseLeave={(e) => {
                  const isSelected = field.hasOptions ? (fieldOptions[field.key]?.length || 0) > 0 : selectedFields.includes(field.key);
                  e.currentTarget.style.background = isSelected ? "var(--color-primary-soft)" : "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, textAlign: "left" }}>
                  <input
                    type="checkbox"
                    checked={field.hasOptions ? (fieldOptions[field.key]?.length || 0) > 0 : selectedFields.includes(field.key)}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (field.hasOptions) {
                        // For fields with options, checkbox controls the options selection
                        const currentOptions = fieldOptions[field.key] || [];
                        const allOptions = field.options?.map(opt => opt.key) || [];
                        if (currentOptions.length > 0) {
                          // If any options are selected, deselect all
                          setFieldOptions(prev => ({ ...prev, [field.key]: [] }));
                        } else {
                          // If no options are selected, select all
                          setFieldOptions(prev => ({ ...prev, [field.key]: allOptions }));
                        }
                      } else {
                        onFieldToggle(field.key);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "16px",
                      height: "16px",
                      accentColor: "var(--color-primary)",
                      cursor: "pointer",
                    }}
                  />
                  <span style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    color: "var(--color-text)",
                  }}>
                    {field.label}
                  </span>
                </div>
                {field.hasOptions && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: expandedFields[field.key] ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform var(--transition-fast)",
                      color: "var(--color-muted)",
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                )}
              </button>

              {/* Expanded options for fields with multiple choices */}
              {expandedFields[field.key] && field.hasOptions && field.options && (
                <div
                  style={{
                    padding: "12px 20px 16px 48px",
                    backgroundColor: "var(--color-surface-strong)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ marginBottom: "8px", fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--color-muted)" }}>
                    Choose what to generate:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {field.options.map((option) => (
                      <label
                        key={option.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          cursor: "pointer",
                          fontSize: "var(--text-sm)",
                          color: "var(--color-text)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={fieldOptions[field.key]?.includes(option.key) || false}
                          onChange={(e) => {
                            const currentOptions = fieldOptions[field.key] || [];
                            if (e.target.checked) {
                              setFieldOptions(prev => ({
                                ...prev,
                                [field.key]: [...currentOptions, option.key]
                              }));
                            } else {
                              setFieldOptions(prev => ({
                                ...prev,
                                [field.key]: currentOptions.filter(opt => opt !== option.key)
                              }));
                            }
                          }}
                          style={{
                            width: "14px",
                            height: "14px",
                            accentColor: "var(--color-primary)",
                            cursor: "pointer",
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "20px 24px",
            borderTop: "1px solid var(--color-border-subtle)",
            display: "flex",
            gap: "12px",
            justifyContent: "space-between",
            alignItems: "center",
            background: "transparent",
          }}
        >
          {/* Select All / Deselect All */}
          <button
            type="button"
            onClick={() => {
              if (selectedFields.length === fields.length) {
                selectedFields.forEach(key => onFieldToggle(key));
              } else {
                fields.forEach(field => {
                  if (!selectedFields.includes(field.key)) {
                    onFieldToggle(field.key);
                  }
                });
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              cursor: "pointer",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-surface-strong)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-surface)";
            }}
          >
            {selectedFields.length === fields.length ? "Deselect All" : "Select All"}
          </button>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              style={{
                padding: "10px 20px",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
                cursor: isGenerating ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.5 : 1,
                transition: "all var(--transition-fast)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating || selectedFields.length === 0}
              style={{
                padding: "10px 20px",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                border: "none",
                borderRadius: "var(--radius-md)",
                background: (isGenerating || selectedFields.length === 0) ? "var(--color-subtle)" : "var(--gradient-primary)",
                color: "#fff",
                cursor: (isGenerating || selectedFields.length === 0) ? "not-allowed" : "pointer",
                boxShadow: (isGenerating || selectedFields.length === 0) ? "none" : "var(--shadow-primary-glow)",
                transition: "all var(--transition-fast)",
              }}
            >
              {isGenerating ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// AI Generate Dropdown Component
// ============================================

type AIGenerateMode = "expand" | "improve" | "replace";

function AIGenerateDropdown({
  onGenerate,
  isGenerating,
  hasContent,
  generatingMode,
}: {
  onGenerate: (mode: AIGenerateMode) => void;
  isGenerating?: boolean;
  hasContent?: boolean;
  generatingMode?: AIGenerateMode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (mode: AIGenerateMode) => {
    setIsOpen(false);
    onGenerate(mode);
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => !isGenerating && setIsOpen(!isOpen)}
        disabled={isGenerating}
        style={{
          padding: "4px 10px",
          fontSize: "11px",
          fontWeight: 500,
          border: "none",
          borderRadius: "var(--radius-md)",
          background: "transparent",
          color: isGenerating ? "var(--color-subtle)" : "var(--color-muted)",
          cursor: isGenerating ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          transition: "all var(--transition-fast)",
        }}
        onMouseEnter={(e) => { if (!isGenerating) e.currentTarget.style.color = "var(--color-text)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = isGenerating ? "var(--color-subtle)" : "var(--color-muted)"; }}
      >
        {isGenerating && generatingMode ? (
          <>
            <span className="loading-dots" style={{ transform: "scale(0.5)" }}>
              <span/>
              <span/>
              <span/>
            </span>
            {!hasContent ? "Generating" : (
              <>
                {generatingMode === "expand" && "Expanding"}
                {generatingMode === "improve" && "Improving"}
                {generatingMode === "replace" && "Replacing"}
              </>
            )}
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
            </svg>
            Generate
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </>
        )}
      </button>
      
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 50,
            minWidth: "120px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-elevated)",
            overflow: "hidden",
            animation: "scaleIn 0.15s ease-out",
          }}
        >
          {hasContent && (
            <>
              <button
                type="button"
                onClick={() => handleSelect("expand")}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  border: "none",
                  background: "transparent",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background var(--transition-fast)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                Expand
              </button>
              <button
                type="button"
                onClick={() => handleSelect("improve")}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  border: "none",
                  borderTop: "1px solid var(--color-border-subtle)",
                  background: "transparent",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background var(--transition-fast)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                Improve
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => handleSelect("replace")}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "none",
              borderTop: hasContent ? "1px solid var(--color-border-subtle)" : "none",
              background: "transparent",
              color: "var(--color-text)",
              cursor: "pointer",
              textAlign: "left",
              transition: "background var(--transition-fast)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {hasContent ? "Replace" : "Generate"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Editable Field Component
// ============================================

function EditableField({
  label,
  value,
  onChange,
  onGenerateAI,
  isGenerating,
  generatingMode,
  multiline,
  placeholder,
  maxLength,
  showAI,
  helpText,
  fieldVersions,
  onRevert,
  field,
  productId,
  canInlineRevert,
  onInlineRevert,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onGenerateAI?: (mode: AIGenerateMode) => void;
  isGenerating?: boolean;
  generatingMode?: AIGenerateMode;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  showAI?: boolean;
  helpText?: string;
  fieldVersions?: Array<{ version: number; value: string; createdAt: Date; source: string }>;
  onRevert?: (field: string, version: number) => void;
  field?: string;
  productId?: string;
  canInlineRevert?: boolean;
  onInlineRevert?: () => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const inputId = useId();

  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px"
      }}>
        <label
          htmlFor={inputId}
          style={{
          fontSize: "var(--text-xs)",
          fontWeight: 500,
          color: "var(--color-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          {label}
        </label>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {canInlineRevert && onInlineRevert && (
            <button
              type="button"
              onClick={onInlineRevert}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 500,
                border: "none",
                borderRadius: "var(--radius-md)",
                backgroundColor: "transparent",
                color: "var(--color-muted)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-muted)"; }}
              title="Revert to original value"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              Undo
            </button>
          )}
          {showAI && onGenerateAI && (
            <AIGenerateDropdown
              onGenerate={onGenerateAI}
              isGenerating={isGenerating}
              hasContent={!!value.trim()}
              generatingMode={generatingMode}
            />
          )}
        </div>
      </div>
      
      <div style={{ position: "relative" }}>
        {multiline ? (
          <textarea
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={isGenerating}
            style={{
              width: "100%",
              minHeight: "120px",
              padding: "12px 14px",
              fontSize: "var(--text-base)",
              fontFamily: "var(--font-body)",
              color: "var(--color-text)",
              backgroundColor: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              resize: "vertical",
              opacity: isGenerating ? 0.6 : 1,
              transition: "border-color var(--transition-fast)",
              outline: "none",
            }}
            onMouseEnter={(e) => { if (!isFocused) e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
            onMouseLeave={(e) => { if (!isFocused) e.currentTarget.style.borderColor = "var(--color-border)"; }}
          />
        ) : (
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={isGenerating}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: "var(--text-base)",
              fontFamily: "var(--font-body)",
              color: "var(--color-text)",
              backgroundColor: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              opacity: isGenerating ? 0.6 : 1,
              transition: "border-color var(--transition-fast)",
              outline: "none",
            }}
            onMouseEnter={(e) => { if (!isFocused) e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
            onMouseLeave={(e) => { if (!isFocused) e.currentTarget.style.borderColor = "var(--color-border)"; }}
          />
        )}
      </div>
      
      {(helpText || maxLength) && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "6px",
          gap: "12px",
        }}>
          {helpText && (
            <span style={{
              color: "var(--color-subtle)",
              fontSize: "11px"
            }}>
              {helpText}
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
            {maxLength && (
              <span style={{
                color: value.length > maxLength * 0.9 ? (value.length > maxLength ? "var(--color-error)" : "var(--color-warning)") : "var(--color-subtle)",
                fontWeight: 400,
                fontSize: "11px",
              }}>
                {value.length}/{maxLength}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Autocomplete Field Component
// ============================================

function AutocompleteField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync inputValue with prop value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter options based on input
  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(inputValue.toLowerCase()) &&
    option.toLowerCase() !== inputValue.toLowerCase()
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleSelectOption = (option: string) => {
    setInputValue(option);
    onChange(option);
    setIsOpen(false);
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (filteredOptions.length > 0 || options.length > 0) {
      setIsOpen(true);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Delay closing to allow click on option
    setTimeout(() => setIsOpen(false), 150);
  };

  // Show all options when input is empty, filtered when typing
  const displayOptions = inputValue.trim() === "" 
    ? options.slice(0, 10) 
    : filteredOptions.slice(0, 10);

  return (
    <div style={{ marginBottom: "20px" }} ref={dropdownRef}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px"
      }}>
        <label
          htmlFor={inputId}
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 500,
            color: "var(--color-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </label>
      </div>

      <div style={{ position: "relative" }}>
        <input
          id={inputId}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: "100%",
            padding: "10px 14px",
            fontSize: "var(--text-base)",
            fontFamily: "var(--font-body)",
            color: "var(--color-text)",
            backgroundColor: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            transition: "border-color var(--transition-fast)",
            outline: "none",
          }}
          onMouseEnter={(e) => { if (!isFocused) e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
          onMouseLeave={(e) => { if (!isFocused) e.currentTarget.style.borderColor = "var(--color-border)"; }}
        />

        {/* Dropdown arrow indicator */}
        <div
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: "var(--color-muted)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>

        {/* Dropdown options */}
        {isOpen && displayOptions.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 50,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-elevated)",
              overflow: "hidden",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            {displayOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleSelectOption(option)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 400,
                  border: "none",
                  background: "transparent",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background var(--transition-fast)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Version History Dropdown Component
// ============================================

function VersionHistoryDropdown({
  field,
  versions,
  onRevert,
  productId,
}: {
  field: string;
  versions: Array<{ version: number; value: string; createdAt: Date; source: string }>;
  onRevert: (field: string, version: number) => void;
  productId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleVersionRevert = (version: number) => {
    setIsOpen(false);
    onRevert(field, version);
  };

  // Only show the 2 most recent versions for reverting
  const recentVersions = versions.slice(-2).reverse();

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: "2px 6px",
          fontSize: "var(--text-xs)",
          fontWeight: 500,
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-primary)",
          cursor: "pointer",
          transition: "all var(--transition-fast)",
        }}
        title="View version history"
      >
        Revert
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 50,
            minWidth: "200px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-elevated)",
            overflow: "hidden",
          }}
        >
          {recentVersions.map((version) => {
            // Parse value for display (handle arrays for tags)
            let displayValue: string;
            try {
              const parsed = JSON.parse(version.value);
              if (Array.isArray(parsed)) {
                displayValue = parsed.join(", ");
              } else {
                displayValue = parsed;
              }
            } catch {
              displayValue = version.value;
            }

            // Strip HTML if this is a description field
            if (field === 'description' || field === 'descriptionHtml') {
              displayValue = stripHtml(displayValue);
            }

            // Truncate long content for display
            const truncatedValue = displayValue.length > 50 ? displayValue.slice(0, 50) + "..." : displayValue;

            return (
              <button
                key={version.version}
                type="button"
                onClick={() => handleVersionRevert(version.version)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  border: "none",
                  background: "transparent",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background var(--transition-fast)",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ fontWeight: 600 }}>
                    Version {version.version}
                  </div>
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "11px", fontWeight: 400 }}>
                    {truncatedValue}
                  </div>
                  <div style={{ color: "var(--color-muted)", fontSize: "10px" }}>
                    {new Date(version.createdAt).toLocaleDateString()} • {version.source.replace("ai_", "").replace("_", " ")}
                  </div>
                </div>
              </button>
            );
          })}
          {recentVersions.length === 0 && (
            <div style={{
              padding: "12px",
              fontSize: "var(--text-xs)",
              color: "var(--color-muted)",
              textAlign: "center",
            }}>
              No versions available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Tags Input Component
// ============================================

function TagsInput({
  tags,
  onChange,
  onGenerateAI,
  isGenerating,
  generatingMode,
  showAI,
  fieldVersions,
  onRevert,
  field,
  productId,
  canInlineRevert,
  onInlineRevert,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  onGenerateAI?: (mode: AIGenerateMode) => void;
  isGenerating?: boolean;
  generatingMode?: AIGenerateMode;
  showAI?: boolean;
  fieldVersions?: Array<{ version: number; value: string; createdAt: Date; source: string }>;
  onRevert?: (field: string, version: number) => void;
  field?: string;
  productId?: string;
  canInlineRevert?: boolean;
  onInlineRevert?: () => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when adding tag
  useEffect(() => {
    if (isAddingTag && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAddingTag]);

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue("");
    setIsAddingTag(false);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove));
  };

  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px"
      }}>
        <label style={{
          fontSize: "var(--text-xs)",
          fontWeight: 500,
          color: "var(--color-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          Tags
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {canInlineRevert && onInlineRevert && (
            <button
              type="button"
              onClick={onInlineRevert}
              style={{
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 500,
                border: "none",
                borderRadius: "var(--radius-md)",
                backgroundColor: "transparent",
                color: "var(--color-muted)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-muted)"; }}
              title="Revert to original value"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              Undo
            </button>
          )}
          {showAI && onGenerateAI && (
            <AIGenerateDropdown
              onGenerate={onGenerateAI}
              isGenerating={isGenerating}
              hasContent={tags.length > 0}
              generatingMode={generatingMode}
            />
          )}
        </div>
      </div>
      
      {/* Tags display - Minimal pills */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        opacity: isGenerating ? 0.5 : 1,
        transition: "opacity var(--transition-fast)",
      }}>
        {tags.map(tag => (
          <span
            key={tag}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface-strong)",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text)",
              transition: "all var(--transition-fast)",
              userSelect: "none",
              fontWeight: 400,
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => !isGenerating && removeTag(tag)}
              disabled={isGenerating}
              style={{
                background: "none",
                border: "none",
                cursor: isGenerating ? "default" : "pointer",
                padding: "2px",
                margin: "-2px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-muted)",
                borderRadius: "50%",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-muted)"; }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </span>
        ))}

        {/* Add tag input or button - Minimal */}
        {isAddingTag ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(inputValue);
                setIsAddingTag(false);
              }
              if (e.key === "Escape") {
                setInputValue("");
                setIsAddingTag(false);
              }
            }}
            onBlur={() => {
              const trimmedValue = inputValue.trim();
              if (trimmedValue) {
                const normalizedTag = trimmedValue.toLowerCase();
                if (!tags.includes(normalizedTag)) {
                  onChange([...tags, normalizedTag]);
                }
              }
              setInputValue("");
              setIsAddingTag(false);
            }}
            placeholder="Tag name"
            disabled={isGenerating}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 12px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-sm)",
              color: "var(--color-text)",
              outline: "none",
              minWidth: "100px",
              fontWeight: 400,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => !isGenerating && setIsAddingTag(true)}
            disabled={isGenerating}
            aria-label="Add new tag"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 12px",
              backgroundColor: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-sm)",
              color: isGenerating ? "var(--color-subtle)" : "var(--color-muted)",
              cursor: isGenerating ? "default" : "pointer",
              transition: "all var(--transition-fast)",
              userSelect: "none",
              fontWeight: 400,
            }}
            onMouseEnter={(e) => { 
              if (!isGenerating) {
                e.currentTarget.style.borderColor = "var(--color-border-strong)";
                e.currentTarget.style.color = "var(--color-text)";
              }
            }}
            onMouseLeave={(e) => { 
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.color = isGenerating ? "var(--color-subtle)" : "var(--color-muted)";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Add
          </button>
        )}
      </div>

    </div>
  );
}

// ============================================
// Image Manager Component
// ============================================

function ImageManager({
  images,
  featuredImageId,
  productId,
  productTitle,
  aiAvailable,
  onRefresh,
  generatingImage,
  generatingBulkAlt,
  setGeneratingBulkAlt,
  onOpenImagePromptModal,
  onAltTextChange,
}: {
  images: Array<{ id: string; url: string; altText: string | null }>;
  featuredImageId: string | null;
  productId: string;
  productTitle: string;
  aiAvailable: boolean;
  onRefresh: () => void;
  generatingImage?: boolean;
  generatingBulkAlt?: boolean;
  setGeneratingBulkAlt?: (val: boolean) => void;
  onOpenImagePromptModal: () => void;
  onAltTextChange?: (imageId: string, altText: string) => void;
}) {
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  const [generatingAlt, setGeneratingAlt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const shopify = useAppBridge();

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const img of images) {
      initial[img.id] = img.altText || "";
    }
    setAltTexts(initial);
  }, [images]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("intent", "upload");
      formData.append("file", file);

      const response = await fetch(
        `/api/products/${encodeURIComponent(productId)}/images`,
        { method: "POST", body: formData }
      );
      const data = await response.json();

      if (data.error) {
        shopify.toast.show(data.error);
      } else {
        shopify.toast.show("Image uploaded!");
        onRefresh();
      }
    } catch {
      shopify.toast.show("Failed to upload image");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm("Delete this image?")) return;

    setDeleting(imageId);
    try {
      const formData = new FormData();
      formData.append("intent", "delete");
      formData.append("imageId", imageId);

      const response = await fetch(
        `/api/products/${encodeURIComponent(productId)}/images`,
        { method: "POST", body: formData }
      );
      const data = await response.json();

      if (data.error) {
        shopify.toast.show(data.error);
      } else {
        shopify.toast.show("Image deleted");
        onRefresh();
      }
    } catch {
      shopify.toast.show("Failed to delete image");
    } finally {
      setDeleting(null);
    }
  };

  const handleSetFeatured = async (imageId: string) => {
    try {
      const formData = new FormData();
      formData.append("intent", "set_featured");
      formData.append("imageId", imageId);

      const response = await fetch(
        `/api/products/${encodeURIComponent(productId)}/images`,
        { method: "POST", body: formData }
      );
      const data = await response.json();

      if (data.error) {
        shopify.toast.show(data.error);
      } else {
        shopify.toast.show("Featured image updated");
        onRefresh();
      }
    } catch {
      shopify.toast.show("Failed to set featured image");
    }
  };

  const handleGenerateAlt = async (imageId: string, index: number) => {
    setGeneratingAlt(imageId);
    try {
      const formData = new FormData();
      formData.append("intent", "generate_alt");
      formData.append("imageId", imageId);
      formData.append("imageIndex", String(index));

      const response = await fetch(
        `/api/products/${encodeURIComponent(productId)}/images`,
        { method: "POST", body: formData }
      );
      const data = await response.json();

      if (data.error) {
        shopify.toast.show(data.error);
      } else {
        setAltTexts(prev => ({ ...prev, [imageId]: data.altText }));
        onAltTextChange?.(imageId, data.altText);
        shopify.toast.show("Alt text generated!");
      }
    } catch {
      shopify.toast.show("Failed to generate alt text");
    } finally {
      setGeneratingAlt(null);
    }
  };

  const handleSaveAlt = (imageId: string) => {
    const newAltText = altTexts[imageId] || "";
    onAltTextChange?.(imageId, newAltText);
    setEditingAlt(null);
    shopify.toast.show("Alt text updated");
  };

  const openImagePromptModal = useCallback(() => {
    onOpenImagePromptModal();
  }, [onOpenImagePromptModal]);

  return (
    <div>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "16px" 
      }}>
        <label style={{ 
          fontSize: "var(--text-xs)",
          fontWeight: 500,
          color: "var(--color-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          Images {images.length > 0 && `(${images.length})`}
        </label>
        <ImageAddDropdown
          aiAvailable={aiAvailable}
          onUpload={() => document.getElementById("image-upload")?.click()}
          onGenerate={openImagePromptModal}
          uploading={uploading}
        />
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </div>

      {images.length === 0 ? (
        <div style={{
          border: "1px dashed var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "40px",
          textAlign: "center",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-subtle)" strokeWidth="1" style={{ marginBottom: "12px" }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <div style={{ color: "var(--color-muted)", fontSize: "var(--text-sm)", marginBottom: "16px" }}>
            No images yet
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-full)",
              backgroundColor: "transparent",
              color: "var(--color-text)",
              cursor: "pointer",
              transition: "all var(--transition-fast)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "12px",
        }}>
          {generatingImage && (
            <div
              style={{
                position: "relative",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                backgroundColor: "var(--color-primary-soft)",
                transition: "all var(--transition-fast)",
              }}
            >
              {/* Generating Placeholder */}
              <div style={{
                width: "100%",
                paddingTop: "100%",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "16px",
                }}>
                  {/* Spinner */}
                  <svg 
                    width="48" 
                    height="48" 
                    viewBox="0 0 24 24" 
                    fill="none"
                    style={{
                      animation: "spin 1s linear infinite",
                    }}
                  >
                    <circle 
                      cx="12" 
                      cy="12" 
                      r="10" 
                      stroke="rgba(31, 79, 216, 0.15)" 
                      strokeWidth="3"
                    />
                    <path 
                      d="M12 2a10 10 0 0 1 10 10" 
                      stroke="var(--color-primary)" 
                      strokeWidth="3" 
                      strokeLinecap="round"
                    />
                  </svg>
                  <div style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--color-primary)",
                    fontWeight: 500,
                    textAlign: "center",
                  }}>
                    Generating...
                  </div>
                </div>
              </div>
            </div>
          )}
          {images.map((image, index) => (
            <div
              key={image.id}
              style={{
                position: "relative",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                backgroundColor: "var(--color-surface-strong)",
                border: "1px solid var(--color-border)",
                transition: "all var(--transition-fast)",
              }}
            >
              {/* Image */}
              <div style={{
                width: "100%",
                paddingTop: "100%",
                position: "relative",
              }}>
                <img
                  src={image.url}
                  alt={altTexts[image.id] || image.altText || productTitle}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>

              {/* Featured Badge - Minimal */}
              {featuredImageId === image.id && (
                <div style={{
                  position: "absolute",
                  top: "6px",
                  left: "6px",
                  padding: "3px 8px",
                  fontSize: "10px",
                  fontWeight: 600,
                  background: "rgba(0, 0, 0, 0.7)",
                  color: "#fff",
                  borderRadius: "var(--radius-md)",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}>
                  Featured
                </div>
              )}

              {/* Actions */}
              <div style={{
                position: "absolute",
                top: "6px",
                right: "6px",
              }}>
                <ImageActionsDropdown
                  imageId={image.id}
                  isFeatured={featuredImageId === image.id}
                  aiAvailable={aiAvailable}
                  isGeneratingAlt={generatingAlt === image.id}
                  isGeneratingBulkAlt={generatingBulkAlt}
                  isDeleting={deleting === image.id}
                  onSetFeatured={() => handleSetFeatured(image.id)}
                  onEdit={() => setEditingAlt(image.id)}
                  onGenerateAlt={() => handleGenerateAlt(image.id, index)}
                  onDelete={() => handleDeleteImage(image.id)}
                />
              </div>

              {/* Alt Text Editor - Minimal */}
              <div style={{
                padding: "10px",
                backgroundColor: "var(--color-surface)",
              }}>
                {editingAlt === image.id ? (
                  <div>
                    <input
                      type="text"
                      value={altTexts[image.id] || ""}
                      onChange={(e) => setAltTexts(prev => ({ 
                        ...prev, 
                        [image.id]: e.target.value 
                      }))}
                      placeholder="Alt text..."
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        fontSize: "11px",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        marginBottom: "6px",
                        outline: "none",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveAlt(image.id);
                        if (e.key === "Escape") setEditingAlt(null);
                      }}
                    />
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        type="button"
                        onClick={() => handleSaveAlt(image.id)}
                        style={{
                          flex: 1,
                          padding: "4px 8px",
                          fontSize: "11px",
                          fontWeight: 500,
                          border: "none",
                          borderRadius: "var(--radius-md)",
                          background: "var(--color-text)",
                          color: "var(--color-surface)",
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingAlt(null)}
                        style={{
                          flex: 1,
                          padding: "4px 8px",
                          fontSize: "11px",
                          fontWeight: 500,
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-md)",
                          backgroundColor: "transparent",
                          color: "var(--color-text)",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (generatingAlt === image.id || generatingBulkAlt) ? (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--color-primary)",
                      fontStyle: "italic",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{
                        animation: "spin 1s linear infinite",
                      }}
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                      <path
                        d="M12 2a10 10 0 0 1 10 10"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    {generatingBulkAlt ? "Generating alt text..." : "Generating..."}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "11px",
                      color: (altTexts[image.id] || image.altText) ? "var(--color-muted)" : "var(--color-subtle)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={altTexts[image.id] || image.altText || "No alt text"}
                  >
                    {altTexts[image.id] || image.altText || "No alt text"}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Checklist Sidebar
// ============================================

// Map checklist keys to section IDs - granular targeting for specific fields
// Note: has_collections is intentionally omitted as it's not editable on this page
const CHECKLIST_KEY_TO_SECTION: Record<string, string | null> = {
  min_title_length: "field-title",
  min_description_length: "field-description",
  min_images: "section-images",
  images_have_alt_text: "section-images",
  seo_title: "field-seo-title",
  seo_description: "field-seo-description",
  has_collections: null, // Not editable here - managed in Shopify admin
  has_product_type: "field-product-type",
  has_vendor: "field-vendor",
  has_tags: "field-tags",
};

// Order checklist items to match visual layout on page
const CHECKLIST_KEY_ORDER: Record<string, number> = {
  min_title_length: 1,      // Title (top of Product Info)
  has_vendor: 2,            // Vendor (Product Info)
  has_product_type: 3,      // Product Type (Product Info)
  min_description_length: 4, // Description
  has_tags: 5,              // Tags
  min_images: 6,            // Images
  images_have_alt_text: 7,  // Images alt text
  seo_title: 8,             // SEO Title
  seo_description: 9,       // SEO Description
  has_collections: 10,      // Collections (not directly editable)
};

function ChecklistSidebar({ 
  audit,
  onRescan,
  isRescanning,
  onItemClick,
  onAutoFixCollection,
  canAutoFixCollection,
  onChooseCollection,
}: { 
  audit: {
    status: string;
    passedCount: number;
    failedCount: number;
    totalCount: number;
    items: Array<{
      key: string;
      label: string;
      status: string;
      details: string | null;
    }>;
  } | null;
  onRescan?: () => void;
  isRescanning?: boolean;
  onItemClick?: (key: string) => void;
  onAutoFixCollection?: () => void;
  canAutoFixCollection?: boolean;
  onChooseCollection?: () => void;
}) {
  if (!audit) return null;

  const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100);

  return (
    <div>
      {/* Progress - Minimal */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "8px",
        }}>
          <span style={{ 
            fontSize: "var(--text-sm)", 
            fontWeight: 600,
            color: "var(--color-text)",
          }}>
            Checklist
          </span>
          <span style={{ 
            fontSize: "var(--text-xs)", 
            color: "var(--color-muted)",
          }}>
            {audit.passedCount}/{audit.totalCount}
          </span>
        </div>
        <div style={{
          height: "4px",
          backgroundColor: "var(--color-surface-strong)",
          borderRadius: "var(--radius-full)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${progressPercent}%`,
            background: audit.status === "ready" 
              ? "var(--color-success)"
              : "var(--color-text)",
            transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            borderRadius: "var(--radius-full)",
          }} />
        </div>
        {audit.status !== "ready" && (
          <p style={{
            margin: "8px 0 0",
            fontSize: "var(--text-xs)",
            color: "var(--color-muted)",
          }}>
            {audit.failedCount} item{audit.failedCount !== 1 ? 's' : ''} to complete
          </p>
        )}
      </div>
      
      {/* Items - Minimal list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {audit.items.map((item, index) => {
          const isExternalOnly = item.key === "has_collections";
          
          return (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "var(--text-sm)",
                padding: "10px 8px",
                borderRadius: "var(--radius-md)",
                border: "none",
                width: "100%",
                textAlign: "left",
                cursor: isExternalOnly ? "default" : "pointer",
                transition: "background var(--transition-fast)",
              }}
              onClick={() => !isExternalOnly && onItemClick?.(item.key)}
              onMouseEnter={(e) => {
                if (!isExternalOnly) {
                  e.currentTarget.style.background = "var(--color-surface-strong)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                border: item.status === "passed" ? "none" : "1.5px solid var(--color-border-strong)",
                background: item.status === "passed" ? "var(--color-success)" : "transparent",
                color: item.status === "passed" ? "#fff" : "var(--color-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                {item.status === "passed" && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </span>
              <span style={{ 
                color: item.status === "passed" ? "var(--color-muted)" : "var(--color-text)",
                lineHeight: "1.4",
                fontWeight: 400,
                flex: 1,
                textDecoration: item.status === "passed" ? "line-through" : "none",
                opacity: item.status === "passed" ? 0.7 : 1,
              }}>
                {item.label}
              </span>
              {isExternalOnly && item.status === "failed" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canAutoFixCollection) {
                      onAutoFixCollection?.();
                    } else {
                      onChooseCollection?.();
                    }
                  }}
                  style={{
                    padding: "3px 8px",
                    fontSize: "10px",
                    fontWeight: 600,
                    borderRadius: "var(--radius-md)",
                    border: canAutoFixCollection ? "none" : "1px solid var(--color-border)",
                    background: canAutoFixCollection ? "var(--color-text)" : "transparent",
                    color: canAutoFixCollection ? "var(--color-surface)" : "var(--color-text)",
                    cursor: "pointer",
                    transition: "opacity var(--transition-fast)",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  {canAutoFixCollection ? "Fix" : "Choose"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Rescan - Minimal text button */}
      {onRescan && (
        <button
          type="button"
          onClick={onRescan}
          disabled={isRescanning}
          style={{
            marginTop: "16px",
            width: "100%",
            padding: "10px",
            fontSize: "var(--text-xs)",
            fontWeight: 500,
            border: "none",
            borderRadius: "var(--radius-md)",
            backgroundColor: "transparent",
            color: isRescanning ? "var(--color-subtle)" : "var(--color-muted)",
            cursor: isRescanning ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={(e) => { 
            if (!isRescanning) e.currentTarget.style.color = "var(--color-text)"; 
          }}
          onMouseLeave={(e) => { 
            e.currentTarget.style.color = isRescanning ? "var(--color-subtle)" : "var(--color-muted)"; 
          }}
        >
          {isRescanning ? (
            <>
              <span className="loading-dots" style={{ transform: "scale(0.6)" }}>
                <span/>
                <span/>
                <span/>
              </span>
              Rescanning
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
              Rescan
            </>
          )}
        </button>
      )}
    </div>
  );
}

// Unused old code removed - new minimal design implemented above

// ============================================
// Main Component
// ============================================

export default function ProductEditor() {
  const { product, audit, aiAvailable, navigation, defaultCollectionId, collections, autocomplete, tourCompleted } = useLoaderData<typeof loader>();
  const [currentDefaultCollectionId, setCurrentDefaultCollectionId] = useState(defaultCollectionId);
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();

  const [form, setForm] = useState({
    title: product.title,
    description: product.descriptionHtml.replace(/<[^>]*>/g, ""),
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
  });

  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [generatingModes, setGeneratingModes] = useState<Record<string, AIGenerateMode>>({});
  const [fieldVersions, setFieldVersions] = useState<Record<string, Array<{ version: number; value: string; createdAt: Date; source: string }>>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [altTextChanges, setAltTextChanges] = useState<Record<string, string>>({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // Check if tour has been completed
  useEffect(() => {
    if (!tourCompleted) {
      setOnboardingOpen(true);
    }
  }, [tourCompleted]);

  const completeOnboarding = async () => {
    try {
      // Save tour completion to database
      await fetch(`/api/tour/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      setOnboardingOpen(false);
    } catch (error) {
      console.error('Failed to save tour completion:', error);
      // Still close the modal even if saving fails
      setOnboardingOpen(false);
    }
  };

  // Track pre-generation values for inline revert (before save)
  const [preGenerationValues, setPreGenerationValues] = useState<Record<string, string | string[]>>({});
  // Track which fields have been AI-generated since last save
  const [aiGeneratedFields, setAiGeneratedFields] = useState<Set<string>>(new Set());

  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  const [upsellState, setUpsellState] = useState<{
    isOpen: boolean;
    errorCode?: string;
    message?: string;
  }>({
    isOpen: false,
  });

  const [imagePromptModal, setImagePromptModal] = useState<{
    isOpen: boolean;
    customPrompt: string;
    generateAlt: boolean;
  }>({
    isOpen: false,
    customPrompt: "",
    generateAlt: true,
  });

  const openImagePromptModal = useCallback(() => {
    setImagePromptModal(prev => ({ ...prev, isOpen: true }));
  }, []);

  const [generateAllModal, setGenerateAllModal] = useState<{
    isOpen: boolean;
    selectedFields: string[];
  }>({
    isOpen: false,
    selectedFields: [],
  });

  const [fieldOptions, setFieldOptions] = useState<Record<string, string[]>>({});

  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingBulkAlt, setGeneratingBulkAlt] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);

  // Detect changes
  useEffect(() => {
    const originalDesc = product.descriptionHtml.replace(/<[^>]*>/g, "");
    const formChanged =
      form.title !== product.title ||
      form.description !== originalDesc ||
      form.vendor !== product.vendor ||
      form.productType !== product.productType ||
      form.tags.join(",") !== product.tags.join(",") ||
      form.seoTitle !== product.seoTitle ||
      form.seoDescription !== product.seoDescription;

    const altTextChanged = Object.keys(altTextChanges).some(imageId => {
      const originalAlt = product.images?.find((img: { id: string; altText: string | null }) => img.id === imageId)?.altText || "";
      return altTextChanges[imageId] !== originalAlt;
    });

    setHasChanges(formChanged || altTextChanged);
  }, [form, product, altTextChanges]);

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  // Block in-app navigation when there are unsaved changes
  const blocker = useBlocker(hasChanges);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showRescanConfirmDialog, setShowRescanConfirmDialog] = useState(false);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowUnsavedDialog(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      setPreGenerationValues({});
      setAiGeneratedFields(new Set());
      setAltTextChanges({}); // Clear alt text changes after successful save
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error);
    }
    if (fetcher.data?.openProduct) {
      shopify.intents.invoke?.("edit:shopify/Product", {
        value: fetcher.data.openProduct,
      });
    }
  }, [fetcher.data, shopify]);

  // Load field versions on mount
  useEffect(() => {
    const loadVersions = async () => {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/versions`);
        if (response.ok) {
          const data = await response.json();
          setFieldVersions(data.versions || {});
        }
      } catch (error) {
        console.error("Failed to load field versions:", error);
      }
    };
    loadVersions();
  }, [product.id]);

  const updateField = useCallback((field: string, value: string | string[]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const generateAIContent = useCallback((
    type: string,
    field: string,
    mode: AIGenerateMode
  ) => {
    const currentValue = form[field as keyof typeof form];
    if (currentValue && !preGenerationValues[field]) {
      setPreGenerationValues(prev => ({ ...prev, [field]: currentValue }));
    }

    setGenerating(prev => new Set([...prev, field]));
    setGeneratingModes(prev => ({ ...prev, [field]: mode }));

    const formData = new FormData();
    formData.append("type", type);
    formData.append("mode", mode);

    fetch(`/api/products/${encodeURIComponent(product.id)}/suggest`, {
      method: "POST",
      body: formData
    })
      .then(response => response.json())
      .then(data => {
        setGenerating(currentGenerating => {
          const next = new Set(currentGenerating);
          next.delete(field);
          return next;
        });
        setGeneratingModes(prev => {
          const next = { ...prev };
          delete next[field];
          return next;
        });

        if (data.error) {
          setUpsellState({
            isOpen: true,
            errorCode: data.errorCode,
            message: data.error,
          });
        } else {
          if (type === "tags") {
            const tags = Array.isArray(data.suggestion)
              ? data.suggestion
              : data.suggestion.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);
            updateField(field, tags);
          } else {
            updateField(field, data.suggestion);
          }
          setAiGeneratedFields(prev => new Set([...prev, field]));
          shopify.toast.show("Applied!");
        }
      })
      .catch(() => {
        setGenerating(currentGenerating => {
          const next = new Set(currentGenerating);
          next.delete(field);
          return next;
        });
        setGeneratingModes(prev => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
        setUpsellState({
          isOpen: true,
          message: "Failed to generate",
        });
      });
  }, [product.id, updateField, shopify, form, preGenerationValues]);

  const revertToPreGeneration = useCallback((field: string) => {
    const originalValue = preGenerationValues[field];
    if (originalValue !== undefined) {
      updateField(field, originalValue);
      setAiGeneratedFields(prev => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
      setPreGenerationValues(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      shopify.toast.show("Reverted");
    }
  }, [preGenerationValues, updateField, shopify]);

  // Handle checklist item click - scroll to and highlight section
  const handleChecklistItemClick = useCallback((key: string) => {
    const sectionId = CHECKLIST_KEY_TO_SECTION[key];
    
    // Handle items that aren't editable on this page - open in Shopify admin
    if (sectionId === null) {
      if (key === "has_collections") {
        fetcher.submit({ intent: "open_product" }, { method: "POST" });
      }
      return;
    }
    
    if (!sectionId) return;

    const element = document.getElementById(sectionId);
    if (element) {
      // Scroll to element with offset for header
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [fetcher]);

  const closeImagePromptModal = useCallback(() => {
    setImagePromptModal({
      isOpen: false,
      customPrompt: "",
      generateAlt: true,
    });
  }, []);

  const handleGenerateImages = useCallback(async () => {
    setGeneratingImage(true);
    // Clear any unsaved changes flag temporarily to prevent blocking
    setHasChanges(false);
    try {
      const formData = new FormData();
      formData.append("intent", "generate_image");
      if (imagePromptModal.customPrompt.trim()) {
        formData.append("customPrompt", imagePromptModal.customPrompt.trim());
      }
      if (imagePromptModal.generateAlt) {
        formData.append("generateAlt", "true");
      }

      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}/images`,
        { method: "POST", body: formData }
      );

      const data = await response.json();

      if (data.error) {
        shopify.toast.show(data.error);
      } else {
        shopify.toast.show(imagePromptModal.generateAlt ? "Image and alt text generated successfully!" : "Image generated successfully!");
        closeImagePromptModal();
        // Reset the custom prompt for next time
        setImagePromptModal(prev => ({ ...prev, customPrompt: "" }));
        // Revalidate to refresh product data
        revalidator.revalidate();
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      shopify.toast.show("Failed to generate image");
    } finally {
      setGeneratingImage(false);
    }
  }, [imagePromptModal.customPrompt, imagePromptModal.generateAlt, shopify, closeImagePromptModal, product.id, revalidator]);

  // Load field versions
  const loadFieldVersions = useCallback(async () => {
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/versions`);
      if (response.ok) {
        const data = await response.json();
        setFieldVersions(data.versions || {});
      }
    } catch (error) {
      console.error("Failed to load field versions:", error);
    }
  }, [product.id]);

  // Handle reverting to a previous version
  const handleRevert = useCallback(async (field: string, version: number) => {
    try {
      const formData = new FormData();
      formData.append("field", field);
      formData.append("version", version.toString());

      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}/revert`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.error) {
        shopify.toast.show(`Failed to revert: ${data.error}`);
        return;
      }

      // Update the field value
      if (field === "tags") {
        updateField("tags", Array.isArray(data.value) ? data.value : []);
      } else {
        updateField(field, data.value);
      }

      shopify.toast.show(`Reverted to version ${version}`);
    } catch (error) {
      console.error("Revert error:", error);
      shopify.toast.show("Failed to revert field version");
    }
  }, [product.id, shopify, updateField]);



  const handleGenerateSelected = useCallback(async () => {
    const selectedFieldKeys = Object.keys(fieldOptions).filter(key => (fieldOptions[key]?.length || 0) > 0);
    const regularFields = generateAllModal.selectedFields.filter(field => !selectedFieldKeys.includes(field));

    if (selectedFieldKeys.length === 0 && regularFields.length === 0) return;

    setGeneratingAll(true);
    // Clear any unsaved changes flag temporarily to prevent blocking
    setHasChanges(false);
    setGenerateAllModal(prev => ({ ...prev, isOpen: false }));

    const fieldMappings = {
      title: { type: "title", field: "title" },
      description: { type: "description", field: "description" },
      tags: { type: "tags", field: "tags" },
      seoTitle: { type: "seo_title", field: "seoTitle" },
      seoDescription: { type: "seo_description", field: "seoDescription" },
    };

    // Handle regular fields
    const regularFieldPromises = regularFields.map(key => fieldMappings[key as keyof typeof fieldMappings]).filter(Boolean).map(async (fieldInfo) => {
      if (!fieldInfo) return;
      const { type, field } = fieldInfo;
      try {
        setGenerating(prev => new Set([...prev, field]));

        const formData = new FormData();
        formData.append("type", type);

        const response = await fetch(
          `/api/products/${encodeURIComponent(product.id)}/suggest`,
          { method: "POST", body: formData }
        );
        const data = await response.json();

        if (!data.error) {
          let value = data.suggestion;

          // Handle tags field: convert string to array if needed
          if (field === "tags" && typeof value === "string") {
            value = value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
          }

          updateField(field, value);
        }
      } finally {
        setGenerating(prev => {
          const next = new Set(prev);
          next.delete(field);
          return next;
        });
      }
    });

    // Handle fields with options (currently just images)
    const optionFieldPromises = selectedFieldKeys.map(async (fieldKey) => {
      const options = fieldOptions[fieldKey] || [];
      if (fieldKey === "images") {
        // Handle image generation options
        const shouldGenerateImage = options.includes("image");
        const shouldGenerateAlt = options.includes("alt");

        if (shouldGenerateImage) {
          try {
            setGeneratingImage(true);
            const formData = new FormData();
            formData.append("intent", "generate_image");
            if (shouldGenerateAlt) {
              formData.append("generateAlt", "true");
            }

            const response = await fetch(
              `/api/products/${encodeURIComponent(product.id)}/images`,
              { method: "POST", body: formData }
            );

            const data = await response.json();

            if (data.error) {
              console.error("Failed to generate image:", data.error);
            }
          } finally {
            setGeneratingImage(false);
          }
        } else if (shouldGenerateAlt) {
          // Only generate alt text for existing images
          try {
            setGeneratingBulkAlt(true);
            const formData = new FormData();
            formData.append("intent", "generate_alt_batch");

            const response = await fetch(
              `/api/products/${encodeURIComponent(product.id)}/images`,
              { method: "POST", body: formData }
            );

            const data = await response.json();

            if (data.error) {
              console.error("Failed to generate alt text:", data.error);
            }
          } catch (error) {
            console.error("Alt text generation failed:", error);
          } finally {
            setGeneratingBulkAlt(false);
          }
        }
      }
    });

    try {
      await Promise.all([...regularFieldPromises, ...optionFieldPromises]);

      const totalGenerated = regularFields.length + selectedFieldKeys.length;
      shopify.toast.show(`${totalGenerated} item${totalGenerated !== 1 ? 's' : ''} generated!`);

      // Revalidate if images were generated
      if (selectedFieldKeys.includes("images")) {
        revalidator.revalidate();
      }
    } catch {
      shopify.toast.show("Some items failed to generate");
    } finally {
      setGeneratingAll(false);
      setGenerateAllModal(prev => ({ ...prev, selectedFields: [] }));
      setFieldOptions({});
    }
  }, [product.id, shopify, updateField, generateAllModal.selectedFields, fieldOptions, revalidator]);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("title", form.title);
    formData.append("descriptionHtml", form.description);
    formData.append("vendor", form.vendor);
    formData.append("productType", form.productType);
    formData.append("tags", form.tags.join(","));
    formData.append("seoTitle", form.seoTitle);
    formData.append("seoDescription", form.seoDescription);

    // Add alt text changes
    Object.entries(altTextChanges).forEach(([imageId, altText]) => {
      formData.append("altTextUpdates", JSON.stringify({ imageId, altText }));
    });

    fetcher.submit(formData, { method: "POST" });
  };

  const handleAltTextChange = (imageId: string, altText: string) => {
    setAltTextChanges(prev => ({ ...prev, [imageId]: altText }));
  };

  const handleRescan = () => {
    if (hasChanges) {
      setShowRescanConfirmDialog(true);
    } else {
      fetcher.submit({ intent: "rescan" }, { method: "POST" });
    }
  };

  const isSaving = fetcher.state !== "idle";
  const isRescanning = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "rescan";

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      gap: "32px", 
      minHeight: "100%",
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "8px 0 48px",
    }}>
      {/* Page Header - Minimal */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            type="button"
            onClick={() => navigate("/app")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--color-muted)",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-strong)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            aria-label="Back to dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <h1 style={{
              fontSize: "var(--text-2xl)",
              fontWeight: 600,
              color: "var(--color-text)",
              margin: 0,
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              {product.title}
              {audit?.status === "ready" && (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="12" fill="#10B981" />
                  <path
                    d="M8.5 12.5L11 15L15.5 9.5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </h1>
            <p style={{
              margin: "4px 0 0",
              fontSize: "var(--text-sm)",
              color: "var(--color-muted)",
            }}>
              Edit product details
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="section-grid split" style={{ gap: "48px", alignItems: "flex-start" }}>
          {/* Main Editor */}
          <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
            
            {/* Product Hero - Featured Image & Title */}
            <div
              id="section-info"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "40px",
                padding: "32px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--color-surface)"
              }}
            >
              <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                {/* Product Image - Larger, more prominent */}
                <div style={{
                  width: "140px",
                  height: "140px",
                  borderRadius: "var(--radius-xl)",
                  overflow: "hidden",
                  backgroundColor: "var(--color-surface-strong)",
                  flexShrink: 0,
                }}>
                  {product.featuredImage ? (
                    <img
                      src={product.featuredImage}
                      alt={product.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-subtle)",
                    }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Title & Basic Info */}
                <div style={{ flex: 1, paddingTop: "4px" }}>
                  <div id="field-title">
                    <EditableField
                      label="Title"
                      value={form.title}
                      onChange={(v) => updateField("title", v)}
                      onGenerateAI={(mode) => generateAIContent("title", "title", mode)}
                      isGenerating={generating.has("title")}
                      generatingMode={generatingModes.title}
                      showAI={aiAvailable}
                      placeholder="Product title"
                      fieldVersions={fieldVersions.title}
                      onRevert={(field, version) => handleRevert(field, version)}
                      field="title"
                      productId={product.id}
                      canInlineRevert={aiGeneratedFields.has("title") && !!preGenerationValues.title}
                      onInlineRevert={() => revertToPreGeneration("title")}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "24px" }}>
                    <div id="field-vendor" style={{ flex: 1 }}>
                      <AutocompleteField
                        label="Vendor"
                        value={form.vendor}
                        onChange={(v) => updateField("vendor", v)}
                        options={autocomplete.vendors}
                        placeholder="Brand or vendor"
                      />
                    </div>
                    <div id="field-product-type" style={{ flex: 1 }}>
                      <AutocompleteField
                        label="Product Type"
                        value={form.productType}
                        onChange={(v) => updateField("productType", v)}
                        options={autocomplete.productTypes}
                        placeholder="e.g., Snowboard"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Description - Full width */}
              <div id="field-description">
                <EditableField
                  label="Description"
                  value={form.description}
                  onChange={(v) => updateField("description", v)}
                  onGenerateAI={(mode) => generateAIContent("description", "description", mode)}
                  isGenerating={generating.has("description")}
                  generatingMode={generatingModes.description}
                  showAI={aiAvailable}
                  multiline
                  placeholder="Describe your product..."
                  fieldVersions={fieldVersions.description}
                  onRevert={(field, version) => handleRevert(field, version)}
                  field="description"
                  productId={product.id}
                  canInlineRevert={aiGeneratedFields.has("description") && !!preGenerationValues.description}
                  onInlineRevert={() => revertToPreGeneration("description")}
                />
              </div>

              {/* Tags */}
              <div style={{ 
                borderTop: "1px solid var(--color-border)", 
                marginTop: "24px", 
                paddingTop: "24px" 
              }}>
                <div id="field-tags">
                  <TagsInput
                    tags={form.tags}
                    onChange={(v) => updateField("tags", v)}
                    onGenerateAI={(mode) => generateAIContent("tags", "tags", mode)}
                    isGenerating={generating.has("tags")}
                    generatingMode={generatingModes.tags}
                    showAI={aiAvailable}
                    fieldVersions={fieldVersions.tags}
                    onRevert={(field, version) => handleRevert(field, version)}
                    field="tags"
                    productId={product.id}
                    canInlineRevert={aiGeneratedFields.has("tags") && !!preGenerationValues.tags}
                    onInlineRevert={() => revertToPreGeneration("tags")}
                  />
                </div>
              </div>
            </div>

            {/* Images Section */}
            <div
              id="section-images"
              style={{
                padding: "32px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--color-surface)"
              }}
            >
              <ImageManager
                images={product.images}
                featuredImageId={product.featuredImageId}
                productId={product.id}
                productTitle={product.title}
                aiAvailable={aiAvailable}
                onRefresh={() => window.location.reload()}
                generatingImage={generatingImage}
                generatingBulkAlt={generatingBulkAlt}
                setGeneratingBulkAlt={setGeneratingBulkAlt}
                onOpenImagePromptModal={openImagePromptModal}
                onAltTextChange={handleAltTextChange}
              />
            </div>

            {/* SEO Section */}
            <div
              id="section-seo"
              style={{
                padding: "32px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--color-surface)"
              }}
            >
              <h3 style={{
                margin: "0 0 32px",
                fontFamily: "var(--font-heading)",
                fontSize: "var(--text-lg)",
                fontWeight: 600,
                color: "var(--color-text)",
                letterSpacing: "-0.01em",
              }}>
                Search Engine Listing
              </h3>
              
              {/* Preview - Cleaner styling */}
              <div style={{
                padding: "20px 24px",
                backgroundColor: "var(--color-surface-strong)",
                borderRadius: "var(--radius-lg)",
                marginBottom: "32px",
              }}>
                <div style={{ 
                  color: "#1a0dab", 
                  fontSize: "var(--text-lg)", 
                  marginBottom: "4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 400,
                }}>
                  {form.seoTitle || form.title || "Page title"}
                </div>
                <div style={{ 
                  color: "#006621", 
                  fontSize: "var(--text-sm)", 
                  marginBottom: "8px",
                  fontWeight: 400,
                }}>
                  yourstore.com › products › {product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
                </div>
                <div style={{ 
                  color: "#545454", 
                  fontSize: "var(--text-sm)",
                  lineHeight: "1.6",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {form.seoDescription || form.description.slice(0, 160) || "Add a meta description to see how it might appear on search engines."}
                </div>
              </div>

              <div id="field-seo-title">
                <EditableField
                  label="SEO Title"
                  value={form.seoTitle}
                  onChange={(v) => updateField("seoTitle", v)}
                  onGenerateAI={(mode) => generateAIContent("seo_title", "seoTitle", mode)}
                  isGenerating={generating.has("seoTitle")}
                  generatingMode={generatingModes.seoTitle}
                  showAI={aiAvailable}
                  placeholder={form.title}
                  maxLength={60}
                  helpText="50-60 characters recommended"
                  fieldVersions={fieldVersions.seoTitle}
                  onRevert={(field, version) => handleRevert(field, version)}
                  field="seoTitle"
                  productId={product.id}
                  canInlineRevert={aiGeneratedFields.has("seoTitle") && !!preGenerationValues.seoTitle}
                  onInlineRevert={() => revertToPreGeneration("seoTitle")}
                />
              </div>

              <div id="field-seo-description">
                <EditableField
                  label="Meta Description"
                  value={form.seoDescription}
                  onChange={(v) => updateField("seoDescription", v)}
                  onGenerateAI={(mode) => generateAIContent("seo_description", "seoDescription", mode)}
                  isGenerating={generating.has("seoDescription")}
                  generatingMode={generatingModes.seoDescription}
                  showAI={aiAvailable}
                  multiline
                  placeholder="Describe this product for search engines..."
                  maxLength={160}
                  helpText="120-155 characters recommended"
                  fieldVersions={fieldVersions.seoDescription}
                  onRevert={(field, version) => handleRevert(field, version)}
                  field="seoDescription"
                  productId={product.id}
                  canInlineRevert={aiGeneratedFields.has("seoDescription") && !!preGenerationValues.seoDescription}
                  onInlineRevert={() => revertToPreGeneration("seoDescription")}
                />
              </div>
            </div>
          </div>

          {/* Sidebar - Minimal */}
          <div
            style={{
              position: "sticky",
              top: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* Checklist with integrated actions */}
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--color-surface)",
                overflow: "hidden",
              }}
            >
              {/* Action Buttons - Stacked vertically */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "16px",
                borderBottom: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface-strong)",
              }}>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                  style={{
                    padding: "10px 16px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 600,
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    background: hasChanges ? "var(--color-text)" : "var(--color-surface)",
                    color: hasChanges ? "var(--color-surface)" : "var(--color-subtle)",
                    cursor: (!hasChanges || isSaving) ? "default" : "pointer",
                    opacity: isSaving ? 0.7 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    transition: "all var(--transition-fast)",
                    width: "100%",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isSaving ? (
                    <>
                      <span className="loading-dots" style={{ transform: "scale(0.6)" }}>
                        <span style={{ background: hasChanges ? "var(--color-surface)" : "var(--color-subtle)" }}/>
                        <span style={{ background: hasChanges ? "var(--color-surface)" : "var(--color-subtle)" }}/>
                        <span style={{ background: hasChanges ? "var(--color-surface)" : "var(--color-subtle)" }}/>
                      </span>
                      Saving
                    </>
                  ) : hasChanges ? "Save changes" : "Saved"}
                </button>
                {aiAvailable && (
                  <button
                    type="button"
                    onClick={() => setGenerateAllModal(prev => ({ ...prev, isOpen: true }))}
                    disabled={generatingAll}
                    style={{
                      padding: "10px 16px",
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      color: "white",
                      cursor: generatingAll ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      transition: "all var(--transition-fast)",
                      opacity: generatingAll ? 0.6 : 1,
                      width: "100%",
                      whiteSpace: "nowrap",
                      boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
                      transform: "translateY(0)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) => {
                      if (!generatingAll) {
                        e.currentTarget.style.boxShadow = "0 8px 25px rgba(102, 126, 234, 0.6)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                        const star = e.currentTarget.querySelector('.star-animation') as HTMLElement;
                        if (star) {
                          star.style.opacity = '1';
                          star.style.display = 'block';
                          star.style.animation = 'starFly 1.5s ease-in-out forwards';

                          // Remove star after animation completes
                          const handleAnimationEnd = () => {
                            star.style.display = 'none';
                            star.style.animation = 'none';
                            star.removeEventListener('animationend', handleAnimationEnd);
                          };
                          star.addEventListener('animationend', handleAnimationEnd);
                        }
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!generatingAll) {
                        e.currentTarget.style.boxShadow = "0 4px 15px rgba(102, 126, 234, 0.4)";
                        e.currentTarget.style.transform = "translateY(0)";
                        const star = e.currentTarget.querySelector('.star-animation') as HTMLElement;
                        if (star) {
                          // Remove any pending animation end listeners
                          star.style.display = 'none';
                          star.style.animation = 'none';
                        }
                      }
                    }}
                  >
                    {/* Star animation element */}
                    <style>{`
                      @keyframes starFly {
                        0% {
                          transform: translateX(-100%) translateY(10px) rotate(0deg);
                          opacity: 0;
                        }
                        10% {
                          opacity: 1;
                        }
                        90% {
                          opacity: 1;
                        }
                        100% {
                          transform: translateX(100%) translateY(-10px) rotate(360deg);
                          opacity: 0;
                        }
                      }
                    `}</style>
                    <div
                      className="star-animation"
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "0",
                        width: "12px",
                        height: "12px",
                        display: "none",
                        pointerEvents: "none",
                        zIndex: 1,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff" style={{ filter: "drop-shadow(0 0 4px rgba(255, 255, 255, 0.8))" }}>
                        <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
                      </svg>
                    </div>
                    <div style={{ position: "relative", zIndex: 2 }}>
                      {generatingAll ? (
                        <>
                          <span className="loading-dots" style={{ transform: "scale(0.6)" }}>
                            <span/>
                            <span/>
                            <span/>
                          </span>
                          Generating...
                        </>
                      ) : (
                        <>
                         
                          Generate All
                        </>
                      )}
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fetcher.submit({ intent: "open_product" }, { method: "POST" })}
                  style={{
                    padding: "10px 16px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    background: "transparent",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all var(--transition-fast)",
                    width: "100%",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.background = "var(--color-surface)";
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Open in Shopify
                </button>
              </div>

              {/* Checklist content */}
              <div style={{ padding: "24px" }}>
                <ChecklistSidebar 
                  audit={audit}
                  onRescan={handleRescan}
                  isRescanning={fetcher.state !== "idle" && fetcher.formData?.get("intent") === "rescan"}
                  onItemClick={handleChecklistItemClick}
                  canAutoFixCollection={!!currentDefaultCollectionId}
                  onAutoFixCollection={() => {
                    if (currentDefaultCollectionId) {
                      fetcher.submit(
                        { intent: "add_to_collection", collectionId: currentDefaultCollectionId },
                        { method: "POST" }
                      );
                    }
                  }}
                  onChooseCollection={() => setCollectionPickerOpen(true)}
                />
              </div>
            </div>
          </div>
        </div>
      

      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && blocker.state === "blocked" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "20px",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="animate-scale-in"
            style={{
              background: "linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.8) 100%)",
              borderRadius: "var(--radius-xl)",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.06)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <span style={{ fontSize: "14px", color: "#d97706" }}>⚠️</span>
                </div>
                <div>
                  <h3 style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "0 0 4px",
                  }}>
                    Unsaved changes
                  </h3>
                  <p style={{
                    margin: 0,
                    fontSize: "var(--text-sm)",
                    color: "var(--color-muted)",
                    lineHeight: 1.5,
                  }}>
                    You have unsaved changes that will be lost if you leave this page.
                  </p>
                </div>
              </div>

              <div style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                marginTop: "20px",
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedDialog(false);
                    blocker.reset?.();
                  }}
                  style={{
                    padding: "8px 18px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    background: "rgba(255, 255, 255, 0.8)",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  Stay on page
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedDialog(false);
                    blocker.proceed?.();
                  }}
                  style={{
                    padding: "8px 18px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    color: "#fff",
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                    boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
                  }}
                >
                  Leave without saving
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rescan Confirmation Dialog */}
      {showRescanConfirmDialog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "20px",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="animate-scale-in"
            style={{
              background: "linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.8) 100%)",
              borderRadius: "var(--radius-xl)",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.06)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <span style={{ fontSize: "14px", color: "#d97706" }}>⚠️</span>
                </div>
                <div>
                  <h3 style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: "0 0 4px",
                  }}>
                    Unsaved changes
                  </h3>
                  <p style={{
                    margin: 0,
                    fontSize: "var(--text-sm)",
                    color: "var(--color-muted)",
                    lineHeight: 1.5,
                  }}>
                    You have unsaved changes that will be lost when rescanning.
                  </p>
                </div>
              </div>

              <div style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                marginTop: "20px",
              }}>
                <button
                  type="button"
                  onClick={() => setShowRescanConfirmDialog(false)}
                  style={{
                    padding: "8px 18px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    background: "rgba(255, 255, 255, 0.8)",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRescanConfirmDialog(false);
                    fetcher.submit({ intent: "rescan" }, { method: "POST" });
                  }}
                  style={{
                    padding: "8px 18px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    color: "#fff",
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                    boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
                  }}
                >
                  Rescan without saving
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Upsell Modal */}
      <AIUpsellModal
        isOpen={upsellState.isOpen}
        onClose={() => setUpsellState({ isOpen: false })}
        message={upsellState.message}
        errorCode={upsellState.errorCode}
      />

      {/* Image Prompt Modal */}
      {imagePromptModal.isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(45, 42, 38, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeImagePromptModal();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closeImagePromptModal();
            }
          }}
          tabIndex={-1}
          role="presentation"
        >
          <div
            className="animate-scale-in"
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-elevated)",
              border: "1px solid var(--color-border)",
              width: "100%",
              maxWidth: "500px",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--color-border)",
                background: "var(--color-surface-strong)",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--font-heading)",
                  fontSize: "var(--text-xl)",
                  fontWeight: 500,
                  color: "var(--color-text)",
                }}
              >
                Customize Image Generation
              </h3>
            </div>

            {/* Content */}
            <div style={{ padding: "24px" }}>

            <p
              style={{
                margin: "0 0 20px 0",
                fontSize: "var(--text-sm)",
                color: "var(--color-muted)",
                lineHeight: 1.5,
              }}
            >
Describe your desired style, or leave blank for defaults.
            </p>

            <textarea
              value={imagePromptModal.customPrompt}
              onChange={(e) =>
                setImagePromptModal((prev) => ({
                  ...prev,
                  customPrompt: e.target.value,
                }))
              }
              placeholder="Optional: e.g., vibrant colors, minimalist style, dramatic lighting, warm tones, etc."
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "12px",
                fontSize: "var(--text-sm)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
                resize: "vertical",
                fontFamily: "inherit",
                marginBottom: "16px",
              }}
            />

            {/* Generate Alt Text Checkbox */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                padding: "12px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-surface-strong)",
                border: "1px solid var(--color-border)",
              }}
            >
              <input
                type="checkbox"
                checked={imagePromptModal.generateAlt}
                onChange={(e) =>
                  setImagePromptModal((prev) => ({
                    ...prev,
                    generateAlt: e.target.checked,
                  }))
                }
                style={{
                  width: "18px",
                  height: "18px",
                  accentColor: "var(--color-primary)",
                  cursor: "pointer",
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  color: "var(--color-text)",
                  marginBottom: "2px",
                }}>
                  Generate alt text with image
                </div>
                <div style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-muted)",
                }}>
                  Improves SEO and accessibility
                </div>
              </div>
            </label>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--color-border)",
                display: "flex",
                gap: "12px",
                justifyContent: "space-between",
                background: "var(--color-surface-strong)",
              }}
            >
              <button
                type="button"
                onClick={closeImagePromptModal}
                style={{
                  padding: "10px 20px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
              >
                Cancel
              </button>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setImagePromptModal(prev => ({ ...prev, customPrompt: "" }));
                    closeImagePromptModal();
                    handleGenerateImages();
                  }}
                  disabled={generatingImage}
                  style={{
                    padding: "10px 20px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                    cursor: generatingImage ? "not-allowed" : "pointer",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  Use Default
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeImagePromptModal();
                    handleGenerateImages();
                  }}
                  disabled={generatingImage}
                  style={{
                    padding: "10px 20px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 600,
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    background: generatingImage ? "var(--color-surface-strong)" : "var(--gradient-primary)",
                    color: generatingImage ? "var(--color-subtle)" : "#fff",
                    cursor: generatingImage ? "not-allowed" : "pointer",
                    transition: "all var(--transition-fast)",
                    boxShadow: generatingImage ? "none" : "var(--shadow-primary-glow)",
                  }}
                >
                  {generatingImage ? "Generating..." : "Generate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate All Modal */}
      <GenerateAllModal
        isOpen={generateAllModal.isOpen}
        onClose={() => {
          setGenerateAllModal({ isOpen: false, selectedFields: [] });
          setFieldOptions({});
        }}
        selectedFields={[
          ...generateAllModal.selectedFields,
          ...Object.keys(fieldOptions).filter(key => (fieldOptions[key]?.length || 0) > 0)
        ]}
        onFieldToggle={(field) => {
          setGenerateAllModal(prev => ({
            ...prev,
            selectedFields: prev.selectedFields.includes(field)
              ? prev.selectedFields.filter(f => f !== field)
              : [...prev.selectedFields, field]
          }));
        }}
        onGenerate={handleGenerateSelected}
        isGenerating={generatingAll}
        fieldOptions={fieldOptions}
        setFieldOptions={setFieldOptions}
      />

      {/* Collection Picker Modal */}
      {collectionPickerOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(45, 42, 38, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setCollectionPickerOpen(false)}
        >
          <div
            className="animate-scale-in"
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-xl)",
              width: "100%",
              maxWidth: "500px",
              maxHeight: "70vh",
              boxShadow: "var(--shadow-elevated)",
              border: "1px solid var(--color-border)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: "24px",
                borderBottom: "1px solid var(--color-border-subtle)",
                background: "transparent",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--font-heading)",
                  fontSize: "var(--text-xl)",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  letterSpacing: "-0.01em",
                }}
              >
                Choose Default Collection
              </h2>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-muted)",
                }}
              >
                Select a collection for auto-fix. You can change this in Settings.
              </p>
            </div>

            {/* Collection List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {collections.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--color-muted)" }}>
                  No collections found. Create a collection in Shopify first.
                </div>
              ) : (
                collections.map((collection: { id: string; title: string; productsCount: number }) => (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => {
                      setCurrentDefaultCollectionId(collection.id);
                      fetcher.submit(
                        { intent: "set_default_collection", collectionId: collection.id },
                        { method: "POST" }
                      );
                      setCollectionPickerOpen(false);
                      shopify.toast.show(`Default collection set to "${collection.title}"`);
                    }}
                    style={{
                      width: "100%",
                      padding: "14px 24px",
                      border: "none",
                      background: currentDefaultCollectionId === collection.id ? "var(--color-primary-soft)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "background var(--transition-fast)",
                    }}
                    onMouseEnter={(e) => {
                      if (currentDefaultCollectionId !== collection.id) {
                        e.currentTarget.style.background = "var(--color-surface-strong)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = currentDefaultCollectionId === collection.id ? "var(--color-primary-soft)" : "transparent";
                    }}
                  >
                    <span style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      color: "var(--color-text)",
                    }}>
                      {collection.title}
                    </span>
                    <span style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--color-muted)",
                    }}>
                      {collection.productsCount} products
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "20px 24px",
                borderTop: "1px solid var(--color-border-subtle)",
                display: "flex",
                justifyContent: "flex-end",
                background: "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => setCollectionPickerOpen(false)}
                style={{
                  padding: "10px 20px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={onboardingOpen}
        onClose={completeOnboarding}
      />

    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};