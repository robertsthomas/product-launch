import React, { useState } from "react"

// ============================================
// Product Row Component
// ============================================

export function ProductRow({
  audit,
  onClick,
  delay = 0,
  isSelected = false,
  onToggleSelect,
  isGenerating = false,
}: {
  audit: {
    id: string
    productId: string
    productTitle: string
    productImage: string | null
    status: string
    passedCount: number
    failedCount: number
    totalCount: number
  }
  onClick: () => void
  delay?: number
  isSelected?: boolean
  onToggleSelect?: () => void
  isGenerating?: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100)

  return (
    <div
      className="animate-fade-in-up"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}
    >
      {/* Selection Checkbox - always takes space, fades in/out */}
      {onToggleSelect && (
        <div
          style={{
            width: "20px",
            height: "20px",
            flexShrink: 0,
            opacity: isHovered || isSelected ? 1 : 0,
            transition: "opacity 0.15s ease",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              width: "20px",
              height: "20px",
              borderRadius: "5px",
              background: isSelected ? "var(--color-primary)" : "var(--color-surface)",
              border: isSelected ? "none" : "1.5px solid var(--color-border)",
              transition: "all 0.15s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              style={{
                position: "absolute",
                opacity: 0,
                width: 0,
                height: 0,
              }}
            />
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </label>
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "12px 16px",
          cursor: "pointer",
          background: isSelected
            ? "var(--color-primary-soft)"
            : isHovered
              ? "var(--color-surface-elevated)"
              : "var(--color-surface)",
          border: isSelected ? "1px solid rgba(31, 79, 216, 0.25)" : "1px solid var(--color-border)",
          borderRadius: "12px",
          transition: "all 0.15s ease",
          boxShadow: isHovered && !isSelected ? "0 2px 8px rgba(0,0,0,0.04)" : "none",
          flex: 1,
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        {/* Product Image */}
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "var(--color-surface-strong)",
            flexShrink: 0,
          }}
        >
          {audit.productImage ? (
            <img
              src={audit.productImage}
              alt={audit.productTitle}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-subtle)",
                fontSize: "20px",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "4px",
            }}
          >
            <div
              style={{
                fontWeight: 500,
                fontSize: "14px",
                color: "var(--color-text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {audit.productTitle}
            </div>
            {isGenerating && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    border: "2px solid #1f4fd8",
                    borderRightColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
              </div>
            )}
          </div>
          {/* Mini progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
            <div
              className="hide-on-mobile"
              style={{
                width: "100px",
                height: "5px",
                background: "var(--color-surface-strong)",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid var(--color-border-subtle)",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: audit.status === "ready" 
                    ? "var(--color-success)" 
                    : progressPercent >= 70 
                      ? "var(--color-primary)" 
                      : "var(--color-accent)",
                  borderRadius: "10px",
                  transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: progressPercent > 0 ? "0 0 8px rgba(0,0,0,0.1) inset" : "none",
                }}
              />
            </div>
            <span
              className="hide-on-mobile"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--color-muted)",
                fontVariantNumeric: "tabular-nums",
                minWidth: "40px",
              }}
            >
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div
          className="hide-on-tablet"
          style={{
            padding: "5px 10px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 500,
            backgroundColor: audit.status === "ready" ? "rgba(34, 197, 94, 0.1)" : "rgba(251, 191, 36, 0.1)",
            color: audit.status === "ready" ? "#16a34a" : "#d97706",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {audit.status === "ready" ? (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="hide-on-mobile">Ready</span>
            </>
          ) : (
            <>
              <span className="hide-on-mobile">{audit.failedCount} to fix</span>
              <span className="show-on-mobile-only">{audit.failedCount}</span>
            </>
          )}
        </div>

        {/* Quick Actions Dropdown - Show when selected */}
        {isSelected && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowDropdown(!showDropdown)
              }}
              style={{
                width: "24px",
                height: "24px",
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text)",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: "0",
                  marginTop: "4px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  zIndex: 1000,
                  minWidth: "180px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    onClick()
                    setShowDropdown(false)
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "none",
                    background: "transparent",
                    color: "var(--color-text)",
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background var(--transition-fast)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--color-surface-strong)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  📝 View Details
                </button>
                {audit.failedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // Navigate to dashboard
                      setShowDropdown(false)
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      border: "none",
                      borderTop: "1px solid var(--color-border)",
                      background: "transparent",
                      color: "var(--color-primary)",
                      fontSize: "var(--text-sm)",
                      fontWeight: 500,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background var(--transition-fast)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--color-primary-soft)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                    }}
                  >
                    ⚡ Quick Fix
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Arrow */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          style={{
            color: "var(--color-subtle)",
            transition: "all 0.15s ease",
            transform: isHovered ? "translateX(2px)" : "translateX(0)",
            opacity: isHovered ? 1 : 0.5,
            flexShrink: 0,
          }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  )
}
