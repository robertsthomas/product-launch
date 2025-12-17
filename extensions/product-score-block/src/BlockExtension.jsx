import { Badge, BlockStack, Box, InlineStack, Link, ProgressIndicator, reactExtension, Text, useApi } from '@shopify/ui-extensions-react/admin';
import { useCallback, useEffect, useState } from 'react';

const TARGET = 'admin.product-details.block.render';

export default reactExtension(TARGET, () => <ProductScoreBlock />);

function ProductScoreBlock() {
  const { data } = useApi(TARGET);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);

  const productId = data?.selected?.[0]?.id;

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
            query GetProductScore($id: ID!) {
              product(id: $id) {
                id
                title
                auditData: metafield(namespace: "launch_checklist", key: "audit") {
                  value
                  type
                }
              }
            }
          `,
          variables: { id: productId }
        })
      });

      const result = await response.json();

      if (result.data?.product?.auditData?.value) {
        const auditData = JSON.parse(result.data.product.auditData.value);

        if (auditData.totalCount > 0) {
          const score = Math.round((auditData.passedCount / auditData.totalCount) * 100);
          setScore(score);
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


  function getScoreTone(score) {
    if (score >= 80) return "success";
    if (score >= 60) return "warning";
    return "critical";
  }

  function getScoreIcon(score) {
    if (score >= 80) return "🎉";
    if (score >= 60) return "👍";
    return "💡";
  }

  function getScoreColor(score) {
    if (score >= 80) return "#059669"; // Success green
    if (score >= 60) return "#d97706"; // Warning amber
    return "#dc2626"; // Error red
  }

  function getScoreBgColor(score) {
    if (score >= 80) return "#ecfdf5"; // Success soft background
    if (score >= 60) return "#fffbeb"; // Warning soft background
    return "#fef2f2"; // Error soft background
  }

  if (loading) {
    return (
      <Box padding="base" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e5eb", borderRadius: "10px" }}>
        <InlineStack spacing="base" alignment="center">
          <ProgressIndicator accessibilityLabel="Loading" />
          <Text size="small" style={{ color: "#64748b" }}>Loading score...</Text>
        </InlineStack>
      </Box>
    );
  }

  return (
    <Box
      padding="base"
      style={{
        backgroundColor: score !== null ? getScoreBgColor(score) : "#ffffff",
        border: score !== null ? `1px solid ${getScoreColor(score)}` : "1px solid #e2e5eb",
        borderRadius: "10px"
      }}
    >
      <BlockStack spacing="base">
        {score !== null ? (
          <>
            <InlineStack spacing="base" alignment="space-between" blockAlignment="center">
              <Text size="base" fontWeight="semibold" style={{ color: "#1e2530" }}>
                Product Score
              </Text>
              <Badge tone={getScoreTone(score)} size="small">
                {score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs Work"}
              </Badge>
            </InlineStack>
            <InlineStack spacing="base" alignment="center">
              <Text size="heading" fontWeight="bold" style={{ color: getScoreColor(score) }}>
                {getScoreIcon(score)} {score}/100
              </Text>
            </InlineStack>
            <Box
              style={{
                height: "6px",
                backgroundColor: "#e2e5eb",
                borderRadius: "3px",
                overflow: "hidden"
              }}
            >
              <Box
                style={{
                  height: "100%",
                  width: `${score}%`,
                  backgroundColor: getScoreColor(score),
                  borderRadius: "3px"
                }}
              />
            </Box>
          </>
        ) : (
          <BlockStack spacing="tight">
            <Text size="base" fontWeight="semibold" style={{ color: "#1e2530" }}>
              Product Score
            </Text>
            <Text size="small" style={{ color: "#64748b" }}>
              No score yet
            </Text>
          </BlockStack>
        )}
        <Link
          to={productId ? `/app/products/${encodeURIComponent(productId)}` : '/app'}
        >
          Open in App
        </Link>
      </BlockStack>
    </Box>
  );
}