import { desc, eq } from "drizzle-orm"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import { db } from "../db"
import { productFieldVersions, shops } from "../db/schema"
import { authenticate } from "../shopify.server"

// GET: Fetch all version histories for the shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)

  try {
    // Get shop ID from domain
    const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.shopDomain, session.shop)).limit(1)

    if (!shop) {
      return Response.json({ versions: [] })
    }

    // Get all versions for this shop
    const versions = await db
      .select({
        id: productFieldVersions.id,
        productId: productFieldVersions.productId,
        field: productFieldVersions.field,
        value: productFieldVersions.value,
        version: productFieldVersions.version,
        source: productFieldVersions.source,
        createdAt: productFieldVersions.createdAt,
      })
      .from(productFieldVersions)
      .where(eq(productFieldVersions.shopId, shop.id))
      .orderBy(desc(productFieldVersions.createdAt))
      .limit(100)

    // Fetch product titles from Shopify for context
    const productIds = [...new Set(versions.map((v) => v.productId))]
    const productTitles: Record<string, string> = {}

    if (productIds.length > 0) {
      // Fetch product titles in batches
      for (const productId of productIds.slice(0, 20)) {
        try {
          const response = await admin.graphql(
            `#graphql
            query GetProductTitle($id: ID!) {
              product(id: $id) {
                title
              }
            }
          `,
            { variables: { id: productId } }
          )
          const data = await response.json()
          if (data.data?.product?.title) {
            productTitles[productId] = data.data.product.title
          }
        } catch {
          // Skip if product not found
        }
      }
    }

    // Enrich versions with product titles
    const enrichedVersions = versions.map((v) => ({
      ...v,
      productTitle: productTitles[v.productId] || "Unknown Product",
    }))

    return Response.json({ versions: enrichedVersions })
  } catch (error) {
    console.error("Load all versions error:", error)
    return Response.json({ error: "Failed to load version histories" }, { status: 500 })
  }
}

// POST: Revert a field to a specific version
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)
  const formData = await request.formData()

  const versionId = formData.get("versionId") as string
  const productId = formData.get("productId") as string
  const field = formData.get("field") as string

  if (!versionId || !productId) {
    return Response.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    // Get the version data
    const [version] = await db
      .select()
      .from(productFieldVersions)
      .where(eq(productFieldVersions.id, versionId))
      .limit(1)

    if (!version) {
      return Response.json({ error: "Version not found" }, { status: 404 })
    }

    const normalizeFieldName = (rawField: string) => {
      const mapping: Record<string, string> = {
        seo_title: "seoTitle",
        seo_description: "seoDescription",
      }
      return mapping[rawField] || rawField
    }

    const normalizedField = normalizeFieldName(field || version.field)

    // Map field names to GraphQL mutation fields
    const _fieldMap: Record<string, string> = {
      title: "title",
      description: "descriptionHtml",
      seoTitle: "seo { title }",
      seoDescription: "seo { description }",
      tags: "tags",
    }

    // Build the update mutation based on field type
    let mutation: string
    let variables: Record<string, unknown>

    if (normalizedField === "tags") {
      const tags = JSON.parse(version.value)
      mutation = `#graphql
        mutation UpdateProductTags($id: ID!, $tags: [String!]!) {
          productUpdate(product: { id: $id, tags: $tags }) {
            product { id }
            userErrors { field message }
          }
        }
      `
      variables = { id: productId, tags }
    } else if (normalizedField === "seoTitle") {
      mutation = `#graphql
        mutation UpdateProductSeoTitle($id: ID!, $seoTitle: String!) {
          productUpdate(product: { id: $id, seo: { title: $seoTitle } }) {
            product { id }
            userErrors { field message }
          }
        }
      `
      variables = { id: productId, seoTitle: version.value }
    } else if (normalizedField === "seoDescription") {
      mutation = `#graphql
        mutation UpdateProductSeoDescription($id: ID!, $seoDescription: String!) {
          productUpdate(product: { id: $id, seo: { description: $seoDescription } }) {
            product { id }
            userErrors { field message }
          }
        }
      `
      variables = { id: productId, seoDescription: version.value }
    } else if (normalizedField === "description") {
      mutation = `#graphql
        mutation UpdateProductDescription($id: ID!, $descriptionHtml: String!) {
          productUpdate(product: { id: $id, descriptionHtml: $descriptionHtml }) {
            product { id }
            userErrors { field message }
          }
        }
      `
      variables = { id: productId, descriptionHtml: version.value }
    } else {
      // title and other simple fields
      mutation = `#graphql
        mutation UpdateProductField($id: ID!, $title: String!) {
          productUpdate(product: { id: $id, title: $title }) {
            product { id }
            userErrors { field message }
          }
        }
      `
      variables = { id: productId, title: version.value }
    }

    const response = await admin.graphql(mutation, { variables })
    const data = await response.json()

    if (data.data?.productUpdate?.userErrors?.length > 0) {
      return Response.json({ error: data.data.productUpdate.userErrors[0].message }, { status: 400 })
    }

    // Confirm the update by re-fetching the product field
    const confirmResponse = await admin.graphql(
      `#graphql
        query ConfirmProductField($id: ID!) {
          product(id: $id) {
            title
            descriptionHtml
            tags
            seo { title description }
          }
        }
      `,
      { variables: { id: productId } }
    )
    const confirmData = await confirmResponse.json()
    const confirmedProduct = confirmData.data?.product

    let confirmed = false
    if (confirmedProduct) {
      switch (normalizedField) {
        case "title":
          confirmed = (confirmedProduct.title || "") === version.value
          break
        case "description":
          confirmed = (confirmedProduct.descriptionHtml || "") === version.value
          break
        case "seoTitle":
          confirmed = (confirmedProduct.seo?.title || "") === version.value
          break
        case "seoDescription":
          confirmed = (confirmedProduct.seo?.description || "") === version.value
          break
        case "tags": {
          const expectedTags = Array.isArray(version.value) ? version.value : JSON.parse(version.value || "[]")
          const actualTags = Array.isArray(confirmedProduct.tags) ? confirmedProduct.tags : []
          const normalize = (values: string[]) => values.map((v) => v.trim()).sort()
          confirmed = JSON.stringify(normalize(expectedTags)) === JSON.stringify(normalize(actualTags))
          break
        }
        default:
          confirmed = false
      }
    }

    if (confirmed) {
      await db.delete(productFieldVersions).where(eq(productFieldVersions.id, versionId))
    }

    return Response.json({
      success: true,
      confirmed,
      message: confirmed ? "Reverted successfully" : "Revert applied, but could not confirm the update.",
      reverted: confirmed
        ? {
            id: version.id,
            productId,
            field: normalizedField,
            version: version.version,
            revertedAt: new Date().toISOString(),
          }
        : null,
    })
  } catch (error) {
    console.error("Revert version error:", error)
    return Response.json({ error: "Failed to revert version" }, { status: 500 })
  }
}
