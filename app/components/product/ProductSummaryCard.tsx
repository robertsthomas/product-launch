interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
}

interface ProductData {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  featuredImage: string | null;
  images: ProductImage[];
}

interface Audit {
  status: string;
  passedCount: number;
  failedCount: number;
  totalCount: number;
}

interface ProductSummaryCardProps {
  product: ProductData;
  audit: Audit | null;
}

export function ProductSummaryCard({ product, audit }: ProductSummaryCardProps) {
  return (
    <div
      style={{
        padding: "24px",
        border: "1px solid #e4e4e7",
        borderRadius: "12px",
        backgroundColor: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "20px" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "10px",
            overflow: "hidden",
            backgroundColor: "#f4f4f5",
            border: "1px solid #e4e4e7",
            flexShrink: 0,
          }}
        >
          {product.featuredImage ? (
            <img src={product.featuredImage} alt={product.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#d4d4d8" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "#18181b", margin: "0 0 4px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {product.title}
          </h2>
          <div style={{ fontSize: "11px", color: "#71717a" }}>
            {product.vendor || "No vendor"} • {product.productType || "No type"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#71717a" }}>Status</span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "10px",
              background: audit?.status === "ready" ? "#ecfdf5" : "#fef9e7",
              color: audit?.status === "ready" ? "#059669" : "#8B7500",
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            {audit?.status === "ready" ? "Ready" : "Pending"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#71717a" }}>Images</span>
          <span style={{ fontSize: "12px", fontWeight: 500, color: "#18181b" }}>{product.images.length}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#71717a" }}>Tags</span>
          <span style={{ fontSize: "12px", fontWeight: 500, color: "#18181b" }}>{product.tags.length}</span>
        </div>
      </div>
    </div>
  );
}
