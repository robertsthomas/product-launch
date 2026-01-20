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

interface ProductHealthGaugeProps {
  audit: Audit | null;
}

export function ProductHealthGauge({ audit }: ProductHealthGaugeProps) {
  const [animatedPercent, setAnimatedPercent] = useState(0);

  const passedCount = audit?.passedCount ?? 0;
  const totalCount = audit?.totalCount ?? 1;
  const percent = Math.round((passedCount / totalCount) * 100);

  useEffect(() => {
    const duration = 1000;
    const startTime = Date.now();
    const startValue = animatedPercent;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(startValue + (percent - startValue) * eased);

      setAnimatedPercent(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [percent]);

  const getStatusColor = (percent: number) => {
    if (percent >= 80) return "#059669";
    if (percent >= 50) return "#d97706";
    return "#dc2626";
  };

  const statusColor = getStatusColor(animatedPercent);
  
  const failedItems = audit?.items?.filter(i => i.status === "fail" || i.status === "failed") || [];
  const topIssues = failedItems.slice(0, 3);

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid #e4e4e7",
        borderRadius: "12px",
        backgroundColor: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {/* Gauge and counts */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
        <div style={{ position: "relative", width: "100px", height: "100px", flexShrink: 0 }}>
          <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="50" cy="50" r="44" fill="none" stroke="#f4f4f5" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={statusColor}
              strokeWidth="8"
              strokeDasharray={`${(animatedPercent / 100) * 276.43} 276.43`}
              strokeLinecap="round"
              style={{ transition: "stroke 0.5s ease" }}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#18181b", lineHeight: 1 }}>
              {animatedPercent}%
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#18181b", marginBottom: "6px" }}>Launch Ready</div>
          <div style={{ fontSize: "11px", color: "#71717a", lineHeight: 1.4 }}>
            <div>{passedCount} of {totalCount} passed</div>
            <div>{audit?.failedCount ?? 0} issues</div>
          </div>
        </div>
      </div>

      {topIssues.length > 0 && (
        <div style={{ paddingTop: "12px", borderTop: "1px solid #f4f4f5" }}>
          <div style={{ fontSize: "10px", fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
            Issues
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {topIssues.map(issue => (
              <div key={issue.key} style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "10px", color: "#dc2626" }}>
                <div style={{ width: "3px", height: "3px", borderRadius: "50%", backgroundColor: "#dc2626", flexShrink: 0, marginTop: "4px" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
