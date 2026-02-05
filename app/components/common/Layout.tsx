import type React from "react"

interface LayoutProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/**
 * Container component - standard max-width wrapper
 */
export function Container({ children, className, style }: LayoutProps) {
  return (
    <div
      className={className}
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "var(--space-4) var(--space-6)",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Page header component - consistent heading for pages
 */
interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children?: React.ReactNode
}

export function PageHeader({ title, subtitle, action, children }: PageHeaderProps) {
  return (
    <div
      style={{
        marginBottom: "var(--space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 var(--space-2) 0",
              fontSize: "var(--text-2xl)",
              fontWeight: "700",
              color: "var(--color-text)",
            }}
          >
            {title}
          </h1>
          {subtitle && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * Grid layout component
 */
interface GridProps {
  children: React.ReactNode
  columns?: number | { sm: number; md: number; lg: number }
  gap?: string
  className?: string
  style?: React.CSSProperties
}

export function Grid({ children, columns = 1, gap = "var(--space-6)", className, style }: GridProps) {
  const columnValue = typeof columns === "number" ? columns : 1

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columnValue}, 1fr)`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Stack component - flexible vertical or horizontal layout
 */
interface StackProps {
  children: React.ReactNode
  direction?: "row" | "column"
  gap?: string
  align?: "start" | "center" | "end"
  justify?: "start" | "center" | "end" | "between" | "around"
  className?: string
  style?: React.CSSProperties
}

export function Stack({
  children,
  direction = "column",
  gap = "var(--space-4)",
  align = "start",
  justify = "start",
  className,
  style,
}: StackProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: direction,
        gap,
        alignItems: align === "start" ? "flex-start" : align === "center" ? "center" : "flex-end",
        justifyContent:
          justify === "between" ? "space-between" : justify === "around" ? "space-around" : `flex-${justify}`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Section component - page section with optional background
 */
interface SectionProps {
  children: React.ReactNode
  title?: string
  description?: string
  variant?: "default" | "subtle" | "highlight"
  className?: string
  style?: React.CSSProperties
}

const variantStyles = {
  default: { background: "var(--color-surface)", border: "1px solid var(--color-border)" },
  subtle: { background: "var(--color-surface-strong)", border: "none" },
  highlight: { background: "var(--color-primary-soft)", border: "1px solid var(--color-primary-strong)" },
}

export function Section({ children, title, description, variant = "default", className, style }: SectionProps) {
  const vStyle = variantStyles[variant]

  return (
    <section
      className={className}
      style={{
        ...vStyle,
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        marginBottom: "var(--space-6)",
        ...style,
      }}
    >
      {title && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <h2
            style={{
              margin: "0 0 var(--space-1) 0",
              fontSize: "var(--text-lg)",
              fontWeight: "600",
              color: "var(--color-text)",
            }}
          >
            {title}
          </h2>
          {description && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}
