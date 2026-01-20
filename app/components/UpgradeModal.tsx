import { Badge, BlockStack, Box, Icon, InlineStack, Modal, Text } from "@shopify/polaris"
import { CheckIcon, LockIcon } from "@shopify/polaris-icons"
import { PLAN_CONFIG, type PlanType } from "~/lib/billing/constants"

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  currentPlan: PlanType
  requiredPlan: PlanType
  feature: string
  onUpgrade: (plan: PlanType) => void
  loading?: boolean
}

export function UpgradeModal({
  open,
  onClose,
  currentPlan,
  requiredPlan,
  feature,
  onUpgrade,
  loading = false,
}: UpgradeModalProps) {
  const targetConfig = PLAN_CONFIG[requiredPlan]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Upgrade to ${targetConfig.name}`}
      primaryAction={{
        content: `Start ${targetConfig.trialDays}-day free trial`,
        onAction: () => onUpgrade(requiredPlan),
        loading,
      }}
      secondaryActions={[
        {
          content: "Maybe later",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Box padding="400" background="bg-surface-secondary" borderRadius="200">
            <InlineStack gap="200" align="center">
              <Icon source={LockIcon} tone="subdued" />
              <Text as="p" variant="bodyMd">
                <Text as="span" fontWeight="semibold">
                  {feature}
                </Text>{" "}
                requires the {targetConfig.name} plan
              </Text>
            </InlineStack>
          </Box>

          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              What you'll get with {targetConfig.name}:
            </Text>

            <BlockStack gap="100">
              <FeatureItem>AI-powered SEO title generation</FeatureItem>
              <FeatureItem>AI-powered description writing</FeatureItem>
              <FeatureItem>Automatic tag suggestions</FeatureItem>
              <FeatureItem>Image alt text generation</FeatureItem>
              <FeatureItem>Custom checklist rules</FeatureItem>
              <FeatureItem>100 AI credits per month (15 during trial)</FeatureItem>
              <FeatureItem>Bulk AI actions (up to 100 products)</FeatureItem>
              <FeatureItem>Brand voice presets</FeatureItem>
              <FeatureItem>Scheduled audits + monthly reports</FeatureItem>
              <FeatureItem>30-day version history</FeatureItem>
            </BlockStack>
          </BlockStack>

          <Box padding="300" background="bg-surface-success" borderRadius="200">
            <InlineStack gap="200" align="center" blockAlign="center">
              <Text as="p" variant="bodyLg" fontWeight="bold">
                ${targetConfig.price}/month
              </Text>
              <Badge tone="success">{targetConfig.trialDays}-day free trial</Badge>
            </InlineStack>
          </Box>

          <Text as="p" variant="bodySm" tone="subdued">
            Cancel anytime. No charge until trial ends.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  )
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <InlineStack gap="100" align="start">
      <Box>
        <Icon source={CheckIcon} tone="success" />
      </Box>
      <Text as="span" variant="bodyMd">
        {children}
      </Text>
    </InlineStack>
  )
}
