import { useFetcher } from "react-router";
import { useCallback } from "react";
import type { PlanType } from "~/lib/billing/constants";

interface UpgradeResponse {
  success?: boolean;
  confirmationUrl?: string;
  subscriptionId?: string;
  error?: string;
  plan?: PlanType;
  message?: string;
}

export function useUpgrade() {
  const fetcher = useFetcher<UpgradeResponse>();

  const upgrade = useCallback(
    async (plan: "pro" = "pro") => {
      fetcher.submit(null, {
        method: "POST",
        action: `/api/billing/upgrade?plan=${plan}`,
      });
    },
    [fetcher]
  );

  // Handle redirect to confirmation URL
  const confirmationUrl = fetcher.data?.confirmationUrl;
  if (confirmationUrl && typeof window !== "undefined") {
    // Use top-level navigation for embedded apps
    if (window.top !== window.self) {
      window.top?.location.assign(confirmationUrl);
    } else {
      window.location.assign(confirmationUrl);
    }
  }

  return {
    upgrade,
    loading: fetcher.state === "submitting",
    error: fetcher.data?.error,
    isDevStore: fetcher.data?.plan === "pro" && fetcher.data?.message?.includes("Development"),
  };
}





