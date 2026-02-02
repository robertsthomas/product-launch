import { useCallback, useEffect } from "react"
import { useFetcher } from "react-router"
import type { PlanType } from "~/lib/billing/constants"

interface UpgradeResponse {
  success?: boolean
  confirmationUrl?: string
  error?: string
  plan?: PlanType
  message?: string
}

export function useUpgrade() {
  const fetcher = useFetcher<UpgradeResponse>()

  const upgrade = useCallback(
    (plan: "pro" = "pro", interval: "monthly" | "yearly" = "monthly") => {
      fetcher.submit(null, {
        method: "POST",
        action: `/api/billing/upgrade?plan=${plan}&interval=${interval}`,
      })
    },
    [fetcher]
  )

  // Handle redirect to confirmation URL
  useEffect(() => {
    const confirmationUrl = fetcher.data?.confirmationUrl
    if (confirmationUrl && typeof window !== "undefined") {
      // Use App Bridge navigation for embedded apps
      if (window.top !== window.self) {
        window.top?.location.assign(confirmationUrl)
      } else {
        window.location.assign(confirmationUrl)
      }
    }
  }, [fetcher.data?.confirmationUrl])

  return {
    upgrade,
    loading: fetcher.state === "submitting",
    error: fetcher.data?.error,
    isDevStore: fetcher.data?.plan === "pro" && fetcher.data?.message?.includes("Development"),
    success: fetcher.data?.success && !fetcher.data?.confirmationUrl,
  }
}
