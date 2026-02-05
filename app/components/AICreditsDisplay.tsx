import { Badge, Box, InlineStack, ProgressBar, Text } from "@shopify/polaris"

interface AICreditsDisplayProps {
  used: number
  limit: number
  inTrial?: boolean
}

export function AICreditsDisplay({ used, limit, inTrial = false }: AICreditsDisplayProps) {
  const remaining = Math.max(0, limit - used)
  const percentage = limit > 0 ? (used / limit) * 100 : 0
  const isLow = remaining <= 5
  const isOut = remaining === 0

  const BoxAny = Box as any

  return (
    <BoxAny>
      <InlineStack gap="200" align="space-between" blockAlign="center">
        <InlineStack gap="100" align="start">
          <Text as="span" variant="bodySm" tone="subdued">
            AI Credits:
          </Text>
          <Text
            as="span"
            variant="bodySm"
            fontWeight="semibold"
            tone={isOut ? "critical" : isLow ? "caution" : undefined}
          >
            {remaining} / {limit}
          </Text>
          {inTrial && (
            <Badge tone="info" size="small">
              Trial
            </Badge>
          )}
        </InlineStack>
      </InlineStack>
      <BoxAny paddingBlockStart="100">
        <ProgressBar
          progress={percentage}
          size="small"
          tone={(isOut ? "critical" : isLow ? ("warning" as const) : "primary") as any}
        />
      </BoxAny>
    </BoxAny>
  )
}
