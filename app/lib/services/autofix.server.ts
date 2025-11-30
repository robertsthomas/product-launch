import { eq, and } from "drizzle-orm";
import { db, shops, productAudits, productAuditItems } from "../../db";
import { PRODUCT_QUERY, type Product } from "../checklist";
import { auditProduct } from "./audit.server";

type AdminGraphQL = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

/**
 * Auto-fix: Set SEO title from product title
 */
async function fixSeoTitle(
  product: Product,
  admin: AdminGraphQL
): Promise<{ success: boolean; message: string }> {
  const seoTitle = product.title;

  const response = await admin.graphql(
    `#graphql
    mutation UpdateProductSEO($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          seo {
            title
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          id: product.id,
          seo: {
            title: seoTitle,
          },
        },
      },
    }
  );

  const json = await response.json();
  const errors = json.data?.productUpdate?.userErrors;

  if (errors && errors.length > 0) {
    return { success: false, message: errors[0].message };
  }

  return { success: true, message: `SEO title set to "${seoTitle}"` };
}

/**
 * Auto-fix: Generate SEO description from product info
 */
async function fixSeoDescription(
  product: Product,
  admin: AdminGraphQL
): Promise<{ success: boolean; message: string }> {
  // Generate a description from product info
  const parts: string[] = [];

  if (product.title) {
    parts.push(product.title);
  }

  if (product.productType) {
    parts.push(`is a ${product.productType.toLowerCase()}`);
  }

  if (product.vendor) {
    parts.push(`from ${product.vendor}`);
  }

  if (product.tags?.length > 0) {
    const relevantTags = product.tags.slice(0, 3).join(", ");
    parts.push(`featuring ${relevantTags}`);
  }

  let description = parts.join(" ");
  
  // Pad to meet minimum length if needed
  if (description.length < 80) {
    description += ". Shop now for the best selection and quality products.";
  }

  // Truncate if too long for SEO
  if (description.length > 160) {
    description = description.substring(0, 157) + "...";
  }

  const response = await admin.graphql(
    `#graphql
    mutation UpdateProductSEO($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          seo {
            description
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          id: product.id,
          seo: {
            description,
          },
        },
      },
    }
  );

  const json = await response.json();
  const errors = json.data?.productUpdate?.userErrors;

  if (errors && errors.length > 0) {
    return { success: false, message: errors[0].message };
  }

  return { success: true, message: `SEO description generated (${description.length} chars)` };
}

/**
 * Auto-fix: Add alt text to images using product title
 */
async function fixImageAltText(
  product: Product,
  admin: AdminGraphQL
): Promise<{ success: boolean; message: string }> {
  const images = product.images?.nodes ?? [];
  const imagesWithoutAlt = images.filter((img) => !img.altText?.trim());

  if (imagesWithoutAlt.length === 0) {
    return { success: true, message: "All images already have alt text" };
  }

  let fixed = 0;
  for (let i = 0; i < imagesWithoutAlt.length; i++) {
    const image = imagesWithoutAlt[i];
    const altText = i === 0 
      ? product.title 
      : `${product.title} - Image ${i + 1}`;

    const response = await admin.graphql(
      `#graphql
      mutation UpdateProductImage($productId: ID!, $image: ImageInput!) {
        productUpdateMedia(productId: $productId, media: [{ id: $image.id, alt: $image.altText }]) {
          media {
            ... on MediaImage {
              id
              alt
            }
          }
          mediaUserErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          productId: product.id,
          image: {
            id: image.id,
            altText,
          },
        },
      }
    );

    const json = await response.json();
    const errors = json.data?.productUpdateMedia?.mediaUserErrors;

    if (!errors || errors.length === 0) {
      fixed++;
    }
  }

  return {
    success: fixed > 0,
    message: `Added alt text to ${fixed} of ${imagesWithoutAlt.length} images`,
  };
}

/**
 * Auto-fix: Add product to default collection
 */
async function fixAddToCollection(
  product: Product,
  admin: AdminGraphQL,
  collectionId: string
): Promise<{ success: boolean; message: string }> {
  const response = await admin.graphql(
    `#graphql
    mutation AddProductToCollection($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        id: collectionId,
        productIds: [product.id],
      },
    }
  );

  const json = await response.json();
  const errors = json.data?.collectionAddProducts?.userErrors;
  const collection = json.data?.collectionAddProducts?.collection;

  if (errors && errors.length > 0) {
    return { success: false, message: errors[0].message };
  }

  return {
    success: true,
    message: `Added to collection "${collection?.title ?? "selected collection"}"`,
  };
}

// Map of rule keys to auto-fix functions
type AutoFixFn = (
  product: Product,
  admin: AdminGraphQL,
  config?: Record<string, unknown>
) => Promise<{ success: boolean; message: string }>;

const autoFixMap: Record<string, AutoFixFn> = {
  seo_title: fixSeoTitle,
  seo_description: fixSeoDescription,
  images_have_alt_text: fixImageAltText,
  has_collections: (product, admin, config) =>
    fixAddToCollection(product, admin, config?.collectionId as string),
};

/**
 * Apply an auto-fix for a specific checklist item
 */
export async function applyAutoFix(
  shopDomain: string,
  productId: string,
  itemKey: string,
  admin: AdminGraphQL,
  config?: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  // Get the product data
  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: productId },
  });

  const json = await response.json();
  const product = json.data?.product as Product | null;

  if (!product) {
    return { success: false, message: "Product not found" };
  }

  // Get the auto-fix function
  const fixFn = autoFixMap[itemKey];

  if (!fixFn) {
    return { success: false, message: `No auto-fix available for "${itemKey}"` };
  }

  // Apply the fix
  const result = await fixFn(product, admin, config);

  // Re-run audit to update status
  if (result.success) {
    await auditProduct(shopDomain, productId, admin);
  }

  return result;
}

/**
 * Get available auto-fixes for a product
 */
export async function getAvailableAutoFixes(shopDomain: string, productId: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });

  if (!shop) {
    return [];
  }

  const audit = await db.query.productAudits.findFirst({
    where: and(
      eq(productAudits.shopId, shop.id),
      eq(productAudits.productId, productId)
    ),
    with: {
      items: {
        where: and(
          eq(productAuditItems.status, "failed"),
          eq(productAuditItems.canAutoFix, true)
        ),
        with: {
          item: true,
        },
      },
    },
  });

  return audit?.items ?? [];
}
