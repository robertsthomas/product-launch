import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

// Metafield namespace and key where audit data is stored
const METAFIELD_NAMESPACE = "launch_checklist";
const METAFIELD_KEY = "audit";

// Full product query for scanning (matches app's PRODUCT_QUERY)
const FULL_PRODUCT_QUERY = `query Product($id: ID!) {
  product(id: $id) {
    id
    title
    descriptionHtml
    vendor
    productType
    tags
    featuredImage {
      url
    }
    images(first: 50) {
      nodes {
        id
        altText
      }
    }
    seo {
      title
      description
    }
    collections(first: 10) {
      nodes {
        id
      }
    }
    metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
      value
    }
  }
}`;

function Extension() {
  const { i18n, close, data } = shopify;
  const productId = data?.selected?.[0]?.id;
  
  const [product, setProduct] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Fetch product info and existing audit from metafield
  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }
    fetchProductData();
  }, [productId]);

  const fetchProductData = async () => {
    try {
      const query = {
        query: FULL_PRODUCT_QUERY,
        variables: { id: productId },
      };

      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(query),
      });

      if (res.ok) {
        const result = await res.json();
        const productData = result.data?.product;
        setProduct(productData);
        
        // Get existing audit from metafield
        const metafieldValue = productData?.metafield?.value;
        if (metafieldValue) {
          setAudit(JSON.parse(metafieldValue));
        }
      }
    } catch (err) {
      console.error("Error fetching product:", err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate audit matching app's rules
  const calculateAudit = (productData) => {
    const items = [];
    
    // 1. min_title_length (10 chars)
    items.push({
      key: "min_title_length",
      label: i18n.translate("checks.title"),
      status: productData.title && productData.title.length >= 10 ? "passed" : "failed",
    });
    
    // 2. min_description_length (50 chars)
    const descText = productData.descriptionHtml?.replace(/<[^>]*>/g, "") || "";
    items.push({
      key: "min_description_length",
      label: i18n.translate("checks.description"),
      status: descText.length >= 50 ? "passed" : "failed",
    });
    
    // 3. min_images (3 images)
    const imageCount = productData.images?.nodes?.length || 0;
    items.push({
      key: "min_images",
      label: i18n.translate("checks.images"),
      status: imageCount >= 3 ? "passed" : "failed",
    });
    
    // 4. images_have_alt_text (ALL images need alt text)
    const images = productData.images?.nodes || [];
    const allHaveAlt = images.length > 0 && images.every(img => img.altText && img.altText.length > 0);
    items.push({
      key: "images_have_alt_text",
      label: i18n.translate("checks.imageAlt"),
      status: allHaveAlt ? "passed" : "failed",
    });
    
    // 5. seo_title
    items.push({
      key: "seo_title",
      label: i18n.translate("checks.seoTitle"),
      status: productData.seo?.title ? "passed" : "failed",
    });
    
    // 6. seo_description (80 chars min)
    const seoDesc = productData.seo?.description || "";
    items.push({
      key: "seo_description",
      label: i18n.translate("checks.seoDescription"),
      status: seoDesc.length >= 80 ? "passed" : "failed",
    });
    
    // 7. has_collections
    const collectionCount = productData.collections?.nodes?.length || 0;
    items.push({
      key: "has_collections",
      label: i18n.translate("checks.collections"),
      status: collectionCount >= 1 ? "passed" : "failed",
    });
    
    // 8. has_product_type
    items.push({
      key: "has_product_type",
      label: i18n.translate("checks.productType"),
      status: productData.productType ? "passed" : "failed",
    });
    
    // 9. has_vendor
    items.push({
      key: "has_vendor",
      label: i18n.translate("checks.vendor"),
      status: productData.vendor ? "passed" : "failed",
    });
    
    // 10. has_tags
    items.push({
      key: "has_tags",
      label: i18n.translate("checks.tags"),
      status: productData.tags && productData.tags.length > 0 ? "passed" : "failed",
    });

    const passedCount = items.filter(i => i.status === "passed").length;
    
    return {
      status: passedCount === items.length ? "ready" : "incomplete",
      passedCount,
      failedCount: items.length - passedCount,
      totalCount: items.length,
      updatedAt: new Date().toISOString(),
      items,
    };
  };

  // Rescan and save to metafield
  const handleRescan = async () => {
    if (!productId) return;
    
    setScanning(true);
    try {
      // Fetch fresh product data
      const query = {
        query: FULL_PRODUCT_QUERY,
        variables: { id: productId },
      };

      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(query),
      });

      if (!res.ok) throw new Error("Failed to fetch product");
      
      const result = await res.json();
      const productData = result.data?.product;
      
      if (!productData) throw new Error("Product not found");
      
      setProduct(productData);
      const auditData = calculateAudit(productData);

      // Save to metafield
      const updateQuery = {
        query: `mutation SaveAudit($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id }
            userErrors { field message }
          }
        }`,
        variables: {
          input: {
            id: productId,
            metafields: [{
              namespace: "${METAFIELD_NAMESPACE}",
              key: "${METAFIELD_KEY}",
              type: "json",
              value: JSON.stringify(auditData),
            }],
          },
        },
      };

      const updateRes = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(updateQuery),
      });

      if (!updateRes.ok) throw new Error("Failed to save audit");

      setAudit(auditData);
    } catch (err) {
      console.error("Error scanning:", err);
    } finally {
      setScanning(false);
    }
  };

  const handleOpenInApp = () => {
    if (productId) {
      const encodedId = encodeURIComponent(productId);
      window.open(`/apps/product-launch-2/app/products/${encodedId}`, "_top");
    } else {
      window.open("/apps/product-launch-2", "_top");
    }
    close();
  };

  // Loading state
  if (loading) {
    return (
      <s-admin-action heading={i18n.translate("title")}>
        <s-stack direction="block" gap="base">
          <s-spinner accessibilityLabel={i18n.translate("loading")} />
          <s-text>{i18n.translate("loading")}</s-text>
        </s-stack>
      </s-admin-action>
    );
  }

  // No product selected
  if (!product) {
    return (
      <s-admin-action heading={i18n.translate("title")}>
        <s-stack direction="block" gap="base">
          <s-text>{i18n.translate("noProduct")}</s-text>
        </s-stack>
        <s-button slot="primary-action" onClick={close}>
          {i18n.translate("close")}
        </s-button>
      </s-admin-action>
    );
  }

  // Product not scanned yet
  if (!audit) {
    return (
      <s-admin-action heading={i18n.translate("title")} loading={scanning}>
        <s-stack direction="block" gap="large">
          <s-stack direction="inline" gap="base">
            {product.featuredImage && (
              <s-thumbnail 
                src={product.featuredImage.url} 
                alt={product.title}
                size="large"
              />
            )}
            <s-stack direction="block" gap="small">
              <s-text>{product.title}</s-text>
              <s-badge tone="info">{i18n.translate("notScanned")}</s-badge>
            </s-stack>
          </s-stack>
          
          <s-banner tone="info">
            {i18n.translate("scanToCheck")}
          </s-banner>
        </s-stack>

        <s-button slot="primary-action" onClick={handleRescan} variant="primary">
          {i18n.translate("scanNow")}
        </s-button>
        <s-button slot="secondary-actions" onClick={handleOpenInApp}>
          {i18n.translate("openInApp")}
        </s-button>
        <s-button slot="secondary-actions" onClick={close}>
          {i18n.translate("close")}
        </s-button>
      </s-admin-action>
    );
  }

  const isReady = audit.status === "ready";
  const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100);

  return (
    <s-admin-action heading={i18n.translate("title")} loading={scanning}>
      <s-stack direction="block" gap="large">
        <s-stack direction="inline" gap="base">
          {product.featuredImage && (
            <s-thumbnail 
              src={product.featuredImage.url} 
              alt={product.title}
              size="large"
            />
          )}
          <s-stack direction="block" gap="small">
            <s-text>{product.title}</s-text>
            <s-badge tone={isReady ? "success" : "warning"}>
              {isReady 
                ? i18n.translate("ready") 
                : i18n.translate("needsWork", { count: audit.failedCount })
              }
            </s-badge>
          </s-stack>
        </s-stack>

        <s-stack direction="inline" gap="small">
          <s-text>
            {audit.passedCount}/{audit.totalCount} {i18n.translate("checksPassed")} ({progressPercent}%)
          </s-text>
        </s-stack>

        <s-stack direction="block" gap="small">
          {audit.items?.slice(0, 6).map((item, index) => (
            <s-stack key={index} direction="inline" gap="small">
              <s-icon 
                type={item.status === "passed" ? "check-circle" : "alert-circle"}
                tone={item.status === "passed" ? "success" : "warning"}
              />
              <s-text>{item.label}</s-text>
            </s-stack>
          ))}
          {audit.items?.length > 6 && (
            <s-text>
              {i18n.translate("andMore", { count: audit.items.length - 6 })}
            </s-text>
          )}
        </s-stack>

        {!isReady && (
          <s-banner tone="info">
            {i18n.translate("fixInApp")}
          </s-banner>
        )}
      </s-stack>

      <s-button slot="primary-action" onClick={handleOpenInApp} variant="primary">
        {isReady ? i18n.translate("viewInApp") : i18n.translate("fixInApp_button")}
      </s-button>
      <s-button slot="secondary-actions" onClick={handleRescan}>
        {i18n.translate("rescan")}
      </s-button>
      <s-button slot="secondary-actions" onClick={close}>
        {i18n.translate("close")}
      </s-button>
    </s-admin-action>
  );
}
