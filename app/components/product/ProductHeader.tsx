import { useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

interface ProductHeaderProps {
  title: string;
  audit: { status: string } | null;
  productId: string;
}

export function ProductHeader({ title, audit, productId }: ProductHeaderProps) {
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const handleOpenInShopify = async () => {
    try {
      await shopify.intents.invoke("edit:shopify/Product", {
        value: productId,
      });
    } catch (error) {
      // Fallback to opening in new tab if intents API fails
      const numericId = productId.split("/").pop();
      const shop = shopify.config?.shop || "";
      window.open(`https://${shop}/admin/products/${numericId}`, "_blank");
    }
  };

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 32px",
        borderBottom: "1px solid #e4e4e7",
        background: "#fff",
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
            borderRadius: "6px",
            border: "1px solid #e4e4e7",
            background: "#fff",
            cursor: "pointer",
            color: "#71717a",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f4f4f5";
            e.currentTarget.style.borderColor = "#d4d4d8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#fff";
            e.currentTarget.style.borderColor = "#e4e4e7";
          }}
          aria-label="Back to dashboard"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div>
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "#18181b",
              margin: "0 0 2px 0",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            {title}
            {audit?.status === "ready" ? (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "#ecfdf5",
                  color: "#059669",
                  fontSize: "11px",
                  fontWeight: 500,
                  border: "1px solid #a7f3d0",
                }}
              >
                Ready
              </span>
            ) : (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "#fef9e7",
                  color: "#8B7500",
                  fontSize: "11px",
                  fontWeight: 500,
                  border: "1px solid #fde68a",
                }}
              >
                Needs Work
              </span>
            )}
          </h1>
          <p style={{ margin: 0, fontSize: "13px", color: "#71717a" }}>
            Product details and optimization
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleOpenInShopify}
        style={{
          padding: "8px 14px",
          fontSize: "13px",
          fontWeight: 500,
          border: "1px solid #e4e4e7",
          borderRadius: "6px",
          background: "#fff",
          color: "#18181b",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#f4f4f5";
          e.currentTarget.style.borderColor = "#d4d4d8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#fff";
          e.currentTarget.style.borderColor = "#e4e4e7";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        Open in Shopify
      </button>
    </div>
  );
}
