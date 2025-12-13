import { useFetcher } from "react-router";
import { useEffect } from "react";
import type { PlanType } from "~/lib/billing/constants";

interface BillingStatus {
  plan: PlanType;
  planName: string;
  subscriptionStatus: string | null;
  isDevStore: boolean;
  inTrial: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  features: {
    audits: boolean;
    autoFix: boolean;
    aiGeneration: boolean;
    bulkAI: boolean;
    customRules: boolean;
  };
  aiCredits: {
    used: number;
    limit: number;
    remaining: number;
    resetsAt: string | null;
  } | null;
  audits: {
    used: number;
    limit: number;
    remaining: number;
    resetsAt: string | null;
  } | null;
}

export function useBillingStatus() {
  const fetcher = useFetcher<BillingStatus>();

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/api/billing/status");
    }
  }, [fetcher]);

  return {
    status: fetcher.data,
    loading: fetcher.state === "loading",
    error: fetcher.data && "error" in fetcher.data ? fetcher.data.error : null,
    refresh: () => fetcher.load("/api/billing/status"),
  };
}

