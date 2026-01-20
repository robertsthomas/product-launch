/**
 * Image Readiness Analyzer Service
 *
 * Analyzes product images for launch readiness without heavy ML.
 * Checks: resolution, aspect ratio, alt text
 */

export interface ImageAnalysis {
  id: string
  url: string
  altText: string | null
  width?: number
  height?: number
  issues: ImageIssue[]
  score: number // 0-100
  recommendations: string[]
}

export interface ImageIssue {
  type: "resolution" | "aspect_ratio" | "alt_text" | "format"
  severity: "error" | "warning" | "info"
  message: string
}

export interface ProductImageAnalysis {
  images: ImageAnalysis[]
  overallScore: number
  totalIssues: number
  criticalIssues: number
  summary: string
}

// Recommended minimum dimensions
const MIN_WIDTH = 1200
const MIN_HEIGHT = 1200
const IDEAL_MIN_SIZE = 1500

// Recommended aspect ratios for e-commerce
const RECOMMENDED_RATIOS = [
  { name: "Square (1:1)", ratio: 1, tolerance: 0.05 },
  { name: "Portrait (4:5)", ratio: 0.8, tolerance: 0.05 },
  { name: "Portrait (3:4)", ratio: 0.75, tolerance: 0.05 },
  { name: "Landscape (4:3)", ratio: 1.33, tolerance: 0.05 },
  { name: "Landscape (16:9)", ratio: 1.78, tolerance: 0.05 },
]

/**
 * Analyze a single image
 */
export function analyzeImage(image: {
  id: string
  url: string
  altText: string | null
  width?: number
  height?: number
}): ImageAnalysis {
  const issues: ImageIssue[] = []
  const recommendations: string[] = []
  let score = 100

  // Check alt text
  if (!image.altText?.trim()) {
    issues.push({
      type: "alt_text",
      severity: "error",
      message: "Missing alt text",
    })
    recommendations.push("Add descriptive alt text for accessibility and SEO")
    score -= 25
  } else if (image.altText.length < 10) {
    issues.push({
      type: "alt_text",
      severity: "warning",
      message: "Alt text is too short",
    })
    recommendations.push("Use more descriptive alt text (10+ characters)")
    score -= 10
  }

  // Check resolution if dimensions available
  if (image.width && image.height) {
    const smallerDimension = Math.min(image.width, image.height)
    const _largerDimension = Math.max(image.width, image.height)

    if (smallerDimension < MIN_WIDTH || image.height < MIN_HEIGHT) {
      issues.push({
        type: "resolution",
        severity: "warning",
        message: `Image resolution is ${image.width}×${image.height}px`,
      })
      recommendations.push(`Use images at least ${MIN_WIDTH}×${MIN_HEIGHT}px for best quality on all devices`)
      score -= 20
    } else if (smallerDimension < IDEAL_MIN_SIZE) {
      issues.push({
        type: "resolution",
        severity: "info",
        message: `Image is ${image.width}×${image.height}px, ideal is ${IDEAL_MIN_SIZE}px+`,
      })
      recommendations.push(`Consider using ${IDEAL_MIN_SIZE}×${IDEAL_MIN_SIZE}px+ images for retina displays`)
      score -= 5
    }

    // Check aspect ratio
    const ratio = image.width / image.height
    const matchedRatio = RECOMMENDED_RATIOS.find((r) => Math.abs(ratio - r.ratio) <= r.tolerance)

    if (!matchedRatio) {
      issues.push({
        type: "aspect_ratio",
        severity: "warning",
        message: `Unusual aspect ratio (${ratio.toFixed(2)})`,
      })
      recommendations.push("Use 1:1 (square), 4:5 (portrait), or 4:3 (landscape) aspect ratios for consistency")
      score -= 15
    }
  } else {
    // No dimension info available - add info message
    issues.push({
      type: "resolution",
      severity: "info",
      message: "Image dimensions not available",
    })
  }

  // Check for Shopify CDN format hints in URL
  if (image.url) {
    const url = image.url.toLowerCase()
    if (url.includes(".gif") && !url.includes("_static")) {
      issues.push({
        type: "format",
        severity: "info",
        message: "Consider using static images instead of GIFs for faster loading",
      })
      score -= 5
    }
  }

  return {
    id: image.id,
    url: image.url,
    altText: image.altText,
    width: image.width,
    height: image.height,
    issues,
    score: Math.max(0, score),
    recommendations,
  }
}

/**
 * Analyze all images for a product
 */
export function analyzeProductImages(
  images: Array<{
    id: string
    url: string
    altText: string | null
    width?: number
    height?: number
  }>
): ProductImageAnalysis {
  if (images.length === 0) {
    return {
      images: [],
      overallScore: 0,
      totalIssues: 1,
      criticalIssues: 1,
      summary: "No images found. Add product images to improve conversion.",
    }
  }

  const analyzedImages = images.map(analyzeImage)

  const totalIssues = analyzedImages.reduce((sum, img) => sum + img.issues.length, 0)
  const criticalIssues = analyzedImages.reduce(
    (sum, img) => sum + img.issues.filter((i) => i.severity === "error").length,
    0
  )

  const overallScore = Math.round(analyzedImages.reduce((sum, img) => sum + img.score, 0) / analyzedImages.length)

  // Generate summary
  let summary: string
  if (criticalIssues > 0) {
    const missingAlt = analyzedImages.filter((img) =>
      img.issues.some((i) => i.type === "alt_text" && i.severity === "error")
    ).length
    summary =
      missingAlt > 0
        ? `${missingAlt} image${missingAlt > 1 ? "s" : ""} missing alt text. Fix for better SEO.`
        : `${criticalIssues} critical issue${criticalIssues > 1 ? "s" : ""} found.`
  } else if (totalIssues > 0) {
    summary = `${totalIssues} improvement${totalIssues > 1 ? "s" : ""} suggested for better image quality.`
  } else {
    summary = "All images meet recommended standards. Great job!"
  }

  return {
    images: analyzedImages,
    overallScore,
    totalIssues,
    criticalIssues,
    summary,
  }
}

/**
 * Get images that need alt text
 */
export function getImagesNeedingAltText(
  images: Array<{
    id: string
    url: string
    altText: string | null
  }>
): Array<{ id: string; url: string }> {
  return images.filter((img) => !img.altText?.trim()).map((img) => ({ id: img.id, url: img.url }))
}

/**
 * Get formatted recommendations for image improvements
 */
export function getImageRecommendations(analysis: ProductImageAnalysis): string[] {
  const recommendations = new Set<string>()

  for (const image of analysis.images) {
    for (const rec of image.recommendations) {
      recommendations.add(rec)
    }
  }

  // Add general recommendations
  if (analysis.images.length < 3) {
    recommendations.add("Add more images (3-5 recommended) to showcase your product from different angles")
  }

  if (analysis.images.length > 0 && analysis.images.length < 5) {
    recommendations.add("Consider adding lifestyle or in-use images to help customers visualize the product")
  }

  return Array.from(recommendations)
}
