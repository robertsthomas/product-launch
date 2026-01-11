/**
 * History Timeline Component
 * 
 * Displays a timeline of changes for a product:
 * - Audits
 * - Auto-fixes
 * - AI fixes
 * - Manual edits
 * - Bulk operations
 */

import { formatDistanceToNow } from "date-fns";
import type { ChangeType } from "../lib/services/history.server";

interface HistoryEntry {
  id: string;
  changeType: ChangeType;
  score?: number | null;
  passedCount?: number | null;
  failedCount?: number | null;
  changedField?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  aiModel?: string | null;
  createdAt: Date | string;
}

interface HistoryTimelineProps {
  entries: HistoryEntry[];
  maxEntries?: number;
  showEmpty?: boolean;
}

export function HistoryTimeline({
  entries,
  maxEntries = 10,
  showEmpty = true,
}: HistoryTimelineProps) {
  const displayEntries = entries.slice(0, maxEntries);

  if (entries.length === 0 && showEmpty) {
    return (
      <div style={{
        padding: "32px",
        textAlign: "center",
        color: "var(--color-muted)",
        background: "var(--color-surface-strong)",
        borderRadius: "var(--radius-md)",
      }}>
        <svg 
          width="32" 
          height="32" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5"
          style={{ margin: "0 auto 12px" }}
        >
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
        <div style={{ fontWeight: 500, marginBottom: "4px" }}>No history yet</div>
        <div style={{ fontSize: "var(--text-sm)" }}>
          Changes will appear here after audits and fixes
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {displayEntries.map((entry, index) => (
        <TimelineEntry
          key={entry.id}
          entry={entry}
          isFirst={index === 0}
          isLast={index === displayEntries.length - 1}
        />
      ))}
      
      {entries.length > maxEntries && (
        <div style={{
          padding: "12px 16px",
          fontSize: "var(--text-xs)",
          color: "var(--color-muted)",
          textAlign: "center",
          background: "var(--color-surface-strong)",
          borderRadius: "0 0 var(--radius-md) var(--radius-md)",
        }}>
          + {entries.length - maxEntries} more entries
        </div>
      )}
    </div>
  );
}

interface TimelineEntryProps {
  entry: HistoryEntry;
  isFirst: boolean;
  isLast: boolean;
}

function TimelineEntry({ entry, isFirst, isLast }: TimelineEntryProps) {
  const config = getEntryConfig(entry.changeType);
  const createdAt = typeof entry.createdAt === 'string' 
    ? new Date(entry.createdAt) 
    : entry.createdAt;
  
  return (
    <div style={{
      display: "flex",
      gap: "12px",
      padding: "12px 16px",
      background: "var(--color-surface)",
      borderTop: isFirst ? "1px solid var(--color-border)" : "none",
      borderLeft: "1px solid var(--color-border)",
      borderRight: "1px solid var(--color-border)",
      borderBottom: isLast ? "1px solid var(--color-border)" : "none",
      borderRadius: isFirst && isLast 
        ? "var(--radius-md)" 
        : isFirst 
          ? "var(--radius-md) var(--radius-md) 0 0" 
          : isLast 
            ? "0 0 var(--radius-md) var(--radius-md)" 
            : "0",
    }}>
      {/* Timeline dot and line */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "2px",
      }}>
        <div style={{
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          background: config.bgColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: config.iconColor,
          flexShrink: 0,
        }}>
          {config.icon}
        </div>
        {!isLast && (
          <div style={{
            width: "2px",
            flex: 1,
            minHeight: "20px",
            background: "var(--color-border)",
            marginTop: "6px",
          }}/>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingTop: "2px" }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px",
        }}>
          <div style={{ flex: 1 }}>
            {/* Type badge */}
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "var(--radius-full)",
              background: config.bgColor,
              color: config.iconColor,
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              marginBottom: "6px",
            }}>
              {config.label}
            </span>
            
            {/* Description */}
            <div style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text)",
              lineHeight: 1.4,
            }}>
              {entry.description || getDefaultDescription(entry)}
            </div>

            {/* Changed field indicator */}
            {entry.changedField && (
              <div style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-muted)",
                marginTop: "4px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}>
                <span>Field:</span>
                <code style={{
                  padding: "1px 5px",
                  background: "var(--color-surface-strong)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "10px",
                }}>
                  {formatFieldName(entry.changedField)}
                </code>
              </div>
            )}

            {/* AI Model indicator for AI-generated content */}
            {(entry.changeType === "ai_fix" || entry.metadata?.aiAction) && entry.aiModel && (
              <div style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-muted)",
                marginTop: "4px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
                <code style={{
                  padding: "1px 5px",
                  background: "rgba(167, 139, 250, 0.1)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "10px",
                  color: "#8b5cf6",
                }}>
                  {formatModelName(entry.aiModel)}
                </code>
              </div>
            )}

            {/* Score change for audits */}
            {entry.changeType === "audit" && entry.score !== undefined && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "6px",
              }}>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: (entry.score ?? 0) >= 80 
                    ? "var(--color-success-soft)" 
                    : (entry.score ?? 0) >= 50 
                      ? "var(--color-warning-soft)" 
                      : "var(--color-critical-soft)",
                  color: (entry.score ?? 0) >= 80 
                    ? "var(--color-success)" 
                    : (entry.score ?? 0) >= 50 
                      ? "var(--color-warning)" 
                      : "var(--color-critical)",
                  fontSize: "11px",
                  fontWeight: 600,
                }}>
                  Score: {entry.score}%
                </span>
                {entry.passedCount !== undefined && entry.failedCount !== undefined && (
                  <span style={{
                    fontSize: "11px",
                    color: "var(--color-muted)",
                  }}>
                    {entry.passedCount}/{(entry.passedCount ?? 0) + (entry.failedCount ?? 0)} passed
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Timestamp */}
          <div style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-subtle)",
            whiteSpace: "nowrap",
          }}>
            {formatDistanceToNow(createdAt, { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  );
}

function getEntryConfig(changeType: ChangeType): {
  label: string;
  bgColor: string;
  iconColor: string;
  icon: React.ReactNode;
} {
  switch (changeType) {
    case "audit":
      return {
        label: "Audit",
        bgColor: "var(--color-primary-soft)",
        iconColor: "var(--color-primary)",
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
        ),
      };
    case "autofix":
      return {
        label: "Auto-fix",
        bgColor: "var(--color-success-soft)",
        iconColor: "var(--color-success)",
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        ),
      };
    case "ai_fix":
      return {
        label: "AI Fix",
        bgColor: "rgba(167, 139, 250, 0.15)",
        iconColor: "#8b5cf6",
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        ),
      };
    case "manual_edit":
      return {
        label: "Edited",
        bgColor: "var(--color-surface-strong)",
        iconColor: "var(--color-text-secondary)",
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        ),
      };
    case "bulk_fix":
      return {
        label: "Bulk Fix",
        bgColor: "var(--color-warning-soft)",
        iconColor: "var(--color-warning)",
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
        ),
      };
    default:
      return {
        label: "Change",
        bgColor: "var(--color-surface-strong)",
        iconColor: "var(--color-muted)",
        icon: (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/>
          </svg>
        ),
      };
  }
}

function getDefaultDescription(entry: HistoryEntry): string {
  switch (entry.changeType) {
    case "audit":
      return "Product audit completed";
    case "autofix":
      return entry.changedField 
        ? `Auto-fixed ${formatFieldName(entry.changedField)}`
        : "Applied auto-fix";
    case "ai_fix":
      return entry.changedField 
        ? `AI generated ${formatFieldName(entry.changedField)}`
        : "AI content generated";
    case "manual_edit":
      return entry.changedField 
        ? `Manually updated ${formatFieldName(entry.changedField)}`
        : "Manual edit";
    case "bulk_fix":
      return entry.changedField 
        ? `Bulk updated ${formatFieldName(entry.changedField)}`
        : "Bulk fix applied";
    default:
      return "Product updated";
  }
}

function formatFieldName(field: string): string {
  const names: Record<string, string> = {
    title: "Title",
    description: "Description",
    seo_title: "SEO Title",
    seo_description: "SEO Description",
    tags: "Tags",
    images: "Images",
    image_alt: "Image Alt Text",
    collections: "Collections",
    vendor: "Vendor",
    product_type: "Product Type",
  };
  return names[field] || field.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function formatModelName(model: string): string {
  // Format model names for better readability
  // e.g. "anthropic/claude-sonnet-4.5" => "Claude Sonnet 4.5"
  // e.g. "openai/gpt-4o-mini" => "GPT-4o Mini"
  const parts = model.split("/");
  const modelName = parts[parts.length - 1];
  
  // Handle common patterns
  if (modelName.includes("claude")) {
    return modelName
      .replace("claude-", "Claude ")
      .replace(/-/g, " ")
      .replace(/\b\w/g, l => l.toUpperCase());
  }
  
  if (modelName.includes("gpt")) {
    return modelName
      .replace("gpt-", "GPT-")
      .replace("-mini", " Mini")
      .replace("-turbo", " Turbo")
      .toUpperCase()
      .split("-")
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
  }
  
  // Default: capitalize and clean up
  return modelName
    .replace(/-/g, " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}

export default HistoryTimeline;

