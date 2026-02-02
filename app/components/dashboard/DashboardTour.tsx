import { useEffect, useState } from "react"

// ============================================
// Dashboard Tour Component (Interactive inline tooltips)
// ============================================

export function DashboardTour({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState(0)

  const steps: Array<{
    target: string
    title: string
    description: string
    position: "top" | "bottom" | "left" | "right"
  }> = [
    {
      target: "data-tour-products-table",
      title: "Your Product Catalog",
      description:
        "This is your product dashboard. Each row shows a product's launch readiness with status badges and completion scores.",
      position: "right",
    },
    {
      target: "data-tour-expand-row",
      title: "Expand for Details",
      description: "Select a product to see detailed analytics, category breakdowns, and quick actions.",
      position: "right",
    },
    {
      target: "data-tour-status-score",
      title: "Status & Scores",
      description: "Green = Launch Ready. The percentage shows completion. Higher scores mean better optimization.",
      position: "bottom",
    },
    {
      target: "data-tour-sync-button",
      title: "Keep Data Fresh",
      description: "Click Sync to scan all products and update scores. Stays current with your Shopify changes.",
      position: "bottom",
    },
  ]

  const currentStep = steps[step]
  const isLastStep = step === steps.length - 1

  // Get target element position
  const [tooltipPosition, setTooltipPosition] = useState({
    top: 0,
    left: 0,
    show: false,
    actualPosition: "bottom" as "top" | "bottom" | "left" | "right",
  })

  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      const element = document.querySelector(`[${currentStep.target}]`)
      if (element) {
        const rect = element.getBoundingClientRect()
        const tooltipWidth = 360
        const tooltipHeight = 200
        const spacing = 16

        let top = 0
        let left = 0
        let actualPosition = currentStep.position
        const headerOffset = 140 // Account for sticky headers

        switch (currentStep.position) {
          case "bottom":
            top = rect.bottom + spacing
            left = rect.left + rect.width / 2 - tooltipWidth / 2
            break
          case "right":
            top = rect.top + rect.height / 2 - tooltipHeight / 2
            left = rect.right + spacing
            break
          case "top":
            top = rect.top - tooltipHeight - spacing
            left = rect.left + rect.width / 2 - tooltipWidth / 2
            break
          case "left":
            top = rect.top + rect.height / 2 - tooltipHeight / 2
            left = rect.left - tooltipWidth - spacing
            break
        }

        // Keep within viewport horizontally
        if (left < 10) left = 10
        if (left + tooltipWidth > window.innerWidth - 10) {
          left = window.innerWidth - tooltipWidth - 10
        }

        // Keep within viewport vertically (account for sticky header)
        if (top < headerOffset) {
          // If it goes off top, try bottom
          if (currentStep.position === "top" || currentStep.position === "bottom") {
            top = rect.bottom + spacing
            actualPosition = "bottom"
          } else {
            top = headerOffset
          }
        }

        if (top + tooltipHeight > window.innerHeight - 10) {
          // If it goes off bottom, try top
          if (currentStep.position === "bottom" || currentStep.position === "top") {
            const newTop = rect.top - tooltipHeight - spacing
            if (newTop >= headerOffset) {
              top = newTop
              actualPosition = "top"
            } else {
              top = window.innerHeight - tooltipHeight - 10
            }
          } else {
            top = window.innerHeight - tooltipHeight - 10
          }
        }

        // Final safety check
        if (top < headerOffset) top = headerOffset

        setTooltipPosition({ top, left, show: true, actualPosition })

        // Highlight element
        element.setAttribute("data-tour-active", "true")
      } else {
        setTooltipPosition({
          top: 0,
          left: 0,
          show: false,
          actualPosition: "bottom",
        })
      }
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition)

    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition)
      // Remove highlight
      const elements = document.querySelectorAll("[data-tour-active]")
      for (let i = 0; i < elements.length; i++) {
        elements[i].removeAttribute("data-tour-active")
      }
    }
  }, [isOpen, currentStep.target, currentStep.position])

  if (!isOpen || !tooltipPosition.show) return null

  return (
    <>
      {/* Tooltip */}
      <div
        style={{
          position: "fixed",
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          width: "320px",
          zIndex: 1001,
          animation: "tooltipFadeIn 0.3s ease",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 20px",
              background: "transparent",
            }}
          >
            <h3
              style={{
                margin: "0 0 4px",
                fontSize: "15px",
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              {currentStep.title}
            </h3>
            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>
              Step {step + 1} of {steps.length}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: "20px" }}>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                lineHeight: 1.6,
                color: "#475569",
              }}
            >
              {currentStep.description}
            </p>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              background: "transparent",
            }}
          >
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("dashboard", "true")
                onClose()
              }}
              style={{
                background: "none",
                border: "none",
                fontSize: "12px",
                fontWeight: 500,
                color: "#94a3b8",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#0f172a"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#94a3b8"
              }}
            >
              Skip
            </button>

            <div style={{ display: "flex", gap: "8px" }}>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    background: "#fff",
                    color: "#475569",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f8fafc"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff"
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (isLastStep) {
                    onClose()
                  } else {
                    setStep((s) => s + 1)
                  }
                }}
                style={{
                  padding: "6px 16px",
                  fontSize: "12px",
                  fontWeight: 500,
                  border: "none",
                  borderRadius: "6px",
                  background: "#0f172a",
                  color: "#fff",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#1e293b"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#0f172a"
                }}
              >
                {isLastStep ? "Got it" : "Next"}
              </button>
            </div>
          </div>

          {/* Progress dots */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              padding: "12px 20px 16px",
              justifyContent: "center",
              background: "transparent",
            }}
          >
            {steps.map((_, i) => (
              <div
                key={`dot-${i}`}
                style={{
                  width: i === step ? "16px" : "6px",
                  height: "6px",
                  borderRadius: "10px",
                  background: i === step ? "#0f172a" : "#e2e8f0",
                  transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Arrow pointer */}
        {tooltipPosition.actualPosition === "bottom" && (
          <div
            style={{
              position: "absolute",
              top: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderBottom: "8px solid #ffffff",
            }}
          />
        )}
        {tooltipPosition.actualPosition === "top" && (
          <div
            style={{
              position: "absolute",
              bottom: "-8px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "8px solid #ffffff",
            }}
          />
        )}
        {tooltipPosition.actualPosition === "right" && (
          <div
            style={{
              position: "absolute",
              left: "-8px",
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderRight: "8px solid #ffffff",
            }}
          />
        )}
        {tooltipPosition.actualPosition === "left" && (
          <div
            style={{
              position: "absolute",
              right: "-8px",
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderLeft: "8px solid #ffffff",
            }}
          />
        )}
      </div>
    </>
  )
}
