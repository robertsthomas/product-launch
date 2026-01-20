/**
 * SEO Preview Component
 *
 * Renders preview cards showing how the product will appear in:
 * - Google search results (SERP snippet)
 * - Social media shares (OpenGraph-style)
 */

interface SeoPreviewProps {
  product: {
    title: string
    seoTitle?: string | null
    seoDescription?: string | null
    descriptionHtml?: string | null
    featuredImage?: string | null
    handle?: string
  }
  shopDomain: string
}

export function SeoPreview({ product, shopDomain }: SeoPreviewProps) {
  // Use SEO title/description with fallbacks
  const displayTitle = product.seoTitle?.trim() || product.title
  const displayDescription = product.seoDescription?.trim() || stripHtml(product.descriptionHtml || "").slice(0, 160)

  // Build preview URL
  const storeUrl = shopDomain.replace(".myshopify.com", "").replace(/\./g, "-")
  const productUrl = `${storeUrl}.myshopify.com/products/${product.handle || "product-name"}`

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Google Search Preview */}
      <div>
        <div
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: "var(--color-muted)",
            marginBottom: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Google Search Preview
        </div>
        <div
          style={{
            padding: "16px",
            background: "var(--color-surface)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* URL breadcrumb */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "4px",
            }}
          >
            {/* Favicon placeholder */}
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "var(--color-surface-strong)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span
              style={{
                fontSize: "12px",
                color: "#202124",
                fontFamily: "Arial, sans-serif",
              }}
            >
              {productUrl}
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: "20px",
              lineHeight: "1.3",
              color: "#1a0dab",
              fontFamily: "Arial, sans-serif",
              marginBottom: "4px",
              cursor: "pointer",
            }}
          >
            {truncateText(displayTitle, 60)}
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: "14px",
              lineHeight: "1.5",
              color: "#4d5156",
              fontFamily: "Arial, sans-serif",
            }}
          >
            {truncateText(displayDescription, 160) || (
              <span style={{ color: "#999", fontStyle: "italic" }}>
                No meta description set. Add one for better search visibility.
              </span>
            )}
          </div>
        </div>

        {/* Warnings */}
        {renderSeoWarnings(displayTitle, displayDescription)}
      </div>

      {/* Social Share Preview */}
      <div>
        <div
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: "var(--color-muted)",
            marginBottom: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Social Share Preview
        </div>
        <div
          style={{
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            background: "var(--color-surface)",
            maxWidth: "500px",
          }}
        >
          {/* Image */}
          <div
            style={{
              height: "200px",
              background: "var(--color-surface-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {product.featuredImage ? (
              <img
                src={product.featuredImage}
                alt={displayTitle}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  color: "var(--color-subtle)",
                  fontSize: "var(--text-sm)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span>No featured image</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ padding: "12px 16px" }}>
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-subtle)",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              {shopDomain}
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-text)",
                marginBottom: "4px",
                lineHeight: 1.3,
              }}
            >
              {truncateText(displayTitle, 70)}
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "var(--color-text-secondary)",
                lineHeight: 1.4,
              }}
            >
              {truncateText(displayDescription, 100) || (
                <span style={{ fontStyle: "italic", color: "var(--color-subtle)" }}>
                  Add a description to improve social shares
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function renderSeoWarnings(title: string, description: string): React.ReactNode {
  const warnings: Array<{ type: "error" | "warning" | "success"; message: string }> = []

  // Title checks
  if (!title) {
    warnings.push({ type: "error", message: "Missing SEO title" })
  } else if (title.length < 30) {
    warnings.push({ type: "warning", message: `Title too short (${title.length}/30-60 chars)` })
  } else if (title.length > 60) {
    warnings.push({ type: "warning", message: `Title may be truncated (${title.length}/60 chars)` })
  } else {
    warnings.push({ type: "success", message: `Title length is optimal (${title.length} chars)` })
  }

  // Description checks
  if (!description) {
    warnings.push({ type: "error", message: "Missing meta description" })
  } else if (description.length < 80) {
    warnings.push({ type: "warning", message: `Description too short (${description.length}/80-160 chars)` })
  } else if (description.length > 160) {
    warnings.push({ type: "warning", message: `Description may be truncated (${description.length}/160 chars)` })
  } else {
    warnings.push({ type: "success", message: `Description length is optimal (${description.length} chars)` })
  }

  if (warnings.length === 0) return null

  return (
    <div
      style={{
        marginTop: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {warnings.map((warning, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            color:
              warning.type === "error"
                ? "var(--color-critical)"
                : warning.type === "warning"
                  ? "var(--color-warning)"
                  : "var(--color-success)",
          }}
        >
          {warning.type === "error" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          )}
          {warning.type === "warning" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          )}
          {warning.type === "success" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <path d="M22 4L12 14.01l-3-3" />
            </svg>
          )}
          {warning.message}
        </div>
      ))}
    </div>
  )
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return ""
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + "..."
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}

export default SeoPreview
