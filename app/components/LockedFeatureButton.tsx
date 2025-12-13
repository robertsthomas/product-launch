import { Button, Tooltip, InlineStack, Icon } from "@shopify/polaris";
import { LockIcon } from "@shopify/polaris-icons";
import type { PlanType } from "~/lib/billing/constants";

interface LockedFeatureButtonProps {
  children: React.ReactNode;
  locked: boolean;
  requiredPlan: PlanType;
  onLockedClick: () => void;
  onAction?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "tertiary" | "plain";
  tone?: "critical" | "success";
}

export function LockedFeatureButton({
  children,
  locked,
  requiredPlan,
  onLockedClick,
  onAction,
  loading = false,
  disabled = false,
  variant = "primary",
  tone,
}: LockedFeatureButtonProps) {
  if (locked) {
    return (
      <Tooltip content={`Requires ${requiredPlan === "pro" ? "Pro" : "Starter"} plan`}>
        <Button
          onClick={onLockedClick}
          variant={variant}
          icon={LockIcon}
          disabled={disabled}
        >
          {children}
        </Button>
      </Tooltip>
    );
  }

  return (
    <Button
      onClick={onAction}
      loading={loading}
      disabled={disabled}
      variant={variant}
      tone={tone}
    >
      {children}
    </Button>
  );
}

