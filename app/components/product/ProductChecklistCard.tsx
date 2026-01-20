import { useState, useEffect } from "react";

interface AuditItem {
  key: string;
  label: string;
  status: string;
  details: string | null;
}

interface Audit {
  status: string;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  items: AuditItem[];
}

interface ProductChecklistCardProps {
  audit: Audit | null;
  hasChanges: boolean;
  isSaving: boolean;
  aiAvailable: boolean;
  generatingAll: boolean;
  isRescanning: boolean;
  canAutoFixCollection: boolean;
  onSave: () => void;
  onGenerateAll: () => void;
  onRescan: () => void;
  onItemClick: (key: string) => void;
  onAutoFixCollection: () => void;
  onChooseCollection: () => void;
}

// Group checklist items by category
const CHECKLIST_CATEGORIES: Record<string, { label: string; keys: string[] }> = {
  content: {
    label: "Content",
    keys: ["min_title_length", "min_description_length", "has_tags"],
  },
  organization: {
    label: "Organization",
    keys: ["has_vendor", "has_product_type", "has_collections"],
  },
  media: {
    label: "Media",
    keys: ["min_images", "images_have_alt_text"],
  },
  seo: {
    label: "SEO",
    keys: ["seo_title", "seo_description"],
  },
};

export function ProductChecklistCard({
  audit,
  hasChanges,
  isSaving,
  aiAvailable,
  generatingAll,
  isRescanning,
  canAutoFixCollection,
  onSave,
  onGenerateAll,
  onRescan,
  onItemClick,
  onAutoFixCollection,
  onChooseCollection,
}: ProductChecklistCardProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    // Auto-expand categories with failed items
    const expanded = new Set<string>();
    if (audit?.items) {
      for (const [categoryKey, category] of Object.entries(CHECKLIST_CATEGORIES)) {
        const items = audit.items.filter((item) => category.keys.includes(item.key));
        const hasFailed = items.some((item) => item.status === "fail" || item.status === "failed");
        if (hasFailed) {
          expanded.add(categoryKey);
        }
      }
    }
    return expanded;
  });
  const [animatedPercent, setAnimatedPercent] = useState(0);

  const passedCount = audit?.passedCount ?? 0;
  const totalCount = audit?.totalCount ?? 1;
  const percent = Math.round((passedCount / totalCount) * 100);

  // Animate percentage
  useEffect(() => {
    const duration = 600;
    const startTime = Date.now();
    const startValue = animatedPercent;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (percent - startValue) * eased);

      setAnimatedPercent(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [percent]);

  // Get items by category
  const getItemsByCategory = (categoryKeys: string[]): AuditItem[] => {
    if (!audit?.items) return [];
    return audit.items.filter((item) => categoryKeys.includes(item.key));
  };

  // Use a single professional color for the gauge
  const statusColor = "#18181b";

  const toggleCategory = (categoryKey: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  };

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: "12px",
        backgroundColor: "#fff",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "16px",
          borderBottom: "1px solid #e4e4e7",
        }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={!hasChanges || isSaving}
          style={{
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: 500,
            border: hasChanges ? "none" : "1px solid #e4e4e7",
            borderRadius: "8px",
            background: hasChanges ? "#18181b" : "#fff",
            color: hasChanges ? "#fff" : "#a1a1aa",
            cursor: !hasChanges || isSaving ? "default" : "pointer",
            opacity: isSaving ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.15s ease",
            width: "100%",
          }}
        >
          {isSaving ? (
            "Saving..."
          ) : hasChanges ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save Changes
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Saved
            </>
          )}
        </button>

        {aiAvailable && (
          <button
            type="button"
            onClick={onGenerateAll}
            disabled={generatingAll}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 500,
              border: "1px solid #e4e4e7",
              borderRadius: "8px",
              background: "#fff",
              color: generatingAll ? "#a1a1aa" : "#18181b",
              cursor: generatingAll ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.15s ease",
              width: "100%",
            }}
          >
            {generatingAll ? (
              "Generating..."
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z" />
                </svg>
                Generate All
              </>
            )}
          </button>
        )}
      </div>

      {/* Health Score */}
      <div style={{ padding: "20px", borderBottom: "1px solid #e4e4e7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Circular Progress */}
          <div style={{ position: "relative", width: "64px", height: "64px", flexShrink: 0 }}>
            <svg width="64" height="64" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="32" cy="32" r="28" fill="none" stroke="#e4e4e7" strokeWidth="6" />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke={statusColor}
                strokeWidth="6"
                strokeDasharray={`${(animatedPercent / 100) * 175.93} 175.93`}
                strokeLinecap="round"
                style={{ transition: "stroke 0.3s ease" }}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: "16px",
                fontWeight: 600,
                color: "#18181b",
              }}
            >
              {animatedPercent}%
            </div>
          </div>

          {/* Score Label */}
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#18181b", marginBottom: "2px" }}>
              Product Health
            </div>
            <div style={{ fontSize: "12px", color: "#71717a" }}>
              {passedCount} of {totalCount} checks passed
            </div>
          </div>
        </div>
      </div>

      {/* Checklist by Category */}
      <div style={{ padding: "12px" }}>
        {Object.entries(CHECKLIST_CATEGORIES).map(([categoryKey, category]) => {
          const items = getItemsByCategory(category.keys);
          if (items.length === 0) return null;

          const passedInCategory = items.filter((i) => i.status === "pass" || i.status === "passed" || i.status === "auto_fixed").length;
          const isExpanded = expandedCategories.has(categoryKey);
          const failedCount = items.length - passedInCategory;

          return (
            <div key={categoryKey} style={{ marginBottom: "8px" }}>
              {/* Collapsible Category Header */}
              <button
                type="button"
                onClick={() => toggleCategory(categoryKey)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#71717a"
                    strokeWidth="2"
                    style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {category.label}
                  </span>
                  {failedCount > 0 && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        background: "#f4f4f5",
                        color: "#71717a",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {failedCount}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: "10px", color: "#a1a1aa" }}>
                  {passedInCategory}/{items.length}
                </span>
              </button>

              {/* Items (Show when expanded) */}
              {isExpanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px", paddingLeft: "20px" }}>
                  {items.map((item) => {
                    const isPassed = item.status === "pass" || item.status === "passed" || item.status === "auto_fixed";
                    return (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        background: "transparent",
                        width: "100%",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onItemClick(item.key)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flex: 1,
                          minWidth: 0,
                          padding: 0,
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {/* Status Icon */}
                        {isPassed ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                        )}

                        {/* Label */}
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 400,
                            color: isPassed ? "#71717a" : "#18181b",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.label}
                        </span>
                      </button>
                      {item.key === "has_collections" && (item.status === "fail" || item.status === "failed") && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            canAutoFixCollection ? onAutoFixCollection() : onChooseCollection();
                          }}
                          style={{
                            padding: "2px 6px",
                            fontSize: "10px",
                            fontWeight: 500,
                            background: "#fff",
                            border: "1px solid #e4e4e7",
                            borderRadius: "4px",
                            color: "#18181b",
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          Fix
                        </button>
                      )}
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rescan Button */}
      <div style={{ padding: "12px", borderTop: "1px solid #e4e4e7" }}>
        <button
          type="button"
          onClick={onRescan}
          disabled={isRescanning}
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: 500,
            border: "1px solid #e4e4e7",
            borderRadius: "6px",
            background: "#fff",
            color: isRescanning ? "#a1a1aa" : "#71717a",
            cursor: isRescanning ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            marginTop: "8px",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ animation: isRescanning ? "spin 1s linear infinite" : "none" }}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
          </svg>
          {isRescanning ? "Rescanning..." : "Rescan"}
        </button>
      </div>
    </div>
  );
}
