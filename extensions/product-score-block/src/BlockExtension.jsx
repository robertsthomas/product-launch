import { AdminBlock, Badge, BlockStack, Button, Divider, Icon, InlineStack, ProgressIndicator, reactExtension, Text, useApi } from '@shopify/ui-extensions-react/admin';
import { useCallback, useEffect, useState } from 'react';

const TARGET = 'admin.product-details.block.render';

export default reactExtension(TARGET, () => <ProductScoreBlock />);

function ProductScoreBlock() {
  const { data, i18n } = useApi(TARGET);
  const [score, setScore] = useState(null);
  const [auditDetails, setAuditDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  const productId = data?.selected?.[0]?.id;
  const numericProductId = productId ? productId.split('/').pop() : null;

  const fetchProductScore = useCallback(async () => {
    if (!productId) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify({
          query: `
            query ProductLaunchScore($id: ID!) {
              product(id: $id) {
                audit: metafield(namespace: "launch_checklist", key: "audit") {
                  jsonValue
                }
              }
            }
          `,
          variables: { id: productId }
        })
      });

      const result = await response.json();

      if (result.data?.product?.audit?.jsonValue) {
        const auditData = result.data.product.audit.jsonValue;
        setAuditDetails(auditData);

        if (auditData.totalCount > 0) {
          const calculatedScore = Math.round((auditData.passedCount / auditData.totalCount) * 100);
          setScore(calculatedScore);
        }
      }
    } catch (error) {
      console.error("Failed to fetch product score:", error);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchProductScore();
  }, [fetchProductScore]);


  function getScoreTone(scoreValue) {
    if (scoreValue >= 80) return "success";
    if (scoreValue >= 60) return "warning";
    return "critical";
  }

  function getScoreLabel(scoreValue) {
    if (scoreValue >= 80) return i18n.translate("excellent");
    if (scoreValue >= 60) return i18n.translate("good");
    return i18n.translate("needsWork");
  }

  function getScoreIcon(scoreValue) {
    if (scoreValue >= 80) return "StatusActiveMajor";
    if (scoreValue >= 60) return "RiskMinor";
    return "AlertMinor";
  }

  // Collapsed summary - shows when block is minimized
  const collapsedSummary = score !== null 
    ? `${score}/100 · ${getScoreLabel(score)}`
    : i18n.translate("notScored");

  if (loading) {
    return (
      <AdminBlock collapsedSummary={i18n.translate("loadingScore")}>
        <InlineStack gap="base" blockAlignment="center">
          <ProgressIndicator size="small" />
          <Text appearance="subdued">{i18n.translate("loadingScore")}</Text>
        </InlineStack>
      </AdminBlock>
    );
  }

  return (
    <AdminBlock collapsedSummary={collapsedSummary}>
      <BlockStack gap="large">
        {score !== null ? (
          <>
            {/* Score Header */}
            <InlineStack gap="base" blockAlignment="center">
              <Icon name={getScoreIcon(score)} />
              <Text fontWeight="bold" size="large">{score}/100</Text>
              <Badge tone={getScoreTone(score)}>
                {getScoreLabel(score)}
              </Badge>
            </InlineStack>

            {/* Quick Stats */}
            {auditDetails && (
              <InlineStack gap="extraLoose" blockAlignment="start">
                <BlockStack gap="extraTight">
                  <Text fontWeight="bold" tone="success">{auditDetails.passedCount}</Text>
                  <Text appearance="subdued" size="small">{i18n.translate("passed")}</Text>
                </BlockStack>
                <BlockStack gap="extraTight">
                  <Text fontWeight="bold" tone="critical">{auditDetails.failedCount}</Text>
                  <Text appearance="subdued" size="small">{i18n.translate("issues")}</Text>
                </BlockStack>
                <BlockStack gap="extraTight">
                  <Text fontWeight="bold">{auditDetails.totalCount}</Text>
                  <Text appearance="subdued" size="small">{i18n.translate("total")}</Text>
                </BlockStack>
              </InlineStack>
            )}
            
            <Divider />
            
            {/* Action */}
            <Button
              href={numericProductId ? `/apps/product-launch/app/products/${numericProductId}` : '/apps/product-launch'}
            >
              {i18n.translate("viewDetails")}
            </Button>
          </>
        ) : (
          <>
            {/* Empty State */}
            <BlockStack gap="base">
              <InlineStack gap="base" blockAlignment="center">
                <Icon name="ListMajor" />
                <Text fontWeight="bold">{i18n.translate("noScoreTitle")}</Text>
              </InlineStack>
              <Text appearance="subdued">{i18n.translate("noScoreDescription")}</Text>
            </BlockStack>
            
            <Button
              href={numericProductId ? `/apps/product-launch/app/products/${numericProductId}` : '/apps/product-launch'}
              variant="primary"
            >
              {i18n.translate("runAudit")}
            </Button>
          </>
        )}
      </BlockStack>
    </AdminBlock>
  );
}