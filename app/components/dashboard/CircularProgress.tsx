

// ============================================
// Circular Progress Component
// ============================================

export function CircularProgress({
  percent,
  size = 140,
  strokeWidth = 8,
  color,
  showValue = true,
}: {
  percent: number
  size?: number
  strokeWidth?: number
  color?: string
  showValue?: boolean
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percent / 100) * circumference
  const isComplete = percent === 100
  
  // Determine color based on percent or prop
  const activeColor = color || (isComplete ? "var(--color-success)" : "var(--color-primary)")

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Background Track Glow (Subtle) */}
      <svg
        width={size}
        height={size}
        className="absolute inset-0 pointer-events-none"
        style={{ filter: "blur(4px)", opacity: 0.15 }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={activeColor}
          strokeWidth={strokeWidth}
        />
      </svg>

      {/* Main progress ring */}
      <svg width={size} height={size} className="-rotate-90 transform-gpu" aria-hidden="true">
        {/* Track - subtle gray */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-strong)"
          strokeWidth={strokeWidth}
        />
        {/* Progress fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={activeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease",
          }}
        />
      </svg>

      {/* Center content */}
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
          <span
            className="font-bold tabular-nums"
            style={{
              fontSize: size * 0.22,
              color: isComplete ? "var(--color-success)" : "var(--color-text)",
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            {Math.round(percent)}%
          </span>
        </div>
      )}

      {/* Elegant completion celebration */}
      {isComplete && (
        <>
          {/* Subtle pulsing ring */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              border: `2px solid ${activeColor}`,
              animation: "pulse-ring 2s ease-out infinite",
              opacity: 0.3,
            }}
          />

          {/* Soft glow effect */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow: `0 0 15px 2px ${activeColor}40`,
              animation: "pulse-glow 2s ease-in-out infinite",
            }}
          />
        </>
      )}
    </div>
  )
}
