import type React from "react"

export type ButtonVariant = "primary" | "secondary" | "danger" | "outline" | "ghost"
export type ButtonSize = "sm" | "md" | "lg"

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "variant"> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
}

const variantStyles: Record<ButtonVariant, Record<string, string>> = {
  primary: {
    background: "var(--color-primary)",
    color: "#fff",
    border: "none",
    hover: "var(--color-primary-strong)",
    disabled: "var(--color-surface-strong)",
  },
  secondary: {
    background: "var(--color-surface)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    hover: "var(--color-surface-strong)",
    disabled: "var(--color-surface-strong)",
  },
  danger: {
    background: "#dc2626",
    color: "#fff",
    border: "none",
    hover: "#b91c1c",
    disabled: "#fca5a5",
  },
  outline: {
    background: "transparent",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    hover: "var(--color-surface)",
    disabled: "var(--color-surface)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-muted)",
    border: "none",
    hover: "var(--color-surface-strong)",
    disabled: "var(--color-surface-strong)",
  },
}

const sizeStyles: Record<ButtonSize, Record<string, string>> = {
  sm: {
    padding: "8px 12px",
    fontSize: "var(--text-xs)",
    fontWeight: "500",
  },
  md: {
    padding: "10px 16px",
    fontSize: "var(--text-sm)",
    fontWeight: "500",
  },
  lg: {
    padding: "12px 24px",
    fontSize: "var(--text-base)",
    fontWeight: "600",
  },
}

export default function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled = false,
  fullWidth = false,
  icon,
  className,
  children,
  style,
  ...props
}: ButtonProps) {
  const variantStyle = variantStyles[variant]
  const sizeStyle = sizeStyles[size]

  const buttonStyle: React.CSSProperties = {
    ...sizeStyle,
    background: disabled ? variantStyle.disabled : variantStyle.background,
    color: variantStyle.color,
    border: variantStyle.border,
    borderRadius: "var(--radius-md)",
    cursor: disabled || isLoading ? "not-allowed" : "pointer",
    transition: "all var(--transition-fast)",
    opacity: disabled || isLoading ? 0.6 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: icon ? "8px" : undefined,
    width: fullWidth ? "100%" : "auto",
    whiteSpace: "nowrap",
    ...style,
  }

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      style={buttonStyle}
      onMouseEnter={(e) => {
        if (!disabled && !isLoading && variant !== "ghost") {
          e.currentTarget.style.background = variantStyle.hover
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = variantStyle.background
      }}
      {...props}
    >
      {isLoading && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="15.7 47.1" />
        </svg>
      )}
      {icon && !isLoading && icon}
      {children}
    </button>
  )
}
