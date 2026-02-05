import { useState } from "react"

interface TabItem {
  id: string
  label: string
  content: React.ReactNode
  icon?: React.ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  defaultTabId?: string
  onChange?: (tabId: string) => void
  variant?: "underline" | "pills"
  className?: string
  style?: React.CSSProperties
}

export function Tabs({ tabs, defaultTabId, onChange, variant = "underline", className, style }: TabsProps) {
  const [activeTabId, setActiveTabId] = useState(defaultTabId || tabs[0]?.id || "")

  const handleTabChange = (tabId: string) => {
    setActiveTabId(tabId)
    onChange?.(tabId)
  }

  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className={className} style={style}>
      {/* Tab List */}
      <div
        role="tablist"
        style={{
          display: "flex",
          borderBottom: variant === "underline" ? "1px solid var(--color-border)" : "none",
          gap: variant === "pills" ? "var(--space-2)" : "0",
          padding: variant === "pills" ? "var(--space-2)" : "0",
          background: variant === "pills" ? "var(--color-surface-strong)" : "transparent",
          borderRadius: variant === "pills" ? "var(--radius-lg)" : "0",
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId

          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => handleTabChange(tab.id)}
              style={{
                padding: variant === "underline" ? "var(--space-3) var(--space-4)" : "var(--space-3) var(--space-4)",
                fontSize: "var(--text-sm)",
                fontWeight: isActive ? "600" : "500",
                border: "none",
                cursor: "pointer",
                color: isActive ? "var(--color-text)" : "var(--color-muted)",
                borderBottom: variant === "underline" ? (isActive ? "2px solid var(--color-primary)" : "none") : "none",
                borderRadius: variant === "pills" ? "var(--radius-md)" : "0",
                background:
                  variant === "pills" && isActive
                    ? "var(--color-surface)"
                    : variant === "pills"
                      ? "transparent"
                      : "transparent",
                transition: "all var(--transition-fast)",
                display: "flex",
                alignItems: "center",
                gap: tab.icon ? "var(--space-2)" : "0",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--color-text)"
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--color-muted)"
                }
              }}
            >
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab && (
        <div
          role="tabpanel"
          style={{
            padding: "var(--space-4)",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          {activeTab.content}
        </div>
      )}
    </div>
  )
}
