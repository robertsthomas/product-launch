
import { CircularProgress } from "../dashboard/CircularProgress"

// ============================================
// Bulk Progress Modal Component
// ============================================

export function BulkProgressModal({
  isOpen,
  actionType,
  totalCount,
  completedCount,
  currentProductTitle,
  onStop,
}: {
  isOpen: boolean
  actionType: string
  totalCount: number
  completedCount: number
  currentProductTitle: string | null
  onStop: () => void
}) {
  if (!isOpen) return null

  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const remainingCount = totalCount - completedCount

  const actionLabels: Record<string, string> = {
    generate_tags: "Generating Smart Tags",
    generate_seo_desc: "Optimizing SEO Descriptions",
    apply_collection: "Organizing Collections",
    autofix: "Running AI Autofix",
    generate_all: "Full Catalog Optimization",
  }
  const label = actionLabels[actionType] || "Processing Catalog"

  return (
    <div className="modal-backdrop">
      <div
        className="modal-container animate-scale-in"
        style={{
          width: "440px",
          padding: "40px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "24px",
        }}
      >
        {/* Progress Visualization */}
        <div style={{ position: "relative", marginBottom: "8px" }}>
          <CircularProgress percent={progress} size={160} strokeWidth={10} />
          
          {/* Subtle Glow Effect behind the circle */}
          <div 
            style={{ 
              position: "absolute", 
              inset: "-20px", 
              background: "radial-gradient(circle, var(--color-primary-soft) 0%, transparent 70%)",
              zIndex: -1,
              opacity: 0.5
            }} 
          />
        </div>

        {/* Textual Progress */}
        <div style={{ width: "100%" }}>
          <p
            style={{
              margin: "0 0 8px 0",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--color-primary)",
            }}
          >
            {label}
          </p>
          <h3
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: 700,
              color: "var(--color-text)",
              letterSpacing: "-0.02em",
            }}
          >
            {completedCount} of {totalCount} completed
          </h3>
        </div>

        {/* Current Activity Card */}
        <div
          style={{
            width: "100%",
            padding: "16px",
            background: "var(--color-surface-strong)",
            borderRadius: "14px",
            border: "1px solid var(--color-border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--color-muted)", fontWeight: 500 }}>
            CURRENTLY PROCESSING
          </span>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--color-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {currentProductTitle || "Preparing next item..."}
          </div>
        </div>

        {/* Queue Info */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            fontSize: "13px",
            color: "var(--color-muted)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--color-primary)",
                boxShadow: "0 0 0 4px var(--color-primary-soft)",
              }}
            />
            {remainingCount} items remaining
          </span>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onStop}
          className="btn-secondary"
          style={{
            width: "100%",
            padding: "14px",
            fontSize: "14px",
            fontWeight: 600,
            borderRadius: "12px",
            marginTop: "8px",
          }}
        >
          Cancel Operation
        </button>
      </div>
    </div>
  )
}
