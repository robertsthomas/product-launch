import { extension } from "@shopify/ui-extensions/admin"

const TARGET = "admin.product-details.block.render"

export default extension(TARGET, (root, { i18n, data }) => {
  let score = null
  let auditDetails = null
  let loading = true

  const productId = data?.selected?.[0]?.id
  const numericProductId = productId ? productId.split("/").pop() : null

  function updateUI() {
    root.removeChildren()

    const adminBlock = root.createComponent("AdminBlock")

    function getScoreTone(scoreValue) {
      if (scoreValue >= 80) return "success"
      if (scoreValue >= 60) return "warning"
      return "critical"
    }

    function getScoreLabel(scoreValue) {
      if (scoreValue >= 80) return i18n.translate("excellent")
      if (scoreValue >= 60) return i18n.translate("good")
      return i18n.translate("needsWork")
    }

    function getScoreIcon(scoreValue) {
      if (scoreValue >= 80) return "StatusActiveMajor"
      if (scoreValue >= 60) return "RiskMinor"
      return "AlertMinor"
    }

    const collapsedSummary = score !== null ? `${score}/100 · ${getScoreLabel(score)}` : i18n.translate("notScored")

    adminBlock.updateProps({ collapsedSummary })

    if (loading) {
      const inlineStack = root.createComponent("InlineStack", {
        gap: "base",
        blockAlignment: "center",
      })
      inlineStack.appendChild(root.createComponent("ProgressIndicator", { size: "small" }))
      inlineStack.appendChild(
        root.createComponent(
          "Text",
          {
            appearance: "subdued",
          },
          i18n.translate("loadingScore")
        )
      )

      adminBlock.appendChild(inlineStack)
      root.appendChild(adminBlock)
      return
    }

    const blockStack = root.createComponent("BlockStack", { gap: "large" })

    if (score !== null) {
      // Score Header
      const headerStack = root.createComponent("InlineStack", {
        gap: "base",
        blockAlignment: "center",
      })
      headerStack.appendChild(root.createComponent("Icon", { name: getScoreIcon(score) }))
      headerStack.appendChild(
        root.createComponent(
          "Text",
          {
            fontWeight: "bold",
            size: "large",
          },
          `${score}/100`
        )
      )
      headerStack.appendChild(
        root.createComponent(
          "Badge",
          {
            tone: getScoreTone(score),
          },
          getScoreLabel(score)
        )
      )

      blockStack.appendChild(headerStack)

      // Quick Stats
      if (auditDetails) {
        const statsStack = root.createComponent("InlineStack", {
          gap: "extraLoose",
          blockAlignment: "start",
        })

        const passedStack = root.createComponent("BlockStack", { gap: "extraTight" })
        passedStack.appendChild(
          root.createComponent(
            "Text",
            {
              fontWeight: "bold",
              tone: "success",
            },
            auditDetails.passedCount.toString()
          )
        )
        passedStack.appendChild(
          root.createComponent(
            "Text",
            {
              appearance: "subdued",
              size: "small",
            },
            i18n.translate("passed")
          )
        )
        statsStack.appendChild(passedStack)

        const failedStack = root.createComponent("BlockStack", { gap: "extraTight" })
        failedStack.appendChild(
          root.createComponent(
            "Text",
            {
              fontWeight: "bold",
              tone: "critical",
            },
            auditDetails.failedCount.toString()
          )
        )
        failedStack.appendChild(
          root.createComponent(
            "Text",
            {
              appearance: "subdued",
              size: "small",
            },
            i18n.translate("issues")
          )
        )
        statsStack.appendChild(failedStack)

        const totalStack = root.createComponent("BlockStack", { gap: "extraTight" })
        totalStack.appendChild(
          root.createComponent(
            "Text",
            {
              fontWeight: "bold",
            },
            auditDetails.totalCount.toString()
          )
        )
        totalStack.appendChild(
          root.createComponent(
            "Text",
            {
              appearance: "subdued",
              size: "small",
            },
            i18n.translate("total")
          )
        )
        statsStack.appendChild(totalStack)

        blockStack.appendChild(statsStack)
      }

      blockStack.appendChild(root.createComponent("Divider"))

      // Action Button
      const button = root.createComponent(
        "Button",
        {
          href: numericProductId ? `/apps/product-launch/app/products/${numericProductId}` : "/apps/product-launch",
        },
        i18n.translate("viewDetails")
      )
      blockStack.appendChild(button)
    } else {
      // Empty State
      const emptyStack = root.createComponent("BlockStack", { gap: "base" })

      const emptyHeaderStack = root.createComponent("InlineStack", {
        gap: "base",
        blockAlignment: "center",
      })
      emptyHeaderStack.appendChild(root.createComponent("Icon", { name: "ListMajor" }))
      emptyHeaderStack.appendChild(
        root.createComponent(
          "Text",
          {
            fontWeight: "bold",
          },
          i18n.translate("noScoreTitle")
        )
      )
      emptyStack.appendChild(emptyHeaderStack)

      emptyStack.appendChild(
        root.createComponent(
          "Text",
          {
            appearance: "subdued",
          },
          i18n.translate("noScoreDescription")
        )
      )

      blockStack.appendChild(emptyStack)

      const runAuditButton = root.createComponent(
        "Button",
        {
          href: numericProductId ? `/apps/product-launch/app/products/${numericProductId}` : "/apps/product-launch",
          variant: "primary",
        },
        i18n.translate("runAudit")
      )
      blockStack.appendChild(runAuditButton)
    }

    adminBlock.appendChild(blockStack)
    root.appendChild(adminBlock)
  }

  async function fetchProductScore() {
    if (!productId) {
      loading = false
      updateUI()
      return
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
          variables: { id: productId },
        }),
      })

      const result = await response.json()

      if (result.data?.product?.audit?.jsonValue) {
        auditDetails = result.data.product.audit.jsonValue

        if (auditDetails.totalCount > 0) {
          score = Math.round((auditDetails.passedCount / auditDetails.totalCount) * 100)
        }
      }
    } catch (error) {
      console.error("Failed to fetch product score:", error)
    } finally {
      loading = false
      updateUI()
    }
  }

  fetchProductScore()
})
