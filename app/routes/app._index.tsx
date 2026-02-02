import { eq } from "drizzle-orm"
import { useAppBridge } from "@shopify/app-bridge-react"
import { boundary } from "@shopify/shopify-app-react-router/server"
import confetti from "canvas-confetti"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router"
import { useFetcher, useLoaderData, useNavigate, useOutletContext, useRevalidator } from "react-router"
import { db } from "../db"
import { shops } from "../db/schema"
import { getShopPlanStatus } from "../lib/billing/guards.server"
import { PRODUCTS_LIST_QUERY } from "../lib/checklist"
import { auditProduct, getDashboardStats, getShopAudits } from "../lib/services"
import { getDriftSummary } from "../lib/services/monitoring.server"
import { initializeShop } from "../lib/services/shop.server"
import { authenticate } from "../shopify.server"
import { CircularProgress } from "../components/dashboard/CircularProgress"
import { DashboardTour } from "../components/dashboard/DashboardTour"
import { BulkGenerateAllModal } from "../components/modals/BulkGenerateAllModal"
import { BulkProgressModal } from "../components/modals/BulkProgressModal"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = session.shop

  // Ensure shop is properly initialized before any operations
  const shopRecord = await initializeShop(shop)
  if (!shopRecord) {
    console.error(`Failed to initialize shop: ${shop}`)
    throw new Error("Shop initialization failed")
  }

  const stats = await getDashboardStats(shop)
  const { audits, total } = await getShopAudits(shop, { limit: 50 })
  const { plan } = await getShopPlanStatus(shop)

  // Pro feature: Get compliance monitoring data
  let monitoring = null
  if (plan === "pro") {
    const driftSummary = await getDriftSummary(shop, 7)
    monitoring = {
      driftsThisWeek: driftSummary.total,
      unresolvedDrifts: driftSummary.unresolved,
      productsAffected: driftSummary.productsAffected,
      byType: driftSummary.byType,
      recentDrifts: driftSummary.recentDrifts.map((d) => ({
        id: d.id,
        productId: d.productId,
        productTitle: d.productTitle,
        driftType: d.driftType,
        severity: d.severity,
        detectedAt: d.detectedAt instanceof Date ? d.detectedAt.toISOString() : d.detectedAt,
        isResolved: d.isResolved,
      })),
    }
  }

  return {
    shop,
    stats,
    plan,
    monitoring,
    celebratedAt: shopRecord.celebratedAt ? shopRecord.celebratedAt.toISOString() : null,
    audits: audits.map((audit) => ({
      id: audit.id,
      productId: audit.productId,
      productTitle: audit.productTitle,
      productImage: audit.productImage,
      status: audit.status,
      passedCount: audit.passedCount,
      failedCount: audit.failedCount,
      totalCount: audit.totalCount,
      updatedAt:
        audit.updatedAt instanceof Date ? audit.updatedAt.toISOString() : new Date(audit.updatedAt).toISOString(),
      items: audit.items.map((i) => ({
        id: i.id,
        status: i.status,
        label: i.item.label,
        key: i.item.key,
        details: i.details,
        canAutoFix: i.canAutoFix,
      })),
    })),
    totalAudits: total,
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request)
  const shop = session.shop
  const formData = await request.formData()
  const intent = formData.get("intent")

  if (intent === "scan_all") {
    let hasMore = true
    let cursor: string | null = null
    let scanned = 0

    while (hasMore) {
      const graphqlResponse = await admin.graphql(PRODUCTS_LIST_QUERY, {
        variables: { first: 50, after: cursor },
      })

      const graphqlJson: {
        data?: {
          products?: {
            nodes?: Array<{ id: string }>
            pageInfo?: { hasNextPage?: boolean; endCursor?: string }
          }
        }
      } = await graphqlResponse.json()
      const products = graphqlJson.data?.products?.nodes ?? []
      const pageInfo = graphqlJson.data?.products?.pageInfo

      for (const product of products) {
        try {
          // Skip metafield updates during batch scan to avoid webhook loops
          await auditProduct(shop, product.id, admin, true)
          scanned++
        } catch (error) {
          console.error(`Failed to audit product ${product.id}:`, error)
        }
      }

      hasMore = pageInfo?.hasNextPage ?? false
      cursor = pageInfo?.endCursor ?? null
    }

    return { success: true, scanned }
  }

  if (intent === "mark_celebrated") {
    await db.update(shops).set({ celebratedAt: new Date() }).where(eq(shops.shopDomain, shop))
    return { success: true }
  }

  return { success: false }
}

// ============================================
// Main Dashboard Component
// ============================================

export default function Dashboard() {
  const { shop, stats, audits, plan, monitoring, totalAudits, celebratedAt } = useLoaderData<typeof loader>()
  const { isNavTourOpen } = useOutletContext<{ isNavTourOpen: boolean }>()
  const isPro = plan === "pro"
  const fetcher = useFetcher<typeof action>()
  const autofixFetcher = useFetcher()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const shopify = useAppBridge()
  const [filter, _setFilter] = useState<"all" | "ready" | "incomplete">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 20
  const [isScanning, setIsScanning] = useState(false)
  const [sortBy, setSortBy] = useState<"most-fixes" | "least-fixes" | "highest-score" | "lowest-score">("most-fixes")
  const [showSortDropdown, setShowSortDropdown] = useState(false)

  // Tour state - user-level (localStorage)
  const [isTourOpen, setIsTourOpen] = useState(false)
  const [_tourCompleted, setTourCompleted] = useState(false)

  // Bulk selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [_showBulkModal, setShowBulkModal] = useState(false)
  const [_bulkAction, setBulkAction] = useState<string | null>(null)
  const [_bulkProgress, setBulkProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  // Bulk AI generation state
  const [showGenerateAllModal, setShowGenerateAllModal] = useState(false)
  const [selectedBulkFields, setSelectedBulkFields] = useState<string[]>([])
  const [bulkFieldOptions, setBulkFieldOptions] = useState<Record<string, string[]>>({})
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false)
  const [generatingProductIds, setGeneratingProductIds] = useState<Set<string>>(new Set())
  const [currentlyProcessingId, setCurrentlyProcessingId] = useState<string | null>(null)
  const [completedProductIds, setCompletedProductIds] = useState<Set<string>>(new Set())

  // Bulk action progress modal state
  const [showBulkProgressModal, setShowBulkProgressModal] = useState(false)
  const [bulkActionType, setBulkActionType] = useState<string>("")
  const [bulkActionStopped, setBulkActionStopped] = useState(false)

  // Image generation alert state
  const [showImageAlert, setShowImageAlert] = useState(false)
  const [skippedImageProducts, setSkippedImageProducts] = useState<string[]>([])
  const [eligibleImageProductIds, setEligibleImageProductIds] = useState<string[]>([])

  // Autofix alert state
  const [showAutofixAlert, setShowAutofixAlert] = useState(false)
  const [skippedAutofixProducts, setSkippedAutofixProducts] = useState<string[]>([])
  const [eligibleAutofixProductIds, setEligibleAutofixProductIds] = useState<string[]>([])

  // Autofix state
  const [fixingProductId, setFixingProductId] = useState<string | null>(null)

  // Monitoring modal state (Pro only)
  const [showMonitoringModal, setShowMonitoringModal] = useState(false)

  // Bulk actions dropdown state

  // Expandable rows state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Show tour on first visit (user-level)
  useEffect(() => {
    const tourCompleted = localStorage.getItem("dashboardTourCompleted") === "true"
    const navTourCompleted = localStorage.getItem("navigationTourCompleted") === "true"

    setTourCompleted(tourCompleted)

    // Only auto-open dashboard tour if Nav tour is done but Dashboard tour isn't
    if (navTourCompleted && !tourCompleted && !isTourOpen) {
      const timer = setTimeout(() => setIsTourOpen(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [isNavTourOpen])

  const completeTour = async () => {
    setTourCompleted(true)
    localStorage.setItem("dashboardTourCompleted", "true")
    setIsTourOpen(false)
    // Clear any expanded dummy rows
    setExpandedRows((prev) => {
      const cleaned = new Set(prev)
      cleaned.delete("tour-dummy-1")
      cleaned.delete("tour-dummy-2")
      cleaned.delete("tour-dummy-3")
      return cleaned
    })
  }

  // Clear dummy data expanded rows when real data arrives or tour closes
  useEffect(() => {
    if (audits.length > 0 || !isTourOpen) {
      setExpandedRows((prev) => {
        const cleaned = new Set(prev)
        cleaned.delete("tour-dummy-1")
        cleaned.delete("tour-dummy-2")
        cleaned.delete("tour-dummy-3")
        return cleaned
      })
    }
  }, [audits.length, isTourOpen])

  // Track scanning state
  useEffect(() => {
    if (fetcher.state === "submitting" || fetcher.state === "loading") {
      // Check if this is a scan_all submission
      const intent = fetcher.formData?.get("intent")
      if (intent === "scan_all") {
        setIsScanning(true)
      }
    } else if (fetcher.state === "idle") {
      setIsScanning(false)
    }
  }, [fetcher.state, fetcher.formData])

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.scanned !== undefined) {
      shopify.toast.show(`Scanned ${fetcher.data.scanned} products`)
    }
  }, [fetcher.data, shopify])

  // Animated progress for catalog health
  const [animatedPercent, setAnimatedPercent] = useState(0)
  useEffect(() => {
    const target = stats.totalAudited > 0 ? Math.round((stats.readyCount / stats.totalAudited) * 100) : 0
    const duration = 1000
    const startTime = performance.now()
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - (1 - progress) ** 3
      setAnimatedPercent(Math.round(eased * target))
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [stats.readyCount, stats.totalAudited])

  // Confetti celebration when reaching 100% product health
  const hasTriggeredConfetti = useRef(false)
  const [showCelebrationModal, setShowCelebrationModal] = useState(false)

  const triggerConfetti = useCallback(() => {
    // Fire confetti from the top of the screen
    const duration = 3000
    const end = Date.now() + duration

    const frame = () => {
      // Launch from left side
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0 },
        colors: ["#465A54", "#22c55e", "#10b981", "#059669", "#fbbf24"],
        zIndex: 1002,
      })
      // Launch from right side
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0 },
        colors: ["#465A54", "#22c55e", "#10b981", "#059669", "#fbbf24"],
        zIndex: 1002,
      })

      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }

    frame()
  }, [])

  useEffect(() => {
    const currentPercent = stats.totalAudited > 0 ? Math.round((stats.readyCount / stats.totalAudited) * 100) : 0

    // Check if we've reached 100% and haven't triggered confetti yet
    // Don't trigger if any tour is currently active
    if (
      currentPercent === 100 &&
      stats.totalAudited > 0 &&
      !hasTriggeredConfetti.current &&
      !isNavTourOpen &&
      !isTourOpen &&
      !celebratedAt &&
      _tourCompleted
    ) {
      // Delay slightly to let the animation complete
      setTimeout(() => {
        triggerConfetti()
        setShowCelebrationModal(true)
        // Persist to DB
        fetcher.submit({ intent: "mark_celebrated" }, { method: "POST" })
      }, 1200)
      hasTriggeredConfetti.current = true
    } else if (currentPercent < 100) {
      // Reset the flag if we drop below 100% so it can trigger again
      hasTriggeredConfetti.current = false
    }
  }, [
    stats.readyCount,
    stats.totalAudited,
    shop,
    triggerConfetti,
    isNavTourOpen,
    isTourOpen,
    celebratedAt,
    fetcher,
    _tourCompleted,
  ])

  // Handle autofix completion
  useEffect(() => {
    if (autofixFetcher.state === "idle" && autofixFetcher.data && fixingProductId) {
      setFixingProductId(null)
      revalidator.revalidate()

      const data = autofixFetcher.data as { success: boolean; message: string }
      if (data.success) {
        shopify.toast.show(data.message || "Fixes applied")
      } else {
        shopify.toast.show(data.message || "No fixes available", { isError: true })
      }
    }
  }, [autofixFetcher.state, autofixFetcher.data, fixingProductId, revalidator, shopify])

  // Selection handlers
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  const selectAllVisible = () => {
    const visibleIds = paginatedAudits.map((a) => a.productId)
    setSelectedProducts(new Set(visibleIds))
  }

  const clearSelection = () => {
    setSelectedProducts(new Set())
  }

  const executeBulkAction = async (action: string, options?: Record<string, any>) => {
    if (selectedProducts.size === 0) return

    setBulkAction(action)
    setBulkActionType(action)
    setBulkProgress({ current: 0, total: selectedProducts.size })
    setGeneratingProductIds(new Set(selectedProducts))
    setIsGeneratingBulk(true)
    setShowBulkProgressModal(true)
    setBulkActionStopped(false)

    const formData = new FormData()
    formData.append("intent", action)
    formData.append("productIds", JSON.stringify(Array.from(selectedProducts)))
    if (options?.selectedFields) {
      formData.append("selectedFields", JSON.stringify(options.selectedFields))
    }
    if (options?.fieldOptions) {
      formData.append("fieldOptions", JSON.stringify(options.fieldOptions))
    }

    try {
      const response = await fetch("/api/bulk-fix", { method: "POST", body: formData })
      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response stream")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = JSON.parse(line.slice(6))

          if (data.type === "processing") {
            setCurrentlyProcessingId(data.productId)
          } else if (data.type === "progress") {
            setBulkProgress({ current: data.processed, total: data.total })
            setCompletedProductIds((prev) => new Set([...prev, data.productId]))
            setCurrentlyProcessingId(null)
          } else if (data.type === "complete") {
            shopify.toast.show(`Bulk fix complete: ${data.successCount} succeeded, ${data.errorCount} failed`)
            closeBulkProgressModal()
            revalidator.revalidate()
          }
        }
      }
    } catch (e) {
      console.error("Bulk action error:", e)
      shopify.toast.show("Bulk action failed")
      closeBulkProgressModal()
    }
  }

  const closeBulkProgressModal = () => {
    setSelectedProducts(new Set())
    setShowBulkModal(false)
    setBulkProgress(null)
    setIsGeneratingBulk(false)
    setSelectedBulkFields([])
    setBulkFieldOptions({})
    setGeneratingProductIds(new Set())
    setCurrentlyProcessingId(null)
    setCompletedProductIds(new Set())
    setShowBulkProgressModal(false)
    setBulkActionType("")
  }

  const stopBulkAction = () => {
    setBulkActionStopped(true)
    shopify.toast.show("Stopping after current item...")
    // The stream will complete naturally, we just won't process more
    closeBulkProgressModal()
  }

  // Run autofix on a list of product IDs
  const runAutofixOnProducts = async (productIds: string[]) => {
    console.log("[Autofix Action] Starting autofix for products:", productIds)
    setBulkActionType("autofix")
    setGeneratingProductIds(new Set(productIds))
    setCompletedProductIds(new Set())
    setIsGeneratingBulk(true)
    setShowBulkProgressModal(true)

    for (const productId of productIds) {
      if (bulkActionStopped) break
      setCurrentlyProcessingId(productId)
      const productIdShort = productId.split("/").pop()
      console.log("[Autofix Action] Processing:", { productId, productIdShort })
      try {
        const response = await fetch(`/api/products/${productIdShort}/autofix`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ intent: "fix_all" }),
        })
        const data = await response.json()
        console.log("[Autofix Action] Response:", { productIdShort, data })
        setCompletedProductIds((prev) => new Set([...prev, productId]))
      } catch (e) {
        console.error("[Autofix Action] Error:", e)
      }
    }

    console.log("[Autofix Action] Complete")
    shopify.toast.show(`Autofix complete for ${productIds.length} products`)
    closeBulkProgressModal()
    revalidator.revalidate()
  }

  const filteredAudits = useMemo(() => {
    const filtered = audits.filter((audit) => {
      if (filter !== "all" && audit.status !== filter) return false
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return audit.productTitle.toLowerCase().includes(query)
      }
      return true
    })

    // Apply sorting
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "most-fixes":
          return b.failedCount - a.failedCount
        case "least-fixes":
          return a.failedCount - b.failedCount
        case "highest-score": {
          const scoreA = a.passedCount / a.totalCount
          const scoreB = b.passedCount / b.totalCount
          return scoreB - scoreA
        }
        case "lowest-score": {
          const scoreA2 = a.passedCount / a.totalCount
          const scoreB2 = b.passedCount / b.totalCount
          return scoreA2 - scoreB2
        }
        default:
          return 0
      }
    })
  }, [audits, filter, searchQuery, sortBy])

  // Dummy data for tour when no products exist
  const dummyAudits = useMemo(() => {
    // Only show dummy data if tour is open AND no real products exist
    if (!isTourOpen || audits.length > 0) return []
    
    return [
      {
        id: "tour-dummy-1",
        productId: "gid://shopify/Product/tour-dummy-1",
        productTitle: "Premium Cotton T-Shirt",
        productImage: null,
        status: "ready" as const,
        passedCount: 10,
        failedCount: 0,
        totalCount: 10,
        updatedAt: new Date().toISOString(),
        items: [],
      },
      {
        id: "tour-dummy-2",
        productId: "gid://shopify/Product/tour-dummy-2",
        productTitle: "Classic Denim Jeans",
        productImage: null,
        status: "incomplete" as const,
        passedCount: 6,
        failedCount: 4,
        totalCount: 10,
        updatedAt: new Date().toISOString(),
        items: [],
      },
      {
        id: "tour-dummy-3",
        productId: "gid://shopify/Product/tour-dummy-3",
        productTitle: "Leather Backpack",
        productImage: null,
        status: "incomplete" as const,
        passedCount: 4,
        failedCount: 6,
        totalCount: 10,
        updatedAt: new Date().toISOString(),
        items: [],
      },
    ]
  }, [isTourOpen, audits.length])

  // Pagination - only use dummy data if tour is open AND no real products exist
  const auditsForPagination = isTourOpen && audits.length === 0 ? dummyAudits : filteredAudits
  const totalPages = Math.ceil(auditsForPagination.length / ITEMS_PER_PAGE)
  const paginatedAudits = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return auditsForPagination.slice(start, start + ITEMS_PER_PAGE)
  }, [auditsForPagination, currentPage, ITEMS_PER_PAGE])

  // Reset to page 1 when filter/search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filter, searchQuery, sortBy])

  const _completionPercent = stats.totalAudited > 0 ? Math.round((stats.readyCount / stats.totalAudited) * 100) : 0

  return (
    <>
      <div
        className="dashboard-scroll"
        style={{
          flex: 1,
          background: "#fafbfc",
          display: "flex",
          flexDirection: "column",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif",
          height: "100%",
          maxHeight: "100%",
          overflow: "hidden",
        }}
      >
        {/* Main Content - 2 Column Layout */}
        <div
          className="dashboard-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 340px",
            gridTemplateRows: "1fr",
            gap: "24px",
            padding: "24px 32px 32px",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* Left: Products Table */}
          <div
            data-tour-products-table
            style={{
              background: "#fff",
              border: "1px solid #e4e4e7",
              borderRadius: "12px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minHeight: 0,
              height: "100%",
            }}
          >
            {/* Card Header with Title, Search, Sync */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid #e4e4e7",
                background: "#fff",
                flexShrink: 0,
              }}
            >
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#252F2C",
                  margin: 0,
                }}
              >
                Products
              </h2>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {/* Search */}
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: "160px",
                      padding: "6px 10px 6px 32px",
                      fontSize: "13px",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      outline: "none",
                      background: "#fff",
                      color: "#252F2C",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#c4c4c7"
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e4e4e7"
                    }}
                  />
                  <svg
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#a1a1aa"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>

                {/* Sort Dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 10px",
                      fontSize: "13px",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      outline: "none",
                      background: "#fff",
                      color: "#252F2C",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#c4c4c7"
                      e.currentTarget.style.background = "#fafafa"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e4e4e7"
                      e.currentTarget.style.background = "#fff"
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.586a1 1 0 0 1-.293.707l-6.414 6.414a1 1 0 0 0-.293.707V17l-4 4v-6.586a1 1 0 0 0-.293-.707L3.293 7.293A1 1 0 0 1 3 6.586V4z" />
                    </svg>
                    Sort
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* Sort Dropdown Menu */}
                  {showSortDropdown && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: "4px",
                        background: "#fff",
                        border: "1px solid #e4e4e7",
                        borderRadius: "6px",
                        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
                        zIndex: 10,
                        minWidth: "180px",
                      }}
                      onMouseLeave={() => setShowSortDropdown(false)}
                    >
                      {[
                        { value: "most-fixes", label: "Most Fixes Needed" },
                        { value: "least-fixes", label: "Least Fixes Needed" },
                        { value: "highest-score", label: "Highest Score" },
                        { value: "lowest-score", label: "Lowest Score" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSortBy(option.value as any)
                            setShowSortDropdown(false)
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            width: "100%",
                            padding: "10px 12px",
                            border: "none",
                            background: sortBy === option.value ? "#f0f9ff" : "transparent",
                            color: sortBy === option.value ? "#0c4a6e" : "#252F2C",
                            cursor: "pointer",
                            fontSize: "13px",
                            textAlign: "left",
                            transition: "background 0.15s",
                            borderRadius: 0,
                          }}
                          onMouseEnter={(e) => {
                            if (sortBy !== option.value) {
                              e.currentTarget.style.background = "#f5f5f5"
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = sortBy === option.value ? "#f0f9ff" : "transparent"
                          }}
                        >
                          {sortBy === option.value && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                          {sortBy !== option.value && <div style={{ width: "14px" }} />}
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Collapse All Button */}
                {expandedRows.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedRows(new Set())}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "6px 12px",
                      background: "transparent",
                      color: "#52525b",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#fafafa"
                      e.currentTarget.style.borderColor = "#c4c4c7"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                      e.currentTarget.style.borderColor = "#e4e4e7"
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                    Collapse All
                  </button>
                )}

                {/* Sync Button */}
                <button
                  type="button"
                  data-tour-sync-button
                  onClick={() => {
                    setIsScanning(true)
                    fetcher.submit({ intent: "scan_all" }, { method: "POST" })
                  }}
                  disabled={isScanning}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "6px 12px",
                    background: "#465A54",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: isScanning ? "not-allowed" : "pointer",
                    transition: "background 0.15s",
                    opacity: isScanning ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isScanning) e.currentTarget.style.background = "#3d4e49"
                  }}
                  onMouseLeave={(e) => {
                    if (!isScanning) e.currentTarget.style.background = "#465A54"
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  {isScanning ? "Syncing..." : "Sync"}
                </button>

                {/* Remove Button - Shows when items selected */}
                {selectedProducts.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove ${selectedProducts.size} product(s) from the synced list? (Products will not be deleted)`)) {
                        selectedProducts.forEach((productId) => {
                          autofixFetcher.submit(
                            { productId },
                            { method: "POST", action: "/api/audit/remove" }
                          )
                        })
                        clearSelection()
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "6px 12px",
                      background: "#fef2f2",
                      color: "#b53d3d",
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#fee2e2"
                      e.currentTarget.style.borderColor = "#fca5a5"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fef2f2"
                      e.currentTarget.style.borderColor = "#fecaca"
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h12zM10 11v6M14 11v6" />
                    </svg>
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Table Column Headers */}
            <div
              className="products-table-header"
              style={{
                display: "grid",
                gap: "12px",
                padding: "10px 20px",
                borderBottom: "1px solid #e4e4e7",
                background: "#fafafa",
                flexShrink: 0,
              }}
            >
              <div className="col-expand" />
              <div className="col-checkbox" style={{ display: "flex", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selectedProducts.size > 0 && selectedProducts.size === paginatedAudits.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      selectAllVisible()
                    } else {
                      clearSelection()
                    }
                  }}
                  style={{
                    width: "15px",
                    height: "15px",
                    cursor: "pointer",
                    accentColor: "#465A54",
                  }}
                />
              </div>
              <div
                className="col-product"
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#8B8B8B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Product
              </div>
              <div
                className="col-status"
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#8B8B8B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Status
              </div>
              <div
                className="col-score"
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#8B8B8B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Score
              </div>
              <div
                className="col-issues"
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#8B8B8B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  textAlign: "right",
                }}
              >
                Issues
              </div>
            </div>

            {/* Table Rows */}
            <div
              className="products-list-container"
              style={{
                flex: 1,
                overflow: "auto",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {paginatedAudits.length === 0 && !isTourOpen ? (
                <div
                  style={{
                    padding: "80px 20px",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ marginBottom: "12px" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d4d4d8" strokeWidth="1.5">
                      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p style={{ color: "#71717a", fontSize: "14px", margin: 0 }}>No products found</p>
                  <p
                    style={{
                      color: "#a1a1aa",
                      fontSize: "13px",
                      margin: "4px 0 0",
                    }}
                  >
                    Sync your catalog to get started
                  </p>
                </div>
              ) : (
                <div>
                  {paginatedAudits.map((audit, idx) => {
                    const progressPercent = Math.round((audit.passedCount / audit.totalCount) * 100)
                    const isSelected = selectedProducts.has(audit.productId)
                    const isExpanded = expandedRows.has(audit.id)
                    const isQueued = generatingProductIds.has(audit.productId)
                    const isProcessing = currentlyProcessingId === audit.productId
                    const isCompleted = completedProductIds.has(audit.productId)

                    return (
                      <div
                        key={audit.id}
                        style={{
                          borderBottom: idx < paginatedAudits.length - 1 ? "1px solid #f4f4f5" : "none",
                        }}
                      >
                        {/* Main Row */}
                        <div
                          className="products-table-row"
                          {...(idx === 0 ? { "data-tour-expand-row": true } : {})}
                          onClick={() => {
                            const newExpanded = new Set(expandedRows)
                            if (isExpanded) {
                              newExpanded.delete(audit.id)
                            } else {
                              newExpanded.add(audit.id)
                            }
                            setExpandedRows(newExpanded)
                          }}
                          style={{
                            display: "grid",
                            gap: "12px",
                            padding: "14px 20px",
                            cursor: "pointer",
                            transition: "background 0.1s",
                            background: isExpanded ? "#fafafa" : "transparent",
                          }}
                          onMouseEnter={(e) => {
                            if (!isExpanded) e.currentTarget.style.background = "#fafafa"
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded) e.currentTarget.style.background = "transparent"
                          }}
                        >
                          {/* Expand Arrow */}
                          <div
                            className="col-expand"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#a1a1aa"
                              strokeWidth="2"
                              style={{
                                transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                                transition: "transform 0.15s ease",
                              }}
                            >
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </div>

                          {/* Checkbox */}
                          <div
                            className="col-checkbox"
                            style={{ display: "flex", alignItems: "center" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleProductSelection(audit.productId)}
                              style={{
                                width: "15px",
                                height: "15px",
                                cursor: "pointer",
                                accentColor: "#18181b",
                              }}
                            />
                          </div>

                          {/* Product */}
                          <div
                            className="col-product"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              minWidth: 0,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              className="hide-on-tablet"
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "6px",
                                overflow: "hidden",
                                background: "#f4f4f5",
                                flexShrink: 0,
                                border: "1px solid #e4e4e7",
                              }}
                            >
                              {audit.productImage ? (
                                <img
                                  src={audit.productImage}
                                  alt=""
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "#d4d4d8",
                                  }}
                                >
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  >
                                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                minWidth: 0,
                                overflow: "hidden",
                                flex: 1,
                              }}
                            >
                              <span
                                className="product-title-text"
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 500,
                                  color: "#252F2C",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  fontFamily: "inherit",
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                {audit.productTitle}
                              </span>
                              {isProcessing && (
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                  <div
                                    style={{
                                      width: "14px",
                                      height: "14px",
                                      border: "2px solid #1f4fd8",
                                      borderRightColor: "transparent",
                                      borderRadius: "50%",
                                      animation: "spin 1s linear infinite",
                                    }}
                                  />
                                  <span style={{ fontSize: "11px", color: "#1f4fd8", fontWeight: 500 }}>
                                    Processing
                                  </span>
                                </div>
                              )}
                              {isQueued && !isProcessing && !isCompleted && (
                                <span style={{ fontSize: "11px", color: "#71717a", fontWeight: 500, flexShrink: 0 }}>
                                  Queued
                                </span>
                              )}
                              {isCompleted && isQueued && (
                                <span style={{ fontSize: "11px", color: "#059669", fontWeight: 500, flexShrink: 0 }}>
                                  Done
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Status */}
                          <div
                            className="col-status"
                            data-tour-status-score
                            style={{ display: "flex", alignItems: "center" }}
                          >
                            <span
                              className="status-badge"
                              style={{
                                padding: "3px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 500,
                                background: audit.status === "ready" ? "#ecfdf5" : "#fef9e7",
                                color: audit.status === "ready" ? "#059669" : "#8B7500",
                                border: audit.status === "ready" ? "1px solid #a7f3d0" : "1px solid #fde68a",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {audit.status === "ready" ? "Ready" : "Pending"}
                            </span>
                          </div>

                          {/* Score */}
                          <div
                            className="col-score"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                            }}
                          >
                            <div
                              className="hide-on-mobile"
                              style={{
                                flex: 1,
                                height: "8px",
                                background: "var(--color-surface-strong)",
                                borderRadius: "10px",
                                overflow: "hidden",
                                border: "1px solid var(--color-border-subtle)",
                              }}
                            >
                              <div
                                style={{
                                  width: `${progressPercent}%`,
                                  height: "100%",
                                  background:
                                    audit.status === "ready"
                                      ? "var(--color-success)"
                                      : progressPercent >= 70
                                        ? "var(--color-primary)"
                                        : "var(--color-accent)",
                                  borderRadius: "10px",
                                  transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: "12px",
                                fontWeight: 700,
                                color: "var(--color-text)",
                                minWidth: "36px",
                                textAlign: "right",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {progressPercent}%
                            </span>
                          </div>

                          {/* Issues + View Details */}
                          <div
                            className="col-issues"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "12px",
                                fontWeight: 500,
                                color: audit.failedCount > 0 ? "#B53D3D" : "#71717a",
                                background: audit.failedCount > 0 ? "#fef2f2" : "transparent",
                                padding: audit.failedCount > 0 ? "2px 8px" : "0",
                                borderRadius: "4px",
                              }}
                            >
                              {audit.failedCount}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/app/products/${audit.productId.split("/").pop()}`)
                              }}
                              className="view-details-btn"
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                fontWeight: 600,
                                background: "transparent",
                                border: "1px solid #e4e4e7",
                                borderRadius: "4px",
                                color: "#252F2C",
                                cursor: "pointer",
                                transition: "all 0.15s",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#f4f4f5"
                                e.currentTarget.style.borderColor = "#d4d4d8"
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent"
                                e.currentTarget.style.borderColor = "#e4e4e7"
                              }}
                            >
                              <span className="hide-tablet">View</span>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Expanded Content - Enhanced Analytics */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: "0 20px 20px 56px",
                              background: "#fafafa",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr",
                                gap: "16px",
                              }}
                            >
                              {/* Top Row: Quick Stats + Progress */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(4, 1fr)",
                                  gap: "12px",
                                }}
                              >
                                {/* Completion Rate */}
                                <div
                                  style={{
                                    padding: "12px",
                                    background: "#fff",
                                    borderRadius: "6px",
                                    border: "1px solid #e4e4e7",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 500,
                                      color: "#71717a",
                                      marginBottom: "4px",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                    }}
                                  >
                                    Completion
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: 600,
                                      color:
                                        progressPercent >= 90
                                          ? "#059669"
                                          : progressPercent >= 70
                                            ? "#465A54"
                                            : "#B53D3D",
                                    }}
                                  >
                                    {progressPercent}%
                                  </div>
                                </div>

                                {/* Critical Issues */}
                                <div
                                  style={{
                                    padding: "12px",
                                    background: "#fff",
                                    borderRadius: "6px",
                                    border: "1px solid #e4e4e7",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 500,
                                      color: "#71717a",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Issues
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: 600,
                                      color: audit.failedCount > 0 ? "#B53D3D" : "#059669",
                                    }}
                                  >
                                    {audit.failedCount}
                                  </div>
                                </div>

                                {/* Status Badge */}
                                <div
                                  style={{
                                    padding: "12px",
                                    background: "#fff",
                                    borderRadius: "6px",
                                    border: "1px solid #e4e4e7",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      color: "#71717a",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Status
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: "6px",
                                        height: "6px",
                                        borderRadius: "50%",
                                        background: audit.status === "ready" ? "#059669" : "#8B7500",
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        fontWeight: 500,
                                        color: audit.status === "ready" ? "#059669" : "#8B7500",
                                      }}
                                    >
                                      {audit.status === "ready" ? "Ready" : "Needs Work"}
                                    </span>
                                  </div>
                                </div>

                                {/* Last Updated */}
                                <div
                                  style={{
                                    padding: "12px",
                                    background: "#fff",
                                    borderRadius: "6px",
                                    border: "1px solid #e4e4e7",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      color: "#71717a",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    Last Checked
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "#252F2C",
                                      fontWeight: 500,
                                    }}
                                  >
                                    {new Date(audit.updatedAt).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </div>
                                </div>
                              </div>

                              {/* Bottom Row: Detailed Breakdown - Real Data Issues */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "2fr 1fr",
                                  gap: "16px",
                                }}
                              >
                                {/* Left: Issues List (Real Data) */}
                                <div
                                  style={{
                                    padding: "20px",
                                    background: "#fff",
                                    borderRadius: "8px",
                                    border: "1px solid #e4e4e7",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      color: "#71717a",
                                      marginBottom: "16px",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                    }}
                                  >
                                    Checklist Breakdown
                                  </div>

                                  {/* Items List */}
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "8px",
                                    }}
                                  >
                                    {/* Failed Items */}
                                    {audit.items && audit.items.filter((i: any) => i.status === "failed").length > 0 ? (
                                      <>
                                        {audit.items
                                          .filter((i: any) => i.status === "failed")
                                          .slice(0, 4)
                                          .map((item: any) => (
                                            <div
                                              key={item.id}
                                              style={{
                                                padding: "8px 10px",
                                                background: "#fef2f2",
                                                border: "1px solid #fed7d7",
                                                borderRadius: "5px",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                transition: "all 0.15s ease",
                                                cursor: "default",
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.background = "#fecaca"
                                                e.currentTarget.style.borderColor = "#fca5a5"
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.background = "#fef2f2"
                                                e.currentTarget.style.borderColor = "#fed7d7"
                                              }}
                                              title={item.details}
                                            >
                                              <svg
                                                width="12"
                                                height="12"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="#dc2626"
                                                strokeWidth="2.5"
                                                style={{ flexShrink: 0 }}
                                              >
                                                <circle cx="12" cy="12" r="10" />
                                                <path d="M12 8v4m0 4v.01" />
                                              </svg>
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div
                                                  style={{
                                                    fontSize: "11px",
                                                    fontWeight: 600,
                                                    color: "#7f1d1d",
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                  }}
                                                >
                                                  {item.label}
                                                </div>
                                              </div>
                                              {item.canAutoFix && (
                                                <div
                                                  style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "3px",
                                                    background: "#fca5a5",
                                                    padding: "2px 6px",
                                                    borderRadius: "10px",
                                                    flexShrink: 0,
                                                  }}
                                                >
                                                  <svg
                                                    width="8"
                                                    height="8"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="#7f1d1d"
                                                    strokeWidth="3"
                                                  >
                                                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                                  </svg>
                                                  <span
                                                    style={{
                                                      fontSize: "8px",
                                                      fontWeight: 700,
                                                      color: "#7f1d1d",
                                                      letterSpacing: "0.5px",
                                                    }}
                                                  >
                                                    FIX
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        {audit.items.filter((i: any) => i.status === "failed").length > 4 && (
                                          <div
                                            style={{
                                              padding: "6px 0",
                                              textAlign: "center",
                                              fontSize: "11px",
                                              color: "#a1a1aa",
                                              fontWeight: 500,
                                            }}
                                          >
                                            +{audit.items.filter((i: any) => i.status === "failed").length - 4} more
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div
                                        style={{
                                          fontSize: "var(--text-sm)",
                                          color: "#52525b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontWeight: 600,
                                            marginBottom: "4px",
                                          }}
                                        >
                                          All checks passed!
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "var(--text-xs)",
                                            opacity: 0.8,
                                          }}
                                        >
                                          This product is ready for launch.
                                        </div>
                                      </div>
                                    )}

                                    {audit.items &&
                                      audit.items.filter((i: any) => i.status === "passed").length > 0 && (
                                        <details
                                          style={{
                                            cursor: "pointer",
                                            marginTop: "8px",
                                          }}
                                        >
                                          <summary
                                            style={{
                                              fontSize: "11px",
                                              color: "#a1a1aa",
                                              fontWeight: 500,
                                              userSelect: "none",
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "5px",
                                              padding: "4px 0",
                                              transition: "color 0.15s ease",
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.color = "#71717a")}
                                            onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1aa")}
                                          >
                                            <svg
                                              width="10"
                                              height="10"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="3"
                                              style={{
                                                transition: "transform 0.3s ease",
                                                flexShrink: 0,
                                              }}
                                            >
                                              <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                            <span>
                                              {audit.items.filter((i: any) => i.status === "passed").length} passed
                                            </span>
                                          </summary>
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "1fr 1fr",
                                              gap: "6px",
                                              padding: "8px",
                                              background: "#fafafa",
                                              borderRadius: "5px",
                                              animation: "slideDown 0.3s ease",
                                            }}
                                          >
                                            {audit.items
                                              .filter((i: any) => i.status === "passed")
                                              .map((item: any) => (
                                                <div
                                                  key={item.id}
                                                  style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "5px",
                                                    fontSize: "10px",
                                                    color: "#52525b",
                                                  }}
                                                >
                                                  <div
                                                    style={{
                                                      color: "#059669",
                                                      flexShrink: 0,
                                                    }}
                                                  >
                                                    <svg
                                                      width="10"
                                                      height="10"
                                                      viewBox="0 0 24 24"
                                                      fill="none"
                                                      stroke="currentColor"
                                                      strokeWidth="3"
                                                    >
                                                      <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                  </div>
                                                  <span
                                                    style={{
                                                      whiteSpace: "nowrap",
                                                      overflow: "hidden",
                                                      textOverflow: "ellipsis",
                                                    }}
                                                  >
                                                    {item.label}
                                                  </span>
                                                </div>
                                              ))}
                                          </div>
                                        </details>
                                      )}
                                  </div>
                                </div>

                                {/* Right: Quick Actions Panel */}
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "12px",
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: "16px",
                                      background: "#fff",
                                      borderRadius: "8px",
                                      border: "1px solid #e4e4e7",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: 500,
                                        color: "#71717a",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                        marginBottom: "12px",
                                      }}
                                    >
                                      Quick Actions
                                    </div>
                                    <div
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr",
                                        gap: "8px",
                                      }}
                                    >
                                      {audit.failedCount > 0 ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const productIdShort = audit.productId.split("/").pop()
                                            setFixingProductId(audit.productId)
                                            autofixFetcher.submit(
                                              { intent: "fix_all" },
                                              { method: "POST", action: `/api/products/${productIdShort}/autofix` }
                                            )
                                          }}
                                          disabled={fixingProductId === audit.productId}
                                          style={{
                                            width: "100%",
                                            padding: "10px",
                                            background: "#fff",
                                            color: "#B53D3D",
                                            border: "1px solid #fecaca",
                                            borderRadius: "6px",
                                            fontSize: "var(--text-sm)",
                                            fontWeight: 500,
                                            cursor: fixingProductId === audit.productId ? "not-allowed" : "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            gap: "6px",
                                            transition: "all 0.15s",
                                            opacity: fixingProductId === audit.productId ? 0.6 : 1,
                                          }}
                                          onMouseEnter={(e) => {
                                            if (fixingProductId !== audit.productId)
                                              e.currentTarget.style.background = "#fef2f2"
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = "#fff"
                                          }}
                                        >
                                          {fixingProductId === audit.productId ? (
                                            <div
                                              style={{
                                                width: "14px",
                                                height: "14px",
                                                border: "2px solid #B53D3D",
                                                borderRightColor: "transparent",
                                                borderRadius: "50%",
                                                animation: "spin 1s linear infinite",
                                              }}
                                            />
                                          ) : (
                                            <svg
                                              width="14"
                                              height="14"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                            >
                                              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                            </svg>
                                          )}
                                          {fixingProductId === audit.productId ? "Fixing..." : "Fix"}
                                        </button>
                                      ) : (
                                        <div
                                          style={{
                                            padding: "10px",
                                            background: "#ecfdf5",
                                            border: "1px solid #d1fae5",
                                            borderRadius: "6px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "var(--text-sm)",
                                            fontWeight: 500,
                                            color: "#059669",
                                          }}
                                        >
                                          Ready
                                        </div>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          navigate("/app/settings?tab=version-history")
                                        }}
                                        style={{
                                          width: "100%",
                                          padding: "10px",
                                          background: "#fff",
                                          color: "#71717a",
                                          border: "1px solid #e4e4e7",
                                          borderRadius: "6px",
                                          fontSize: "var(--text-sm)",
                                          fontWeight: 500,
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          gap: "6px",
                                          transition: "all 0.15s",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = "#f4f4f5"
                                          e.currentTarget.style.borderColor = "#d4d4d8"
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = "#fff"
                                          e.currentTarget.style.borderColor = "#e4e4e7"
                                        }}
                                      >
                                        <svg
                                          width="14"
                                          height="14"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                        >
                                          <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                        </svg>
                                        History
                                      </button>
                                    </div>
                                  </div>

                                  {/* Insight Box */}
                                  <div
                                    style={{
                                      padding: "12px",
                                      background: "#f0f9ff",
                                      borderRadius: "6px",
                                      border: "1px solid #bae6fd",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#0369a1",
                                        lineHeight: 1.5,
                                      }}
                                    >
                                      <strong>Tip:</strong>{" "}
                                      {audit.failedCount > 0
                                        ? "Prioritize fixing 'Critical' issues like missing images or descriptions."
                                        : "Great job! Your product is fully optimized."}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 20px",
                  borderTop: "1px solid #e4e4e7",
                  background: "#fafafa",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: "13px", color: "#71717a" }}>
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, auditsForPagination.length)} of {auditsForPagination.length}
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{
                      padding: "6px 12px",
                      fontSize: "13px",
                      fontWeight: 500,
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      background: "#fff",
                      color: currentPage === 1 ? "#a1a1aa" : "#252F2C",
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{
                      padding: "6px 12px",
                      fontSize: "13px",
                      fontWeight: 500,
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      background: "#fff",
                      color: currentPage === totalPages ? "#a1a1aa" : "#252F2C",
                      cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Catalog Score Card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              overflow: "auto",
              minHeight: 0,
              height: "100%",
            }}
          >
              {/* Overall Score Card */}
              <div
                style={{
                  position: "relative",
                  background: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: "12px",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: 500,
                    color: "#71717a",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    marginBottom: "20px",
                  }}
                >
                  Products Health
                </div>

                {/* Circular Progress Container */}
                <div
                  onClick={() => animatedPercent === 100 && setShowCelebrationModal(true)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "16px",
                    cursor: animatedPercent === 100 ? "pointer" : "default",
                  }}
                >
                  <CircularProgress 
                    percent={animatedPercent} 
                    size={160} 
                    strokeWidth={12}
                    color={animatedPercent >= 80 ? "var(--color-success)" : animatedPercent >= 60 ? "var(--color-primary)" : "var(--color-error)"}
                  />

                  {/* Label outside the circle */}
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--color-muted)",
                        fontWeight: 600,
                      }}
                    >
                      {stats.totalAudited > 0
                        ? `${stats.readyCount} of ${stats.totalAudited} products ready`
                        : "No products synced yet"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    width: "100%",
                    marginTop: "24px",
                    paddingTop: "20px",
                    borderTop: "1px solid var(--color-border-subtle)",
                  }}
                >
                  {[
                    {
                      label: "Ready",
                      value: stats.readyCount,
                      color: "var(--color-success)",
                    },
                    {
                      label: "Pending",
                      value: stats.incompleteCount,
                      color: "var(--color-accent-strong)",
                    },
                    {
                      label: "Avg. Score",
                      value: `${stats.avgCompletion}%`,
                      color: "var(--color-primary)",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--color-subtle)",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color: item.color,
                        }}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        {selectedProducts.size > 0 && (
          <div
            style={{
              position: "fixed",
              bottom: "32px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
            }}
          >
            <div
              data-tour-bulk-actions
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 20px",
                background: "#fff",
                backdropFilter: "blur(16px)",
                borderRadius: "10px",
                border: "1px solid #e4e4e7",
                boxShadow: "0 10px 24px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.1)",
              }}
            >
              {/* Selection count */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  paddingRight: "12px",
                  borderRight: "1px solid #e4e4e7",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: "#465A54",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {selectedProducts.size}
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#252F2C",
                  }}
                >
                  selected
                </span>
              </div>

              {/* Action buttons */}
              {isGeneratingBulk ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 16px",
                    background: "#465A54",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  <div
                    style={{
                      width: "14px",
                      height: "14px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  Processing...
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => executeBulkAction("generate_tags")}
                    style={{
                      padding: "8px 16px",
                      background: "#465A54",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#fff",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#3d4e49"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#465A54"
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    Tags
                  </button>

                  <button
                    type="button"
                    onClick={() => executeBulkAction("apply_collection")}
                    style={{
                      padding: "8px 16px",
                      background: "transparent",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#252F2C",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f4f4f5"
                      e.currentTarget.style.borderColor = "#d4d4d8"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                      e.currentTarget.style.borderColor = "#e4e4e7"
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </svg>
                    Collection
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Check which products have 3+ images already
                      const selectedProductIds = Array.from(selectedProducts)
                      const skipped: string[] = []
                      const eligible: string[] = []

                      for (const productId of selectedProductIds) {
                        const audit = audits.find((a) => a.productId === productId)
                        // Check min_images item details to extract current image count
                        const imageItem = audit?.items?.find((i) => i.key === "min_images")
                        let imageCount = 0
                        if (imageItem?.details) {
                          // Parse "Found X image(s)" from details
                          const match = imageItem.details.match(/Found (\d+) image/)
                          if (match) {
                            imageCount = parseInt(match[1], 10)
                          }
                        }

                        if (imageCount >= 3) {
                          skipped.push(audit?.productTitle || productId)
                        } else {
                          eligible.push(productId)
                        }
                      }

                      if (skipped.length > 0) {
                        setSkippedImageProducts(skipped)
                        setEligibleImageProductIds(eligible)
                        setShowImageAlert(true)
                      } else if (eligible.length > 0) {
                        // All products eligible, proceed directly
                        executeBulkAction("generate_all", {
                          selectedFields: [],
                          fieldOptions: { images: ["image"] },
                        })
                      }
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "transparent",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#252F2C",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f4f4f5"
                      e.currentTarget.style.borderColor = "#d4d4d8"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                      e.currentTarget.style.borderColor = "#e4e4e7"
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    Images
                  </button>

                  <button
                    type="button"
                    onClick={() => executeBulkAction("generate_seo_desc")}
                    style={{
                      padding: "8px 16px",
                      background: "transparent",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#252F2C",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f4f4f5"
                      e.currentTarget.style.borderColor = "#d4d4d8"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                      e.currentTarget.style.borderColor = "#e4e4e7"
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    SEO
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      // Check which products are already 100% ready
                      const selectedProductIds = Array.from(selectedProducts)
                      const skipped: string[] = []
                      const eligible: string[] = []

                      for (const productId of selectedProductIds) {
                        const audit = audits.find((a) => a.productId === productId)
                        if (audit?.status === "ready") {
                          skipped.push(audit.productTitle)
                        } else {
                          eligible.push(productId)
                        }
                      }

                      if (skipped.length > 0 && eligible.length > 0) {
                        // Some ready, some need fixing - show alert
                        setSkippedAutofixProducts(skipped)
                        setEligibleAutofixProductIds(eligible)
                        setShowAutofixAlert(true)
                      } else if (skipped.length > 0 && eligible.length === 0) {
                        // All already ready
                        shopify.toast.show("All selected products are already 100% ready!")
                      } else if (eligible.length > 0) {
                        // All need fixing, proceed directly
                        runAutofixOnProducts(eligible)
                      }
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "transparent",
                      border: "1px solid #e4e4e7",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#252F2C",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f4f4f5"
                      e.currentTarget.style.borderColor = "#d4d4d8"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                      e.currentTarget.style.borderColor = "#e4e4e7"
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                    Autofix
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowGenerateAllModal(true)}
                    style={{
                      padding: "8px 16px",
                      background: "#465A54",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#fff",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#3d4e49"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#465A54"
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Generate All
                  </button>
                </>
              )}

              {/* Close/Clear Button */}
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  width: "32px",
                  height: "32px",
                  padding: 0,
                  background: "transparent",
                  border: "1px solid #e4e4e7",
                  borderRadius: "6px",
                  color: "#8B8B8B",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f4f4f5"
                  e.currentTarget.style.borderColor = "#d4d4d8"
                  e.currentTarget.style.color = "#252F2C"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.borderColor = "#e4e4e7"
                  e.currentTarget.style.color = "#8B8B8B"
                }}
                title="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Monitoring Modal (Pro only) */}
        {showMonitoringModal && monitoring && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowMonitoringModal(false) }}>

            <div
              className="animate-fade-in-up"
              style={{
                background: "var(--color-surface)",
                borderRadius: "var(--radius-xl)",
                width: "100%",
                maxWidth: "600px",
                maxHeight: "80vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: "24px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: "var(--text-xl)",
                      fontWeight: 600,
                      margin: 0,
                      color: "var(--color-text)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Catalog Monitor
                  </h2>
                  <p
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--color-muted)",
                      margin: "4px 0 0",
                    }}
                  >
                    Last 7 days compliance overview
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMonitoringModal(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px",
                    color: "var(--color-muted)",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
                {/* Summary Cards */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "12px",
                    marginBottom: "24px",
                  }}
                >
                  <div
                    style={{
                      padding: "16px",
                      background: "var(--color-surface-secondary)",
                      borderRadius: "var(--radius-md)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      {monitoring.driftsThisWeek}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Drifts This Week
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "16px",
                      background:
                        monitoring.unresolvedDrifts > 0 ? "var(--color-warning-soft)" : "var(--color-success-soft)",
                      borderRadius: "var(--radius-md)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 600,
                        color: monitoring.unresolvedDrifts > 0 ? "var(--color-warning)" : "var(--color-success)",
                      }}
                    >
                      {monitoring.unresolvedDrifts}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Unresolved
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "16px",
                      background: "var(--color-surface-secondary)",
                      borderRadius: "var(--radius-md)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      {monitoring.productsAffected}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      Products Affected
                    </div>
                  </div>
                </div>

                {/* Issues by Type */}
                {Object.keys(monitoring.byType).length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h3
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        marginBottom: "12px",
                      }}
                    >
                      Issues by Type
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {Object.entries(monitoring.byType).map(([type, count]) => (
                        <div
                          key={type}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 14px",
                            background: "var(--color-surface-secondary)",
                            borderRadius: "var(--radius-sm)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "13px",
                              color: "var(--color-text)",
                            }}
                          >
                            {type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--color-warning)",
                              background: "var(--color-warning-soft)",
                              padding: "2px 8px",
                              borderRadius: "var(--radius-full)",
                            }}
                          >
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Drifts */}
                {monitoring.recentDrifts.length > 0 && (
                  <div>
                    <h3
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        marginBottom: "12px",
                      }}
                    >
                      Recent Issues
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {monitoring.recentDrifts.slice(0, 5).map((drift) => (
                        <button
                          key={drift.id}
                          type="button"
                          onClick={() => {
                            setShowMonitoringModal(false)
                            const numericId = drift.productId.split("/").pop()
                            navigate(`/app/products/${numericId}`)
                          }}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px 14px",
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-sm)",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: 500,
                                color: "var(--color-text)",
                              }}
                            >
                              {drift.productTitle}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--color-muted)",
                              }}
                            >
                              {drift.driftType.replace(/_/g, " ")}
                            </div>
                          </div>
                          <div
                            style={{
                              padding: "4px 8px",
                              borderRadius: "var(--radius-full)",
                              fontSize: "10px",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              background:
                                drift.severity === "high"
                                  ? "var(--color-danger-soft)"
                                  : drift.severity === "medium"
                                    ? "var(--color-warning-soft)"
                                    : "var(--color-surface-strong)",
                              color:
                                drift.severity === "high"
                                  ? "var(--color-danger)"
                                  : drift.severity === "medium"
                                    ? "var(--color-warning)"
                                    : "var(--color-muted)",
                            }}
                          >
                            {drift.severity}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {monitoring.driftsThisWeek === 0 && (
                  <div style={{ textAlign: "center", padding: "32px" }}>
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "50%",
                        background: "var(--color-success-soft)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px",
                      }}
                    >
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-success)"
                        strokeWidth="2"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: 600,
                        marginBottom: "8px",
                      }}
                    >
                      All Clear!
                    </h3>
                    <p style={{ fontSize: "13px", color: "var(--color-muted)" }}>
                      No compliance drifts detected in the last 7 days.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: "20px 24px",
                  borderTop: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                }}
              >
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => navigate("/app/standards")}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    Manage Standards
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMonitoringModal(false)
                      navigate("/app/monitoring")
                    }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: "var(--color-primary)",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    View Full Report
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMonitoringModal(false)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: "var(--color-text)",
                    color: "var(--color-surface)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Tour */}
        <DashboardTour isOpen={isTourOpen} onClose={completeTour} />

        {/* Bulk Progress Modal */}
      <BulkProgressModal
        isOpen={showBulkProgressModal}
        actionType={bulkActionType}
        totalCount={generatingProductIds.size}
        completedCount={completedProductIds.size}
        currentProductTitle={
          currentlyProcessingId
            ? audits.find((a) => a.productId === currentlyProcessingId)?.productTitle || "Processing..."
            : null
        }
        onStop={stopBulkAction}
      />

      {/* Image Generation Alert Dialog */}
      {showImageAlert && (
        <div className="modal-backdrop">
          <div className="modal-container" style={{ width: "min(480px, 90%)", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#fef3c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#111827" }}>
                  Some products will be skipped
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
                  {skippedImageProducts.length} product{skippedImageProducts.length !== 1 ? "s have" : " has"} 3+ images
                  already
                </p>
              </div>
            </div>

            <div
              style={{
                background: "#f9fafb",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
                maxHeight: "150px",
                overflow: "auto",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#6b7280",
                  textTransform: "uppercase",
                }}
              >
                Will be skipped:
              </p>
              <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: "13px", color: "#374151" }}>
                {skippedImageProducts.map((name, i) => (
                  <li key={i} style={{ marginBottom: "4px" }}>
                    {name}
                  </li>
                ))}
              </ul>
            </div>

            <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 20px" }}>
              To generate more images for these products, go to each product's detail page.
            </p>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowImageAlert(false)
                  setSkippedImageProducts([])
                  setEligibleImageProductIds([])
                }}
                style={{
                  padding: "10px 16px",
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              {eligibleImageProductIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowImageAlert(false)
                    // Update selected products to only eligible ones
                    setSelectedProducts(new Set(eligibleImageProductIds))
                    executeBulkAction("generate_all", {
                      selectedFields: [],
                      fieldOptions: { images: ["image"] },
                    })
                    setSkippedImageProducts([])
                    setEligibleImageProductIds([])
                  }}
                  style={{
                    padding: "10px 16px",
                    background: "#465A54",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Continue with {eligibleImageProductIds.length} product
                  {eligibleImageProductIds.length !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Autofix Alert Dialog */}
      {showAutofixAlert && (
        <div className="modal-backdrop">
          <div className="modal-container" style={{ width: "min(480px, 90%)", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "#d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#111827" }}>
                  Some products already ready
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
                  {skippedAutofixProducts.length} product{skippedAutofixProducts.length !== 1 ? "s are" : " is"} already
                  at 100%
                </p>
              </div>
            </div>

            <div
              style={{
                background: "#f0fdf4",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
                maxHeight: "150px",
                overflow: "auto",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#059669",
                  textTransform: "uppercase",
                }}
              >
                Already ready (will skip):
              </p>
              <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: "13px", color: "#374151" }}>
                {skippedAutofixProducts.map((name, i) => (
                  <li key={i} style={{ marginBottom: "4px" }}>
                    {name}
                  </li>
                ))}
              </ul>
            </div>

            <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 20px" }}>
              These products don't need autofix. Only products with issues will be processed.
            </p>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowAutofixAlert(false)
                  setSkippedAutofixProducts([])
                  setEligibleAutofixProductIds([])
                }}
                style={{
                  padding: "10px 16px",
                  background: "#f3f4f6",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAutofixAlert(false)
                  runAutofixOnProducts(eligibleAutofixProductIds)
                  setSkippedAutofixProducts([])
                  setEligibleAutofixProductIds([])
                }}
                style={{
                  padding: "10px 16px",
                  background: "#465A54",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Autofix {eligibleAutofixProductIds.length} product{eligibleAutofixProductIds.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Generate All Modal - Outside main container to avoid overflow clipping */}
      <BulkGenerateAllModal
        isOpen={showGenerateAllModal}
        onClose={() => {
          setShowGenerateAllModal(false)
        }}
        selectedFields={selectedBulkFields}
        onFieldToggle={(field) => {
          setSelectedBulkFields((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]))
        }}
        onGenerate={() => {
          const hasFieldOptions = Object.values(bulkFieldOptions).some((options) => options.length > 0)
          if (selectedBulkFields.length === 0 && !hasFieldOptions) return
          setIsGeneratingBulk(true)
          executeBulkAction("generate_all", {
            selectedFields: selectedBulkFields,
            fieldOptions: bulkFieldOptions,
          })
          setShowGenerateAllModal(false)
        }}
        isGenerating={isGeneratingBulk}
        fieldOptions={bulkFieldOptions}
        setFieldOptions={setBulkFieldOptions}
      />

      {/* 100% Celebration Modal */}
      {showCelebrationModal && (
        <div 
          className="modal-backdrop" 
          onClick={() => setShowCelebrationModal(false)}
          style={{ 
            zIndex: 10005,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(8px)"
          }}
        >
          <div 
            className="modal-container" 
            style={{ 
              maxWidth: "400px", 
              padding: "40px 32px", 
              textAlign: "center", 
              background: "var(--color-surface)",
              borderRadius: "12px",
              border: "1px solid var(--color-border-subtle)",
              boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.12)",
              animation: "celebrationPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "16px",
                background: "var(--color-success-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "var(--color-success)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            <h2 style={{ margin: "0 0 8px", fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 700, color: "var(--color-text)", letterSpacing: "-0.02em" }}>
              You did it!
            </h2>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--color-success)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              100% Product Health
            </p>
            <p style={{ margin: "0 0 32px", fontSize: "15px", color: "var(--color-muted)", lineHeight: 1.6 }}>
              All your products are launch-ready. Your catalog is in perfect shape.
            </p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button
                type="button"
                onClick={() => setShowCelebrationModal(false)}
                style={{
                  padding: "14px 24px",
                  background: "var(--color-text)",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  width: "100%",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)"
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)"
                  e.currentTarget.style.opacity = "0.9"
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = "translateY(0)"
                  e.currentTarget.style.opacity = "1"
                }}
              >
                Awesome
              </button>
              
              {isPro && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCelebrationModal(false)
                    navigate("/app/monitoring")
                  }}
                  style={{
                    padding: "14px 24px",
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = "var(--color-surface-strong)"
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  View Monitoring
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes celebrationPop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  )
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs)
}
