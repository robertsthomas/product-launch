/**
 * Web Vitals monitoring for Built for Shopify compliance
 *
 * Thresholds (p75 over 28 days):
 * - LCP (Largest Contentful Paint): ≤ 2.5s
 * - CLS (Cumulative Layout Shift): ≤ 0.1
 * - INP (Interaction to Next Paint): ≤ 200ms
 *
 * Usage: Call `initWebVitalsMonitoring()` once in your app entry.
 */

declare global {
  interface Window {
    shopify?: {
      webVitals?: {
        onReport: (callback: (metrics: WebVitalsReport) => void) => void
      }
    }
  }
}

interface WebVitalsMetric {
  id: string
  name: "LCP" | "FCP" | "CLS" | "INP" | "TTFB"
  value: number
}

interface WebVitalsReport {
  appId: string
  shopId: string
  userId: string
  appLoadId: string
  country?: string
  metrics: WebVitalsMetric[]
}

const THRESHOLDS = {
  LCP: 2500, // 2.5s in ms
  CLS: 0.1,
  INP: 200, // 200ms
} as const

/**
 * Initialize Web Vitals monitoring
 * @param endpoint - Optional URL to send metrics to (uses sendBeacon)
 */
export function initWebVitalsMonitoring(endpoint?: string) {
  if (typeof window === "undefined" || !window.shopify?.webVitals) {
    return
  }

  window.shopify.webVitals.onReport((report) => {
    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.group("📊 Web Vitals Report")
      for (const metric of report.metrics) {
        const threshold = THRESHOLDS[metric.name as keyof typeof THRESHOLDS]
        const isPassing = threshold ? metric.value <= threshold : true
        console.log(`${isPassing ? "✅" : "⚠️"} ${metric.name}: ${formatMetricValue(metric)}`)
      }
      console.log(`Country: ${report.country || "unknown"}`)
      console.groupEnd()
    }

    // Send to your monitoring endpoint
    if (endpoint) {
      try {
        navigator.sendBeacon(endpoint, JSON.stringify(report))
      } catch {
        // Fallback to fetch
        fetch(endpoint, {
          method: "POST",
          body: JSON.stringify(report),
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => {})
      }
    }
  })
}

function formatMetricValue(metric: WebVitalsMetric): string {
  switch (metric.name) {
    case "CLS":
      return metric.value.toFixed(3)
    case "LCP":
    case "INP":
    case "FCP":
    case "TTFB":
      return `${metric.value.toFixed(0)}ms`
    default:
      return String(metric.value)
  }
}

/**
 * Check if metrics pass Built for Shopify thresholds
 */
export function checkWebVitalsCompliance(metrics: WebVitalsMetric[]): {
  passing: boolean
  results: Record<string, { value: number; threshold: number; passing: boolean }>
} {
  const results: Record<string, { value: number; threshold: number; passing: boolean }> = {}
  let allPassing = true

  for (const metric of metrics) {
    const threshold = THRESHOLDS[metric.name as keyof typeof THRESHOLDS]
    if (threshold) {
      const passing = metric.value <= threshold
      results[metric.name] = { value: metric.value, threshold, passing }
      if (!passing) allPassing = false
    }
  }

  return { passing: allPassing, results }
}
