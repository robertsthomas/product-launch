import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { auditProduct } from "../lib/services/audit.server";
import { generateImageAltText, isAIAvailable } from "../lib/ai";
import { PRODUCT_QUERY, type Product } from "../lib/checklist";

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = decodeURIComponent(params.id!);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Upload new image
  if (intent === "upload") {
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type;

    try {
      // Step 1: Create file
      const fileResponse = await admin.graphql(
        `#graphql
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              ... on MediaImage {
                id
                image {
                  url
                }
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
            files: [{
              originalSource: `data:${mimeType};base64,${base64}`,
              filename: file.name,
            }],
          },
        }
      );

      const fileJson = await fileResponse.json();
      const fileId = fileJson.data?.fileCreate?.files?.[0]?.id;

      if (!fileId) {
        const errors = fileJson.data?.fileCreate?.userErrors;
        return Response.json(
          { error: errors?.[0]?.message || "Failed to upload file" },
          { status: 400 }
        );
      }

      // Step 2: Attach to product
      const attachResponse = await admin.graphql(
        `#graphql
        mutation productAppendMedia($productId: ID!, $mediaIds: [ID!]!) {
          productAppendMedia(productId: $productId, mediaIds: $mediaIds) {
            product {
              id
            }
            media {
              ... on MediaImage {
                id
                image {
                  url
                }
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
            productId,
            mediaIds: [fileId],
          },
        }
      );

      const attachJson = await attachResponse.json();
      const errors = attachJson.data?.productAppendMedia?.mediaUserErrors;

      if (errors?.length > 0) {
        return Response.json({ error: errors[0].message }, { status: 400 });
      }

      await auditProduct(shop, productId, admin);

      return Response.json({ 
        success: true, 
        image: attachJson.data?.productAppendMedia?.media?.[0] 
      });
    } catch (error) {
      console.error("Image upload error:", error);
      return Response.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }
  }

  // Update alt text
  if (intent === "update_alt") {
    const imageId = formData.get("imageId") as string;
    const altText = formData.get("altText") as string;

    const response = await admin.graphql(
      `#graphql
      mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
        productUpdateMedia(productId: $productId, media: $media) {
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
          productId,
          media: [{
            id: imageId,
            alt: altText,
          }],
        },
      }
    );

    const json = await response.json();
    const errors = json.data?.productUpdateMedia?.mediaUserErrors;

    if (errors?.length > 0) {
      return Response.json({ error: errors[0].message }, { status: 400 });
    }

    await auditProduct(shop, productId, admin);
    return Response.json({ success: true });
  }

  // Generate alt text with AI
  if (intent === "generate_alt") {
    const imageId = formData.get("imageId") as string;
    const imageIndex = parseInt(formData.get("imageIndex") as string, 10);

    if (!isAIAvailable()) {
      return Response.json(
        { error: "AI is not configured" },
        { status: 503 }
      );
    }

    // Fetch product for context
    const productResponse = await admin.graphql(PRODUCT_QUERY, {
      variables: { id: productId },
    });
    const productJson = await productResponse.json();
    const product = productJson.data?.product as Product | null;

    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const altText = await generateImageAltText(
      {
        title: product.title,
        productType: product.productType,
        vendor: product.vendor,
      },
      imageIndex
    );

    return Response.json({ altText });
  }

  // Delete image
  if (intent === "delete") {
    const imageId = formData.get("imageId") as string;

    const response = await admin.graphql(
      `#graphql
      mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          product {
            id
          }
          mediaUserErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          productId,
          mediaIds: [imageId],
        },
      }
    );

    const json = await response.json();
    const errors = json.data?.productDeleteMedia?.mediaUserErrors;

    if (errors?.length > 0) {
      return Response.json({ error: errors[0].message }, { status: 400 });
    }

    await auditProduct(shop, productId, admin);
    return Response.json({ success: true });
  }

  // Set featured image
  if (intent === "set_featured") {
    const imageId = formData.get("imageId") as string;

    const response = await admin.graphql(
      `#graphql
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            featuredImage {
              id
              url
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
            id: productId,
            featuredMediaId: imageId,
          },
        },
      }
    );

    const json = await response.json();
    const errors = json.data?.productUpdate?.userErrors;

    if (errors?.length > 0) {
      return Response.json({ error: errors[0].message }, { status: 400 });
    }

    await auditProduct(shop, productId, admin);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid intent" }, { status: 400 });
};

