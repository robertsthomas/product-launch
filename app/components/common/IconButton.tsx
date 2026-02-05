import type React from "react"

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "variant"> {
  icon: React.ReactNode
  size?: "sm" | "md" | "lg"
  variant?: "ghost" | "soft" | "outline"
  ariaLabel?: string
}

const sizeStyles = {
  sm: { padding: "6px", width: "28px", height: "28px" },
  md: { padding: "8px", width: "36px", height: "36px" },
  lg: { padding: "10px", width: "44px", height: "44px" },
}

export function IconButton({
  icon,
  size = "md",
  variant = "ghost",
  ariaLabel,
  className,
  style,
  ...props
}: IconButtonProps) {
  const sizeStyle = sizeStyles[size]

  const variantStyle = {
    ghost: {
      background: "transparent",
      border: "none",
      hover: "var(--color-surface-strong)",
    },
    soft: {
      background: "var(--color-surface-strong)",
      border: "none",
      hover: "var(--color-border)",
    },
    outline: {
      background: "transparent",
      border: "1px solid var(--color-border)",
      hover: "var(--color-surface)",
    },
  }[variant]

  return (
    <button
      type="button"
      className={className}
      style={{
        ...sizeStyle,
        ...variantStyle,
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-muted)",
        transition: "all var(--transition-fast)",
        ...style,
      }}
      aria-label={ariaLabel}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = variantStyle.hover
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = variantStyle.background
      }}
      {...props}
    >
      {icon}
    </button>
  )
}

interface CloseButtonProps {
  onClick: () => void
  size?: "sm" | "md" | "lg"
  variant?: "ghost" | "soft" | "outline"
}

export function CloseButton({ onClick, size = "md", variant = "ghost" }: CloseButtonProps) {
  return (
    <IconButton
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      }
      onClick={onClick}
      size={size}
      variant={variant}
      ariaLabel="Close"
    />
  )
}

interface ChevronIconProps {
  direction?: "up" | "down" | "left" | "right"
  size?: number
}

export function ChevronIcon({ direction = "down", size = 20 }: ChevronIconProps) {
  const rotations = {
    up: "0deg",
    down: "180deg",
    left: "90deg",
    right: "-90deg",
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{
        transform: `rotate(${rotations[direction]})`,
        transition: "transform var(--transition-fast)",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
