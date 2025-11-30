import { useEffect, useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getProductAudit, auditProduct, getNextIncompleteProduct, getIncompleteProductCount } from "../lib/services/audit.server";
import { isAIAvailable } from "../lib/ai";
import { PRODUCT_QUERY, type Product } from "../lib/checklist";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = decodeURIComponent(params.id!);

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
      items: audit.items.map(item => ({
        key: item.item.key,
        label: item.item.label,
        status: item.status,
        details: item.details,
      })),
    } : null,
    aiAvailable: isAIAvailable(),
    navigation: {
      nextProduct,
      incompleteCount,
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
// AI Suggestion Modal Component
// ============================================

interface AISuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (value: string | string[]) => void;
  fieldLabel: string;
  suggestion: string | string[] | null;
  isLoading: boolean;
  isMultiline?: boolean;
  isTags?: boolean;
  maxLength?: number;
}

function AISuggestionModal({
  isOpen,
  onClose,
  onApply,
  fieldLabel,
  suggestion,
  isLoading,
  isMultiline,
  isTags,
  maxLength,
}: AISuggestionModalProps) {
  const [editedValue, setEditedValue] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);

  // Update edited value when suggestion changes
  useEffect(() => {
    if (suggestion) {
      setEditedValue(Array.isArray(suggestion) ? suggestion.join(", ") : suggestion);
      setIsEditing(false);
    }
  }, [suggestion]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (isTags) {
      const tags = editedValue.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      onApply(tags);
    } else {
      onApply(editedValue);
    }
    onClose();
  };

  const displayValue = Array.isArray(suggestion) ? suggestion.join(", ") : suggestion;
  const charCount = editedValue.length;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 600,
              color: "#111827",
            }}>
              AI Suggestion
            </h2>
            <p style={{
              margin: "4px 0 0",
              fontSize: "14px",
              color: "#6b7280",
            }}>
              Generated {fieldLabel.toLowerCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "8px",
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px", maxHeight: "50vh", overflowY: "auto" }}>
          {isLoading ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px",
              gap: "16px",
            }}>
              <div style={{
                width: "40px",
                height: "40px",
                border: "3px solid #e5e7eb",
                borderTopColor: "#6366f1",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              <p style={{ color: "#6b7280", fontSize: "14px" }}>
                Generating {fieldLabel.toLowerCase()}...
              </p>
            </div>
          ) : (
            <>
              {isEditing ? (
                <div>
                  {isMultiline || isTags ? (
                    <textarea
                      value={editedValue}
                      onChange={(e) => setEditedValue(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: "150px",
                        padding: "12px 14px",
                        fontSize: "14px",
                        lineHeight: "1.6",
                        border: "1px solid #6366f1",
                        borderRadius: "8px",
                        resize: "vertical",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                        outline: "none",
                        boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.1)",
                      }}
                      autoFocus
                    />
                  ) : (
                    <input
                      type="text"
                      value={editedValue}
                      onChange={(e) => setEditedValue(e.target.value)}
                      maxLength={maxLength}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        fontSize: "14px",
                        border: "1px solid #6366f1",
                        borderRadius: "8px",
                        boxSizing: "border-box",
                        outline: "none",
                        boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.1)",
                      }}
                      autoFocus
                    />
                  )}
                  {maxLength && (
                    <div style={{
                      marginTop: "8px",
                      fontSize: "12px",
                      color: charCount > maxLength ? "#dc2626" : "#6b7280",
                      textAlign: "right",
                    }}>
                      {charCount}/{maxLength} characters
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  padding: "16px",
                  backgroundColor: "#f9fafb",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                }}>
                  {isTags ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {(Array.isArray(suggestion) ? suggestion : suggestion?.split(",") || []).map((tag, i) => (
                        <span
                          key={i}
                          style={{
                            padding: "4px 10px",
                            backgroundColor: "#e5e7eb",
                            borderRadius: "100px",
                            fontSize: "13px",
                            color: "#374151",
                          }}
                        >
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p style={{
                      margin: 0,
                      fontSize: "14px",
                      lineHeight: "1.7",
                      color: "#374151",
                      whiteSpace: "pre-wrap",
                    }}>
                      {displayValue}
                    </p>
                  )}
                  {maxLength && (
                    <div style={{
                      marginTop: "12px",
                      paddingTop: "12px",
                      borderTop: "1px solid #e5e7eb",
                      fontSize: "12px",
                      color: (displayValue?.length || 0) > maxLength ? "#dc2626" : "#6b7280",
                    }}>
                      {displayValue?.length || 0}/{maxLength} characters
                      {(displayValue?.length || 0) > maxLength && (
                        <span style={{ marginLeft: "8px", color: "#dc2626" }}>
                          (exceeds limit, consider editing)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div style={{
            padding: "16px 24px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
          }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                backgroundColor: "#fff",
                color: "#374151",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Cancel
            </button>
            {isEditing ? (
              <button
                onClick={handleApply}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 500,
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: "#6366f1",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                Apply Changes
              </button>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    fontWeight: 500,
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    backgroundColor: "#fff",
                    color: "#374151",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Edit First
                </button>
                <button
                  onClick={handleApply}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    fontWeight: 500,
                    border: "none",
                    borderRadius: "8px",
                    backgroundColor: "#6366f1",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  Apply
                </button>
              </>
            )}
          </div>
        )}
      </div>
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
  multiline,
  placeholder,
  maxLength,
  showAI,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onGenerateAI?: () => void;
  isGenerating?: boolean;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  showAI?: boolean;
  helpText?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "8px" 
      }}>
        <label style={{ 
          fontSize: "13px", 
          fontWeight: 500, 
          color: "#202223",
          letterSpacing: "-0.01em",
        }}>
          {label}
        </label>
        {showAI && onGenerateAI && (
          <button
            onClick={onGenerateAI}
            disabled={isGenerating}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              background: "#fff",
              color: isGenerating ? "#9ca3af" : "#6b7280",
              cursor: isGenerating ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isGenerating) {
                e.currentTarget.style.borderColor = "#6366f1";
                e.currentTarget.style.color = "#6366f1";
              }
            }}
            onMouseLeave={(e) => {
              if (!isGenerating) {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.color = "#6b7280";
              }
            }}
          >
            {isGenerating ? (
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ 
                  display: "inline-block",
                  width: "12px",
                  height: "12px",
                  border: "1.5px solid #d1d5db",
                  borderTopColor: "#6366f1",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </span>
            ) : (
              "Generate"
            )}
          </button>
        )}
      </div>
      
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={isGenerating}
          style={{
            width: "100%",
            minHeight: "140px",
            padding: "12px 14px",
            fontSize: "14px",
            lineHeight: "1.6",
            border: `1px solid ${isFocused ? "#6366f1" : "#d1d5db"}`,
            borderRadius: "8px",
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease",
            outline: "none",
            backgroundColor: isGenerating ? "#f9fafb" : "#fff",
            color: isGenerating ? "#9ca3af" : "#1f2937",
            cursor: isGenerating ? "not-allowed" : "text",
          }}
        />
      ) : (
        <input
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
            padding: "11px 14px",
            fontSize: "14px",
            lineHeight: "1.5",
            border: `1px solid ${isFocused ? "#6366f1" : "#d1d5db"}`,
            borderRadius: "8px",
            boxSizing: "border-box",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease",
            outline: "none",
            backgroundColor: isGenerating ? "#f9fafb" : "#fff",
            color: isGenerating ? "#9ca3af" : "#1f2937",
            boxShadow: isFocused ? "0 0 0 3px rgba(99, 102, 241, 0.1)" : "none",
            cursor: isGenerating ? "not-allowed" : "text",
          }}
        />
      )}
      
      {(helpText || maxLength) && (
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between",
          marginTop: "6px",
          fontSize: "12px",
          color: "#6b7280",
        }}>
          <span>{helpText}</span>
          {maxLength && (
            <span style={{ 
              color: value.length > maxLength ? "#dc2626" : "#6b7280",
              fontWeight: value.length > maxLength ? 500 : 400,
            }}>
              {value.length}/{maxLength}
            </span>
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
  showAI,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  onGenerateAI?: () => void;
  isGenerating?: boolean;
  showAI?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove));
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "8px" 
      }}>
        <label style={{ 
          fontSize: "13px", 
          fontWeight: 500, 
          color: "#202223",
          letterSpacing: "-0.01em",
        }}>
          Tags
        </label>
        {showAI && onGenerateAI && (
          <button
            onClick={onGenerateAI}
            disabled={isGenerating}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              background: "#fff",
              color: isGenerating ? "#9ca3af" : "#6b7280",
              cursor: isGenerating ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isGenerating) {
                e.currentTarget.style.borderColor = "#6366f1";
                e.currentTarget.style.color = "#6366f1";
              }
            }}
            onMouseLeave={(e) => {
              if (!isGenerating) {
                e.currentTarget.style.borderColor = "#e5e7eb";
                e.currentTarget.style.color = "#6b7280";
              }
            }}
          >
            {isGenerating ? (
              <span style={{ 
                display: "inline-block",
                width: "12px",
                height: "12px",
                border: "1.5px solid #d1d5db",
                borderTopColor: "#6366f1",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
            ) : (
              "Generate"
            )}
          </button>
        )}
      </div>
      
      {/* Tags display */}
      {tags.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          marginBottom: "10px",
          opacity: isGenerating ? 0.5 : 1,
          transition: "opacity 0.15s ease",
        }}>
          {tags.map(tag => (
            <span
              key={tag}
              onClick={() => !isGenerating && removeTag(tag)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 10px",
                backgroundColor: "#f3f4f6",
                borderRadius: "100px",
                fontSize: "12px",
                color: "#4b5563",
                cursor: isGenerating ? "default" : "pointer",
                transition: "all 0.15s ease",
                userSelect: "none",
              }}
              onMouseEnter={(e) => {
                if (!isGenerating) {
                  e.currentTarget.style.backgroundColor = "#fee2e2";
                  e.currentTarget.style.color = "#dc2626";
                }
              }}
              onMouseLeave={(e) => {
                if (!isGenerating) {
                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                  e.currentTarget.style.color = "#4b5563";
                }
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      
      {/* Input */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(inputValue);
          }
          if (e.key === "Backspace" && !inputValue && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
          }
        }}
        onBlur={() => inputValue && addTag(inputValue)}
        placeholder={tags.length === 0 ? "Type a tag and press Enter..." : "Add another tag..."}
        disabled={isGenerating}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: "14px",
          border: "1px solid #d1d5db",
          borderRadius: "8px",
          outline: "none",
          backgroundColor: isGenerating ? "#f9fafb" : "#fff",
          color: isGenerating ? "#9ca3af" : "#1f2937",
          cursor: isGenerating ? "not-allowed" : "text",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#6366f1";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.1)";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = "#d1d5db";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      
      {tags.length > 0 && (
        <div style={{ 
          marginTop: "6px", 
          fontSize: "12px", 
          color: "#9ca3af",
        }}>
          Click a tag to remove it
        </div>
      )}
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
}: {
  images: Array<{ id: string; url: string; altText: string | null }>;
  featuredImageId: string | null;
  productId: string;
  productTitle: string;
  aiAvailable: boolean;
  onRefresh: () => void;
}) {
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  const [generatingAlt, setGeneratingAlt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const shopify = useAppBridge();

  // Initialize alt texts
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
      e.target.value = ""; // Reset input
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

  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "16px" 
      }}>
        <label style={{ 
          fontSize: "13px", 
          fontWeight: 500, 
          color: "#202223",
          letterSpacing: "-0.01em",
        }}>
          Product Images ({images.length})
        </label>
        <label
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              backgroundColor: uploading ? "#f3f4f6" : "#fff",
              color: uploading ? "#9ca3af" : "#374151",
              cursor: uploading ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {uploading ? "Uploading..." : "+ Add Image"}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
      </div>

      {images.length === 0 ? (
        <div style={{
          border: "2px dashed #d1d5db",
          borderRadius: "8px",
          padding: "40px",
          textAlign: "center",
          backgroundColor: "#f9fafb",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📷</div>
          <div style={{ color: "#6b7280", fontSize: "14px", marginBottom: "16px" }}>
            No images yet
          </div>
          <label
            style={{
              display: "inline-block",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 500,
              border: "1px solid #6366f1",
              borderRadius: "6px",
              backgroundColor: "#fff",
              color: "#6366f1",
              cursor: "pointer",
            }}
          >
            Upload Image
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
          {images.map((image, index) => (
            <div
              key={image.id}
              style={{
                position: "relative",
                borderRadius: "8px",
                overflow: "hidden",
                border: featuredImageId === image.id 
                  ? "2px solid #6366f1" 
                  : "1px solid #e5e7eb",
                backgroundColor: "#fff",
              }}
            >
              {/* Image */}
              <div style={{
                width: "100%",
                paddingTop: "100%",
                position: "relative",
                backgroundColor: "#f3f4f6",
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

              {/* Featured Badge */}
              {featuredImageId === image.id && (
                <div style={{
                  position: "absolute",
                  top: "6px",
                  left: "6px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  fontWeight: 600,
                  backgroundColor: "#6366f1",
                  color: "#fff",
                  borderRadius: "4px",
                }}>
                  Featured
                </div>
              )}

              {/* Actions Overlay */}
              <div style={{
                position: "absolute",
                top: 0,
                right: 0,
                display: "flex",
                gap: "4px",
                padding: "6px",
              }}>
                {featuredImageId !== image.id && (
                  <button
                    onClick={() => handleSetFeatured(image.id)}
                    style={{
                      padding: "4px 8px",
                      fontSize: "11px",
                      fontWeight: 500,
                      border: "none",
                      borderRadius: "4px",
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      color: "#374151",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    }}
                    title="Set as featured"
                  >
                    ⭐
                  </button>
                )}
                <button
                  onClick={() => handleDeleteImage(image.id)}
                  disabled={deleting === image.id}
                  style={{
                    padding: "4px 8px",
                    fontSize: "11px",
                    fontWeight: 500,
                    border: "none",
                    borderRadius: "4px",
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    color: "#dc2626",
                    cursor: deleting === image.id ? "not-allowed" : "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                  }}
                  title="Delete"
                >
                  {deleting === image.id ? "..." : "🗑"}
                </button>
              </div>

              {/* Alt Text Editor */}
              <div style={{
                padding: "10px",
                backgroundColor: "#fff",
                borderTop: "1px solid #e5e7eb",
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
                        padding: "4px 6px",
                        fontSize: "11px",
                        border: "1px solid #d1d5db",
                        borderRadius: "4px",
                        marginBottom: "4px",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveAlt(image.id);
                        }
                        if (e.key === "Escape") {
                          setEditingAlt(null);
                        }
                      }}
                      autoFocus
                    />
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        onClick={() => handleSaveAlt(image.id)}
                        style={{
                          flex: 1,
                          padding: "3px 6px",
                          fontSize: "10px",
                          border: "none",
                          borderRadius: "4px",
                          backgroundColor: "#6366f1",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingAlt(null)}
                        style={{
                          flex: 1,
                          padding: "3px 6px",
                          fontSize: "10px",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          backgroundColor: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{
                      fontSize: "11px",
                      color: image.altText ? "#374151" : "#9ca3af",
                      marginBottom: "6px",
                      minHeight: "14px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {image.altText || "No alt text"}
                    </div>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        onClick={() => setEditingAlt(image.id)}
                        style={{
                          flex: 1,
                          padding: "3px 6px",
                          fontSize: "10px",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          backgroundColor: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      {aiAvailable && (
                        <button
                          onClick={() => handleGenerateAlt(image.id, index)}
                          disabled={generatingAlt === image.id}
                          style={{
                            flex: 1,
                            padding: "3px 6px",
                            fontSize: "10px",
                            border: "1px solid #e5e7eb",
                            borderRadius: "4px",
                            background: "#fff",
                            color: generatingAlt === image.id ? "#9ca3af" : "#6b7280",
                            cursor: generatingAlt === image.id ? "not-allowed" : "pointer",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (generatingAlt !== image.id) {
                              e.currentTarget.style.borderColor = "#6366f1";
                              e.currentTarget.style.color = "#6366f1";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (generatingAlt !== image.id) {
                              e.currentTarget.style.borderColor = "#e5e7eb";
                              e.currentTarget.style.color = "#6b7280";
                            }
                          }}
                        >
                          {generatingAlt === image.id ? (
                            <span style={{ 
                              display: "inline-block",
                              width: "10px",
                              height: "10px",
                              border: "1.5px solid #d1d5db",
                              borderTopColor: "#6366f1",
                              borderRadius: "50%",
                              animation: "spin 0.8s linear infinite",
                            }} />
                          ) : "AI"}
                        </button>
                      )}
                    </div>
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

function ChecklistSidebar({ 
  audit,
  onRescan,
  isRescanning,
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
}) {
  if (!audit) return null;

  const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100);

  return (
    <div style={{
      backgroundColor: "#fff",
      borderRadius: "12px",
      padding: "24px",
      border: "1px solid #e5e7eb",
      position: "sticky",
      top: "20px",
    }}>
      <h3 style={{ 
        margin: "0 0 20px", 
        fontSize: "15px", 
        fontWeight: 600,
        color: "#111827",
        letterSpacing: "-0.01em",
      }}>
        Launch Checklist
      </h3>
      
      {/* Progress */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between",
          marginBottom: "10px",
          fontSize: "13px",
        }}>
          <span style={{ 
            color: audit.status === "ready" ? "#059669" : "#d97706",
            fontWeight: 600,
          }}>
            {audit.status === "ready" ? "✓ Ready" : `${audit.failedCount} to fix`}
          </span>
          <span style={{ color: "#6b7280", fontWeight: 500 }}>
            {audit.passedCount}/{audit.totalCount}
          </span>
        </div>
        <div style={{
          height: "8px",
          backgroundColor: "#f3f4f6",
          borderRadius: "4px",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${progressPercent}%`,
            backgroundColor: audit.status === "ready" ? "#10b981" : "#f59e0b",
            transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            borderRadius: "4px",
          }} />
        </div>
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {audit.items.map(item => (
          <div
            key={item.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              fontSize: "13px",
              padding: "8px 0",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <span style={{
              color: item.status === "passed" ? "#10b981" : "#f59e0b",
              fontWeight: 600,
              fontSize: "14px",
              flexShrink: 0,
              marginTop: "1px",
            }}>
              {item.status === "passed" ? "✓" : "○"}
            </span>
            <span style={{ 
              color: item.status === "passed" ? "#6b7280" : "#374151",
              lineHeight: "1.5",
            }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Rescan Button */}
      {onRescan && (
        <button
          onClick={onRescan}
          disabled={isRescanning}
          style={{
            marginTop: "20px",
            width: "100%",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: 500,
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            backgroundColor: "#fff",
            color: isRescanning ? "#9ca3af" : "#6b7280",
            cursor: isRescanning ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "all 0.15s ease",
          }}
        >
          {isRescanning ? (
            <>
              <span style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                border: "1.5px solid #d1d5db",
                borderTopColor: "#6366f1",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
              Rescanning...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
              Rescan checklist
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function ProductEditor() {
  const { product, audit, aiAvailable, navigation } = useLoaderData<typeof loader>();
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
  const [hasChanges, setHasChanges] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  
  // Modal state for AI suggestions
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    field: string;
    fieldLabel: string;
    type: string;
    suggestion: string | string[] | null;
    isLoading: boolean;
    isMultiline?: boolean;
    isTags?: boolean;
    maxLength?: number;
  }>({
    isOpen: false,
    field: "",
    fieldLabel: "",
    type: "",
    suggestion: null,
    isLoading: false,
  });

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

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
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

  const updateField = useCallback((field: string, value: string | string[]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  // Open modal and generate suggestion
  const openAIModal = useCallback((
    type: string, 
    field: string, 
    fieldLabel: string,
    options?: { isMultiline?: boolean; isTags?: boolean; maxLength?: number }
  ) => {
    setModalState({
      isOpen: true,
      field,
      fieldLabel,
      type,
      suggestion: null,
      isLoading: true,
      ...options,
    });
    
    // Fetch suggestion
    const formData = new FormData();
    formData.append("type", type);

    fetch(`/api/products/${encodeURIComponent(product.id)}/suggest`, { 
      method: "POST", 
      body: formData 
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          shopify.toast.show(data.error);
          setModalState(prev => ({ ...prev, isOpen: false }));
        } else {
          setModalState(prev => ({ 
            ...prev, 
            suggestion: data.suggestion,
            isLoading: false,
          }));
        }
      })
      .catch(() => {
        shopify.toast.show("Failed to generate");
        setModalState(prev => ({ ...prev, isOpen: false }));
      });
  }, [product.id, shopify]);

  const handleModalApply = useCallback((value: string | string[]) => {
    updateField(modalState.field, value);
    shopify.toast.show("Applied!");
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, [modalState.field, updateField, shopify]);

  const handleModalClose = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Direct generation without modal (for Generate All)
  const generateAIDirect = useCallback(async (type: string, field: string) => {
    setGenerating(prev => new Set([...prev, field]));
    try {
      const formData = new FormData();
      formData.append("type", type);

      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}/suggest`,
        { method: "POST", body: formData }
      );
      const data = await response.json();

      if (data.error) {
        shopify.toast.show(data.error);
      } else {
        const value = Array.isArray(data.suggestion) 
          ? data.suggestion 
          : data.suggestion;
        updateField(field, value);
      }
    } catch {
      shopify.toast.show("Failed to generate");
    } finally {
      setGenerating(prev => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    }
  }, [product.id, shopify, updateField]);

  const generateAll = useCallback(async () => {
    setGeneratingAll(true);
    const fields = [
      { type: "title", field: "title" },
      { type: "description", field: "description" },
      { type: "tags", field: "tags" },
      { type: "seo_title", field: "seoTitle" },
      { type: "seo_description", field: "seoDescription" },
    ];
    
    // Set all fields as generating
    setGenerating(new Set(fields.map(f => f.field)));
    
    try {
      // Generate all in parallel
      await Promise.all(
        fields.map(async ({ type, field }) => {
          try {
            const formData = new FormData();
            formData.append("type", type);

            const response = await fetch(
              `/api/products/${encodeURIComponent(product.id)}/suggest`,
              { method: "POST", body: formData }
            );
            const data = await response.json();

            if (!data.error) {
              const value = Array.isArray(data.suggestion) 
                ? data.suggestion 
                : data.suggestion;
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
      shopify.toast.show("All fields generated!");
    } catch {
      shopify.toast.show("Some fields failed to generate");
    } finally {
      setGeneratingAll(false);
      setGenerating(new Set());
    }
  }, [product.id, shopify, updateField]);

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

  return (
    <s-page heading={product.title}>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        disabled={!hasChanges || isSaving}
        {...(isSaving ? { loading: true } : {})}
      >
        {hasChanges ? "Save changes" : "Saved"}
      </s-button>
      <s-button
        slot="secondary-action"
        onClick={() => fetcher.submit({ intent: "open_product" }, { method: "POST" })}
      >
        Open in Shopify
      </s-button>

      <s-section>
        <div style={{ display: "flex", gap: "32px", maxWidth: "1400px" }}>
          {/* Main Editor */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Product Info Card */}
            <s-card>
              <s-box padding="base">
              {/* Generate All Header */}
              {aiAvailable && (
                <div style={{ 
                  display: "flex", 
                  justifyContent: "flex-end",
                  marginBottom: "20px",
                  paddingBottom: "16px",
                  borderBottom: "1px solid #f3f4f6",
                }}>
                  <button
                    onClick={generateAll}
                    disabled={generatingAll || generating.size > 0}
                    style={{
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      background: "#fff",
                      color: (generatingAll || generating.size > 0) ? "#9ca3af" : "#374151",
                      cursor: (generatingAll || generating.size > 0) ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!generatingAll && generating.size === 0) {
                        e.currentTarget.style.borderColor = "#6366f1";
                        e.currentTarget.style.color = "#6366f1";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!generatingAll && generating.size === 0) {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                        e.currentTarget.style.color = "#374151";
                      }
                    }}
                  >
                    {generatingAll ? (
                      <>
                        <span style={{ 
                          display: "inline-block",
                          width: "14px",
                          height: "14px",
                          border: "2px solid #d1d5db",
                          borderTopColor: "#6366f1",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                        }} />
                        Generating all...
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1m-8.6 8.6l-2.1 2.1"/>
                        </svg>
                        Generate all fields
                      </>
                    )}
                  </button>
                </div>
              )}
              
              <div style={{ display: "flex", gap: "24px", marginBottom: "32px" }}>
                {/* Product Image */}
                <div style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "10px",
                  overflow: "hidden",
                  backgroundColor: "#f9fafb",
                  border: "1px solid #e5e7eb",
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
                      color: "#9ca3af",
                      fontSize: "32px",
                    }}>
                      📦
                    </div>
                  )}
                </div>

                {/* Title & Type */}
                <div style={{ flex: 1 }}>
                  <EditableField
                    label="Title"
                    value={form.title}
                    onChange={(v) => updateField("title", v)}
                    onGenerateAI={() => openAIModal("title", "title", "Title")}
                    isGenerating={generating.has("title")}
                    showAI={aiAvailable}
                    placeholder="Product title"
                  />
                  <div style={{ display: "flex", gap: "16px" }}>
                    <div style={{ flex: 1 }}>
                      <EditableField
                        label="Vendor"
                        value={form.vendor}
                        onChange={(v) => updateField("vendor", v)}
                        placeholder="Brand or vendor"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
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

              <EditableField
                label="Description"
                value={form.description}
                onChange={(v) => updateField("description", v)}
                onGenerateAI={() => openAIModal("description", "description", "Description", { isMultiline: true })}
                isGenerating={generating.has("description")}
                showAI={aiAvailable}
                multiline
                placeholder="Describe your product..."
                helpText="Supports plain text, will be converted to HTML"
              />

              <TagsInput
                tags={form.tags}
                onChange={(v) => updateField("tags", v)}
                onGenerateAI={() => openAIModal("tags", "tags", "Tags", { isTags: true })}
                isGenerating={generating.has("tags")}
                showAI={aiAvailable}
              />
              </s-box>
            </s-card>

            {/* Images Card */}
            <s-card>
              <s-box padding="base">
                <ImageManager
                  images={product.images}
                  featuredImageId={product.featuredImageId}
                  productId={product.id}
                  productTitle={product.title}
                  aiAvailable={aiAvailable}
                  onRefresh={() => window.location.reload()}
                />
              </s-box>
            </s-card>

            {/* SEO Card */}
            <s-card>
              <s-box padding="base">
              <h3 style={{ 
                margin: "0 0 20px", 
                fontSize: "16px", 
                fontWeight: 600,
                color: "#111827",
                letterSpacing: "-0.01em",
              }}>
                Search Engine Listing
              </h3>
              
              {/* Preview */}
              <div style={{
                padding: "20px",
                backgroundColor: "#f9fafb",
                borderRadius: "10px",
                marginBottom: "28px",
                border: "1px solid #e5e7eb",
              }}>
                <div style={{ 
                  color: "#1a0dab", 
                  fontSize: "18px", 
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
                  fontSize: "14px", 
                  marginBottom: "6px",
                  fontWeight: 400,
                }}>
                  yourstore.com › products › {product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
                </div>
                <div style={{ 
                  color: "#545454", 
                  fontSize: "13px",
                  lineHeight: "1.5",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {form.seoDescription || form.description.slice(0, 160) || "Add a meta description to see how it might appear on search engines."}
                </div>
              </div>

              <EditableField
                label="SEO Title"
                value={form.seoTitle}
                onChange={(v) => updateField("seoTitle", v)}
                onGenerateAI={() => openAIModal("seo_title", "seoTitle", "SEO Title", { maxLength: 60 })}
                isGenerating={generating.has("seoTitle")}
                showAI={aiAvailable}
                placeholder={form.title}
                maxLength={60}
                helpText="Recommended: 50-60 characters"
              />

              <EditableField
                label="Meta Description"
                value={form.seoDescription}
                onChange={(v) => updateField("seoDescription", v)}
                onGenerateAI={() => openAIModal("seo_description", "seoDescription", "Meta Description", { isMultiline: true, maxLength: 160 })}
                isGenerating={generating.has("seoDescription")}
                showAI={aiAvailable}
                multiline
                placeholder="Describe this product for search engines..."
                maxLength={160}
                helpText="Recommended: 120-155 characters"
              />
              </s-box>
            </s-card>
          </div>

          {/* Sidebar */}
          <div style={{ width: "300px", flexShrink: 0 }}>
            <ChecklistSidebar 
              audit={audit}
              onRescan={() => fetcher.submit({ intent: "rescan" }, { method: "POST" })}
              isRescanning={fetcher.state !== "idle" && fetcher.formData?.get("intent") === "rescan"}
            />
            
            {/* Next Product Navigation */}
            {navigation.nextProduct && audit?.status === "ready" && (
              <div style={{
                marginTop: "16px",
                padding: "16px",
                backgroundColor: "#f0fdf4",
                borderRadius: "12px",
                border: "1px solid #bbf7d0",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                }}>
                  <span style={{ fontSize: "20px" }}>🎉</span>
                  <span style={{ 
                    fontSize: "14px", 
                    fontWeight: 600,
                    color: "#166534",
                  }}>
                    Product is launch ready!
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/app/products/${encodeURIComponent(navigation.nextProduct!.productId)}`)}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    fontSize: "13px",
                    fontWeight: 500,
                    border: "none",
                    borderRadius: "8px",
                    backgroundColor: "#16a34a",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#15803d"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#16a34a"}
                >
                  Next product to fix
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
                <div style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "#166534",
                  textAlign: "center",
                }}>
                  {navigation.incompleteCount} product{navigation.incompleteCount !== 1 ? "s" : ""} still need work
                </div>
              </div>
            )}
            
            {/* Next Product for incomplete products */}
            {navigation.nextProduct && audit?.status !== "ready" && (
              <div style={{
                marginTop: "16px",
                padding: "16px",
                backgroundColor: "#fff",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
              }}>
                <div style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#6b7280",
                  marginBottom: "8px",
                }}>
                  {navigation.incompleteCount} product{navigation.incompleteCount !== 1 ? "s" : ""} need work
                </div>
                <button
                  onClick={() => navigate(`/app/products/${encodeURIComponent(navigation.nextProduct!.productId)}`)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: 500,
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "#fff",
                    color: "#374151",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#6366f1";
                    e.currentTarget.style.color = "#6366f1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.color = "#374151";
                  }}
                >
                  Skip to next product
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </s-section>
      
      {/* AI Suggestion Modal */}
      <AISuggestionModal
        isOpen={modalState.isOpen}
        onClose={handleModalClose}
        onApply={handleModalApply}
        fieldLabel={modalState.fieldLabel}
        suggestion={modalState.suggestion}
        isLoading={modalState.isLoading}
        isMultiline={modalState.isMultiline}
        isTags={modalState.isTags}
        maxLength={modalState.maxLength}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
