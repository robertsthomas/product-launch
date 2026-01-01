import { useEffect, useState, useCallback, useRef, useId } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate, useBlocker } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getProductAudit, auditProduct, getNextIncompleteProduct, getIncompleteProductCount } from "../lib/services/audit.server";
import { getShopSettings } from "../lib/services/shop.server";
import { saveFieldVersion, getShopId } from "../lib/services/version.server";
import { isAIAvailable } from "../lib/ai";
import { PRODUCT_QUERY, type Product } from "../lib/checklist";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const rawId = decodeURIComponent(params.id!);
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
              disabled={isGeneratingAlt}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                border: "none",
                borderTop: "1px solid var(--color-border-subtle)",
                background: "transparent",
                color: isGeneratingAlt ? "var(--color-subtle)" : "var(--color-primary)",
                cursor: isGeneratingAlt ? "not-allowed" : "pointer",
                textAlign: "left",
                transition: "background var(--transition-fast)",
              }}
              onMouseEnter={(e) => { if (!isGeneratingAlt) e.currentTarget.style.background = "var(--color-surface-strong)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {isGeneratingAlt ? "Generating..." : "Generate alt text"}
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
          borderRadius: "var(--radius-sm)",
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
            padding: "32px 28px",
            borderBottom: "1px solid var(--color-border)",
            background: "linear-gradient(135deg, var(--color-primary-soft), var(--color-primary-soft))",
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
              }}
            >
              {isPlanLimit ? "Upgrade to Pro" : "AI Credits Used"}
            </h2>
            <p
              style={{
                margin: "6px 0 0",
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
              borderRadius: "var(--radius-sm)",
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
        <div style={{ padding: "28px" }}>
          <div
            style={{
              padding: "20px",
              backgroundColor: "var(--color-surface-strong)",
              borderRadius: "var(--radius-lg)",
              marginBottom: "24px",
              border: "1px solid var(--color-border)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-base)",
                color: "var(--color-text)",
                lineHeight: "1.6",
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
                marginBottom: "24px",
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
                  width="20"
                  height="20"
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
                      fontWeight: 600,
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
                      fontSize: "var(--text-sm)",
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
            padding: "20px 28px",
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
              padding: "12px 24px",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-full)",
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
              padding: "12px 24px",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              border: "none",
              borderRadius: "var(--radius-full)",
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
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedFields: string[];
  onFieldToggle: (field: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  if (!isOpen) return null;

  const fields = [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "tags", label: "Tags" },
    { key: "seoTitle", label: "SEO Title" },
    { key: "seoDescription", label: "Meta Description" },
  ];

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
          maxWidth: "400px",
          boxShadow: "var(--shadow-elevated)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--color-surface-strong)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-xl)",
              fontWeight: 500,
              color: "var(--color-text)",
            }}
          >
            Generate Fields
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all var(--transition-fast)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Close">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {fields.map((field) => (
              <label
                key={field.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px",
                  border: `1px solid ${selectedFields.includes(field.key) ? "var(--color-primary)" : "var(--color-border)"}`,
                  borderRadius: "var(--radius-md)",
                  backgroundColor: selectedFields.includes(field.key) ? "var(--color-primary-soft)" : "var(--color-surface)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field.key)}
                  onChange={() => onFieldToggle(field.key)}
                  style={{
                    width: "14px",
                    height: "14px",
                    accentColor: "var(--color-primary)",
                  }}
                />
                {field.label}
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 20px",
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
            disabled={isGenerating}
            style={{
              padding: "8px 16px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              cursor: isGenerating ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || selectedFields.length === 0}
            style={{
              padding: "8px 16px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "none",
              borderRadius: "var(--radius-md)",
              background: (isGenerating || selectedFields.length === 0) ? "var(--color-subtle)" : "var(--gradient-primary)",
              color: "#fff",
              cursor: (isGenerating || selectedFields.length === 0) ? "not-allowed" : "pointer",
              boxShadow: (isGenerating || selectedFields.length === 0) ? "none" : "var(--shadow-primary-glow)",
            }}
          >
            {isGenerating ? "Generating..." : `Generate (${selectedFields.length})`}
          </button>
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
          borderRadius: "var(--radius-sm)",
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
            AI
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
                borderRadius: "var(--radius-sm)",
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
          borderRadius: "var(--radius-sm)",
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
                borderRadius: "var(--radius-sm)",
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
              border: "1px dashed var(--color-border)",
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
  onOpenImagePromptModal,
}: {
  images: Array<{ id: string; url: string; altText: string | null }>;
  featuredImageId: string | null;
  productId: string;
  productTitle: string;
  aiAvailable: boolean;
  onRefresh: () => void;
  generatingImage?: boolean;
  onOpenImagePromptModal: () => void;
}) {
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  const [generatingAlt, setGeneratingAlt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const shopify = useAppBridge();

  useEffect(() => {
    const initial: Record<string, string> = {};
    images.forEach(img => {
      initial[img.id] = img.altText || "";
    });
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
        shopify.toast.show("Alt text generated!");
      }
    } catch {
      shopify.toast.show("Failed to generate alt text");
    } finally {
      setGeneratingAlt(null);
    }
  };

  const handleSaveAlt = async (imageId: string) => {
    try {
      const formData = new FormData();
      formData.append("intent", "update_alt");
      formData.append("imageId", imageId);
      formData.append("altText", altTexts[imageId] || "");

      const response = await fetch(
        `/api/products/${encodeURIComponent(productId)}/images`,
        { method: "POST", body: formData }
      );
      const data = await response.json();

      if (data.error) {
        shopify.toast.show(data.error);
      } else {
        shopify.toast.show("Alt text saved");
        setEditingAlt(null);
        onRefresh();
      }
    } catch {
      shopify.toast.show("Failed to save alt text");
    }
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
                border: "2px solid var(--color-primary)",
                backgroundColor: "var(--color-surface)",
                transition: "all var(--transition-fast)",
              }}
            >
              {/* Generating Placeholder */}
              <div style={{
                width: "100%",
                paddingTop: "100%",
                position: "relative",
                backgroundColor: "var(--color-surface-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                }}>
                  <div className="loading-dots" style={{ transform: "scale(0.8)" }}>
                    <span/>
                    <span/>
                    <span/>
                  </div>
                  <div style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--color-primary)",
                    fontWeight: 500,
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
                  alt={image.altText || productTitle}
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
                  borderRadius: "var(--radius-sm)",
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
                        borderRadius: "var(--radius-sm)",
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
                          borderRadius: "var(--radius-sm)",
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
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "transparent",
                          color: "var(--color-text)",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "11px",
                      color: image.altText ? "var(--color-muted)" : "var(--color-subtle)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={image.altText || "No alt text"}
                  >
                    {image.altText || "No alt text"}
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
                borderRadius: "var(--radius-sm)",
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
              {isExternalOnly && item.status === "failed" && canAutoFixCollection && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAutoFixCollection?.();
                  }}
                  style={{
                    padding: "3px 8px",
                    fontSize: "10px",
                    fontWeight: 600,
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: "var(--color-text)",
                    color: "var(--color-surface)",
                    cursor: "pointer",
                    transition: "opacity var(--transition-fast)",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  Fix
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
            borderRadius: "var(--radius-sm)",
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
  const { product, audit, aiAvailable, navigation, defaultCollectionId } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

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
  const [generatingAll, setGeneratingAll] = useState(false);

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
  }>({
    isOpen: false,
    customPrompt: "",
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

  const [generatingImage, setGeneratingImage] = useState(false);

  // Detect changes
  useEffect(() => {
    const originalDesc = product.descriptionHtml.replace(/<[^>]*>/g, "");
    const changed =
      form.title !== product.title ||
      form.description !== originalDesc ||
      form.vendor !== product.vendor ||
      form.productType !== product.productType ||
      form.tags.join(",") !== product.tags.join(",") ||
      form.seoTitle !== product.seoTitle ||
      form.seoDescription !== product.seoDescription;
    setHasChanges(changed);
  }, [form, product]);

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
    setImagePromptModal(prev => ({
      isOpen: false,
      customPrompt: ""
    }));
  }, []);

  const handleGenerateImages = useCallback(async () => {
    setGeneratingImage(true);
    try {
      const formData = new FormData();
      formData.append("intent", "generate_image");
      if (imagePromptModal.customPrompt.trim()) {
        formData.append("customPrompt", imagePromptModal.customPrompt.trim());
      }

      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}/images`,
        { method: "POST", body: formData }
      );

      const data = await response.json();

      if (data.error) {
        shopify.toast.show(data.error);
      } else {
        shopify.toast.show("Image generated successfully!");
        closeImagePromptModal();
        // Reset the custom prompt for next time
        setImagePromptModal(prev => ({ ...prev, customPrompt: "" }));
        // Refresh the page to show the new image
        window.location.reload();
      }
    } catch (error) {
      console.error("Image generation failed:", error);
      shopify.toast.show("Failed to generate image");
    } finally {
      setGeneratingImage(false);
    }
  }, [imagePromptModal.customPrompt, shopify, closeImagePromptModal, product.id]);

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
    if (generateAllModal.selectedFields.length === 0) return;

    setGeneratingAll(true);
    setGenerateAllModal(prev => ({ ...prev, isOpen: false }));

    const fieldMappings = {
      title: { type: "title", field: "title" },
      description: { type: "description", field: "description" },
      tags: { type: "tags", field: "tags" },
      seoTitle: { type: "seo_title", field: "seoTitle" },
      seoDescription: { type: "seo_description", field: "seoDescription" },
    };

    const fields = generateAllModal.selectedFields.map(key => fieldMappings[key as keyof typeof fieldMappings]).filter(Boolean);

    setGenerating(new Set(fields.map(f => f!.field)));

    try {
      await Promise.all(
        fields.map(async (fieldInfo) => {
          if (!fieldInfo) return;
          const { type, field } = fieldInfo;
          try {
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
        })
      );
      shopify.toast.show(`${generateAllModal.selectedFields.length} field${generateAllModal.selectedFields.length !== 1 ? 's' : ''} generated!`);
    } catch {
      shopify.toast.show("Some fields failed to generate");
    } finally {
      setGeneratingAll(false);
      setGenerateAllModal(prev => ({ ...prev, selectedFields: [] }));
    }
  }, [product.id, shopify, updateField, generateAllModal.selectedFields]);

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
    fetcher.submit(formData, { method: "POST" });
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
            }}>
              {product.title}
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
        
        {/* Header Actions - Moved here for cleaner look */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            type="button"
            onClick={() => fetcher.submit({ intent: "open_product" }, { method: "POST" })}
            style={{
              padding: "10px 16px",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              border: "none",
              borderRadius: "var(--radius-full)",
              background: "transparent",
              color: "var(--color-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-muted)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Shopify
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            style={{
              padding: "10px 24px",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              border: "none",
              borderRadius: "var(--radius-full)",
              background: hasChanges ? "var(--color-text)" : "var(--color-surface-strong)",
              color: hasChanges ? "var(--color-surface)" : "var(--color-subtle)",
              cursor: (!hasChanges || isSaving) ? "default" : "pointer",
              opacity: isSaving ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all var(--transition-fast)",
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
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="section-grid split" style={{ gap: "48px", alignItems: "flex-start" }}>
          {/* Main Editor */}
          <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
            
            {/* Product Hero - Featured Image & Title */}
            <div
              id="section-info"
              style={{ display: "flex", flexDirection: "column", gap: "40px" }}
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
                      <EditableField
                        label="Vendor"
                        value={form.vendor}
                        onChange={(v) => updateField("vendor", v)}
                        placeholder="Brand or vendor"
                      />
                    </div>
                    <div id="field-product-type" style={{ flex: 1 }}>
                      <EditableField
                        label="Product Type"
                        value={form.productType}
                        onChange={(v) => updateField("productType", v)}
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

            {/* Subtle divider */}
            <div style={{ height: "1px", background: "var(--color-border)", opacity: 0.5 }} />

            {/* Images Section */}
            <div id="section-images">
              <ImageManager
                images={product.images}
                featuredImageId={product.featuredImageId}
                productId={product.id}
                productTitle={product.title}
                aiAvailable={aiAvailable}
                onRefresh={() => window.location.reload()}
                generatingImage={generatingImage}
                onOpenImagePromptModal={openImagePromptModal}
              />
            </div>

            {/* Subtle divider */}
            <div style={{ height: "1px", background: "var(--color-border)", opacity: 0.5 }} />

            {/* SEO Section */}
            <div id="section-seo">
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
            {/* AI Generate All - Minimal button */}
            {aiAvailable && (
              <button
                type="button"
                onClick={() => setGenerateAllModal(prev => ({ ...prev, isOpen: true }))}
                disabled={generatingAll || generating.size > 0}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  border: "1px dashed var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  background: "transparent",
                  color: (generatingAll || generating.size > 0) ? "var(--color-subtle)" : "var(--color-muted)",
                  cursor: (generatingAll || generating.size > 0) ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "all var(--transition-fast)",
                }}
                onMouseEnter={(e) => { 
                  if (!(generatingAll || generating.size > 0)) {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.color = "var(--color-primary)";
                  }
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.color = (generatingAll || generating.size > 0) ? "var(--color-subtle)" : "var(--color-muted)";
                }}
              >
                {generatingAll ? (
                  <>
                    <span className="loading-dots" style={{ transform: "scale(0.7)" }}>
                      <span/>
                      <span/>
                      <span/>
                    </span>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
                    </svg>
                    Generate with AI
                  </>
                )}
              </button>
            )}

            {/* Checklist - Minimal styling */}
            <div>
              <ChecklistSidebar 
                audit={audit}
                onRescan={() => fetcher.submit({ intent: "rescan" }, { method: "POST" })}
                isRescanning={fetcher.state !== "idle" && fetcher.formData?.get("intent") === "rescan"}
                onItemClick={handleChecklistItemClick}
                canAutoFixCollection={!!defaultCollectionId}
                onAutoFixCollection={() => {
                  if (defaultCollectionId) {
                    fetcher.submit(
                      { intent: "add_to_collection", collectionId: defaultCollectionId },
                      { method: "POST" }
                    );
                  }
                }}
              />
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
            backgroundColor: "rgba(45, 42, 38, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "28px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "var(--radius-full)",
                backgroundColor: "var(--color-warning-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h3 style={{
                margin: 0,
                fontFamily: "var(--font-heading)",
                fontSize: "var(--text-lg)",
                fontWeight: 600,
                color: "var(--color-text)",
              }}>
                Unsaved changes
              </h3>
            </div>
            <p style={{
              margin: "0 0 24px",
              fontSize: "var(--text-sm)",
              color: "var(--color-muted)",
              lineHeight: 1.5,
            }}>
              You have unsaved changes that will be lost if you leave this page. Are you sure you want to continue?
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedDialog(false);
                  blocker.reset?.();
                }}
                style={{
                  padding: "10px 20px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
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
                  padding: "10px 20px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--color-error)",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
              >
                Leave without saving
              </button>
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
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-elevated)",
              width: "100%",
              maxWidth: "500px",
              padding: "24px",
            }}
            role="dialog"
            aria-modal="true"
          >
            <h3
              style={{
                margin: "0 0 16px 0",
                fontSize: "var(--text-lg)",
                fontWeight: 600,
                color: "var(--color-text)",
              }}
            >
              Customize Image Generation
            </h3>

            <p
              style={{
                margin: "0 0 20px 0",
                fontSize: "var(--text-sm)",
                color: "var(--color-text-subtle)",
                lineHeight: 1.5,
              }}
            >
              <strong>Optional:</strong> Add specific instructions for how you want the image to look. Leave blank to use AI-generated defaults. The AI will maintain the product's appearance while incorporating your style preferences.
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
                marginBottom: "20px",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "space-between",
              }}
            >
              <button
                type="button"
                onClick={closeImagePromptModal}
                style={{
                  padding: "8px 16px",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "transparent",
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
                    padding: "8px 16px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "transparent",
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
                    padding: "8px 16px",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    border: generatingImage ? "1px solid var(--color-border)" : "none",
                    borderRadius: "var(--radius-md)",
                    background: generatingImage ? "var(--color-surface-strong)" : "var(--gradient-primary)",
                    color: generatingImage ? "var(--color-subtle)" : "#fff",
                    cursor: generatingImage ? "not-allowed" : "pointer",
                    transition: "all var(--transition-fast)",
                    boxShadow: generatingImage ? "none" : "var(--shadow-primary-glow)",
                  }}
                >
                  {generatingImage ? "Generating..." : "Generate with Custom"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate All Modal */}
      <GenerateAllModal
        isOpen={generateAllModal.isOpen}
        onClose={() => setGenerateAllModal(prev => ({ ...prev, isOpen: false }))}
        selectedFields={generateAllModal.selectedFields}
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
      />

    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};