import { useAppBridge } from "@shopify/app-bridge-react"
import { useNavigate } from "react-router"

interface ProductHeaderProps {
  title: string
  audit: { status: string } | null
  productId: string
}

function LogoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id="hexGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#465A54" />
          <stop offset="100%" stopColor="#3d4e49" />
        </linearGradient>
      </defs>
      {/* Hexagon */}
      <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="url(#hexGradient)" />
      {/* Checkmark */}
      <path
        d="M12 20L17 25L28 14"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function ProductHeader({ title, audit, productId }: ProductHeaderProps) {
  const navigate = useNavigate()
  const shopify = useAppBridge()

  const handleOpenInShopify = async () => {
    try {
      if (shopify && "intents" in shopify) {
        await (shopify as any).intents.invoke("edit:shopify/Product", {
          value: productId,
        })
      }
    } catch (error) {
      // Fallback to opening in new tab if intents API fails
      const numericId = productId.split("/").pop()
      const shop = (shopify as any)?.config?.shop || ""
      window.open(`https://${shop}/admin/products/${numericId}`, "_blank")
    }
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 24px",
        borderBottom: "1px solid #f0f4f8",
        background: "#ffffff",
        gap: "12px",
        height: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          minWidth: 0,
          flex: 1,
        }}
      >
        {/* Bigger Logo */}
        <svg width="28" height="28" viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
          <defs>
            <linearGradient id="hexGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#465A54" />
              <stop offset="100%" stopColor="#3d4e49" />
            </linearGradient>
          </defs>
          {/* Hexagon */}
          <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="url(#hexGradient)" />
          {/* Checkmark */}
          <path
            d="M12 20L17 25L28 14"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>

        <button
          type="button"
          onClick={() => navigate("/app")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            borderRadius: "4px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#475569",
            transition: "all 0.15s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f1f5f9"
            e.currentTarget.style.color = "#1e293b"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
            e.currentTarget.style.color = "#475569"
          }}
          aria-label="Back to dashboard"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              lineHeight: 1.2,
            }}
          >
            <h1
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#0f172a",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </h1>
            {audit?.status === "ready" ? (
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: "2px",
                  background: "#ecfdf5",
                  color: "#059669",
                  fontSize: "10px",
                  fontWeight: 500,
                  border: "1px solid #a7f3d0",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Ready
              </span>
            ) : (
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: "2px",
                  background: "#fef9e7",
                  color: "#8B7500",
                  fontSize: "10px",
                  fontWeight: 500,
                  border: "1px solid #fde68a",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Needs Work
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleOpenInShopify}
        style={{
          padding: "5px 10px",
          fontSize: "12px",
          fontWeight: 500,
          border: "1px solid #e2e8f0",
          borderRadius: "4px",
          background: "#fff",
          color: "#0f172a",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          transition: "all 0.15s",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#f8fafc"
          e.currentTarget.style.borderColor = "#cbd5e1"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#fff"
          e.currentTarget.style.borderColor = "#e2e8f0"
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        Open in Shopify
      </button>
    </div>
  )
}
