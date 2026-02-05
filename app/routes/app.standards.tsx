import { useState } from "react"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import { useFetcher, useLoaderData, useNavigate } from "react-router"
import { getShopPlanStatus } from "../lib/billing/guards.server"
import {
  applyRuleTemplate,
  createCatalogRule,
  deleteCatalogRule,
  getCatalogRules,
  toggleCatalogRule,
  updateCatalogRule,
} from "../lib/services/rules.server"
import { RULE_DEFINITIONS, RULE_TEMPLATES } from "../lib/services/rules.types"
import { authenticate } from "../shopify.server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = session.shop

  // Check Pro plan
  const { plan } = await getShopPlanStatus(shop)

  if (plan !== "pro") {
    return { plan, rules: [], templates: RULE_TEMPLATES, isPro: false }
  }

  const rules = await getCatalogRules(shop)

  return { plan, rules, templates: RULE_TEMPLATES, isPro: true }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request)
  const shop = session.shop
  const formData = await request.formData()
  const intent = formData.get("intent") as string

  const { plan } = await getShopPlanStatus(shop)
  if (plan !== "pro") {
    return Response.json({ error: "Pro plan required" }, { status: 403 })
  }

  if (intent === "create") {
    const name = formData.get("name") as string
    const ruleType = formData.get("ruleType") as string
    const config = JSON.parse((formData.get("config") as string) || "{}")
    const severity = (formData.get("severity") || "medium") as string

    const rule = await createCatalogRule(shop, {
      name,
      description: formData.get("description") as string,
      ruleType: ruleType as any,
      configJson: JSON.stringify(config),
      severity: severity as "low" | "medium" | "high",
      isEnabled: true,
      appliesToAll: true,
    })

    return Response.json({ success: true, rule })
  }

  if (intent === "update") {
    const ruleId = formData.get("ruleId") as string
    const updates: any = {}

    const name = formData.get("name")
    if (name) updates.name = name

    const config = formData.get("config")
    if (config) updates.configJson = config

    const severity = formData.get("severity")
    if (severity) updates.severity = severity

    const rule = await updateCatalogRule(ruleId, updates)
    return Response.json({ success: true, rule })
  }

  if (intent === "delete") {
    const ruleId = formData.get("ruleId") as string
    await deleteCatalogRule(ruleId)
    return Response.json({ success: true })
  }

  if (intent === "toggle") {
    const ruleId = formData.get("ruleId") as string
    const enabled = formData.get("enabled") === "true"
    await toggleCatalogRule(ruleId, enabled)
    return Response.json({ success: true })
  }

  if (intent === "applyTemplate") {
    const templateKey = formData.get("templateKey") as keyof typeof RULE_TEMPLATES
    const rules = await applyRuleTemplate(shop, templateKey)
    return Response.json({ success: true, rules })
  }

  if (intent === "clearAll") {
    const allRules = await getCatalogRules(shop)
    for (const rule of allRules) {
      await deleteCatalogRule(rule.id)
    }
    return Response.json({ success: true })
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 })
}

export default function CatalogStandardsPage() {
  const { rules, templates, isPro } = useLoaderData<typeof loader>()
  const fetcher = useFetcher()
  const navigate = useNavigate()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    ruleType: "min_images",
    config: { min: 6 },
    severity: "medium" as "low" | "medium" | "high",
  })
  const [showGuide, setShowGuide] = useState(true)

  // Show upgrade prompt for Free users
  if (!isPro) {
    return (
      <div className="max-w-[600px] mx-auto my-15 p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center mx-auto mb-6">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold mb-3">Catalog Standards</h1>
        <p className="text-muted text-sm mb-6 leading-relaxed">
          Define store-wide rules to ensure your products stay compliant. Set requirements for images, SEO, tags, and
          more — then let LaunchReady automatically monitor your catalog.
        </p>

        <div className="bg-surface-secondary rounded-lg p-6 mb-6 text-left">
          <h3 className="text-sm font-semibold mb-4">With Pro you can:</h3>
          <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
            {[
              "Set minimum image requirements per product",
              "Enforce SEO title and description length limits",
              "Require alt text on all images",
              "Mandate specific tags or tag groups",
              "Get automatic compliance monitoring",
              "Receive alerts when products drift out of compliance",
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-2.5 text-xs text-text">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-success"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => navigate("/app/plans")}
          className="px-8 py-3.5 rounded-full border-none bg-gradient-primary text-white text-sm font-semibold cursor-pointer shadow-primary-glow"
        >
          Upgrade to Pro — $19/mo
        </button>
        <p className="text-xs text-muted mt-3">7-day free trial • Cancel anytime</p>
      </div>
    )
  }

  const handleCreateRule = () => {
    const formDataObj = new FormData()
    formDataObj.append("intent", "create")
    formDataObj.append("name", formData.name)
    formDataObj.append("description", formData.description)
    formDataObj.append("ruleType", formData.ruleType)
    formDataObj.append("config", JSON.stringify(formData.config))
    formDataObj.append("severity", formData.severity)

    fetcher.submit(formDataObj, { method: "post" })
    setShowCreateForm(false)
    setFormData({
      name: "",
      description: "",
      ruleType: "min_images",
      config: { min: 6 },
      severity: "medium",
    })
  }

  const handleApplyTemplate = (templateKey: keyof typeof RULE_TEMPLATES) => {
    const formDataObj = new FormData()
    formDataObj.append("intent", "applyTemplate")
    formDataObj.append("templateKey", templateKey)
    fetcher.submit(formDataObj, { method: "post" })
  }

  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    const formDataObj = new FormData()
    formDataObj.append("intent", "toggle")
    formDataObj.append("ruleId", ruleId)
    formDataObj.append("enabled", String(!enabled))
    fetcher.submit(formDataObj, { method: "post" })
  }

  const handleDeleteRule = (ruleId: string) => {
    if (confirm("Delete this rule?")) {
      const formDataObj = new FormData()
      formDataObj.append("intent", "delete")
      formDataObj.append("ruleId", ruleId)
      fetcher.submit(formDataObj, { method: "post" })
    }
  }

  const handleClearAllRules = () => {
    if (confirm("Delete all rules? This cannot be undone.")) {
      const formDataObj = new FormData()
      formDataObj.append("intent", "clearAll")
      fetcher.submit(formDataObj, { method: "post" })
    }
  }

  const definition = RULE_DEFINITIONS[formData.ruleType as keyof typeof RULE_DEFINITIONS]

  return (
    <div className="flex flex-col gap-0 min-h-full w-full bg-bg">
      <div className="max-w-[1000px] mx-auto py-8 px-8 w-full scrollbar-gutter-stable">
        {/* Page Header */}
        <div className="animate-fade-in-up flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-primary"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text m-0 font-heading tracking-tight">Catalog Standards</h1>
            <p className="text-sm text-muted m-0">Define store-wide rules to ensure product compliance</p>
          </div>
        </div>

        {/* How to Use Guide */}
        <div className="mb-8 bg-gradient-to-br from-white/60 to-slate-50/40 border border-slate-200/20 rounded-xl backdrop-blur-sm overflow-hidden transition-all duration-300 w-full shadow-sm">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="w-full p-5 bg-transparent border-none cursor-pointer flex items-center justify-between text-text hover:bg-white/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/40 flex items-center justify-center shadow-sm">
                <span className="text-base">💡</span>
              </div>
              <span className="text-base font-semibold">How to use Catalog Standards</span>
            </div>
            <div className={`text-muted transition-transform duration-300 ${showGuide ? "rotate-180" : "rotate-0"}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </button>

          {showGuide && (
            <div className="px-5 pb-5 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-white/90 rounded-lg border border-slate-200/30 shadow-sm">
                  <div className="text-sm font-semibold text-text mb-2 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    Set Your Rules
                  </div>
                  <p className="text-xs text-muted leading-relaxed mb-3">
                    Define what a "complete" product looks like for your store. You can start quickly with templates or
                    build custom rules.
                  </p>
                  <ul className="m-0 pl-4 text-xs text-text leading-relaxed space-y-1">
                    <li>
                      Use <strong>Templates</strong> for one-click industry standard setups
                    </li>
                    <li>
                      Create <strong>Custom Rules</strong> to enforce specific requirements
                    </li>
                    <li>
                      Set <strong>Severity</strong> to prioritize which issues need attention
                    </li>
                  </ul>
                </div>

                <div className="p-5 bg-white/90 rounded-lg border border-slate-200/30 shadow-sm">
                  <div className="text-sm font-semibold text-text mb-2 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    Automated Monitoring
                  </div>
                  <p className="text-xs text-muted leading-relaxed mb-3">
                    Once your rules are active, LaunchReady automatically audits your entire catalog in the background.
                  </p>
                  <ul className="m-0 pl-4 text-xs text-text leading-relaxed space-y-1">
                    <li>Products are scored (0-100) based on your active rules</li>
                    <li>View compliance status on the product detail page</li>
                    <li>
                      Use <strong>Bulk Fix</strong> to resolve common issues
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Template presets */}
        <div className="mb-8">
          <h2 className="text-base font-semibold text-text mb-2 font-heading">Quick Start Templates</h2>
          <p className="text-sm text-muted mb-5">Apply pre-configured rule sets for common use cases</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(templates).map(([key, template]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleApplyTemplate(key as keyof typeof RULE_TEMPLATES)}
                className="p-4 rounded-lg border border-border bg-surface cursor-pointer text-left hover:border-primary hover:shadow-sm transition-all"
              >
                <div className="text-sm font-medium text-text mb-1">{template.name}</div>
                <div className="text-xs text-muted">{template.rules.length} rules</div>
              </button>
            ))}
          </div>
        </div>

        {/* Current rules */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h2 className="text-base font-semibold text-text font-heading">Your Rules</h2>
              <p className="text-sm text-muted">
                {rules.length} active {rules.length === 1 ? "rule" : "rules"}
              </p>
            </div>
            <div className="flex gap-2">
              {rules.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllRules}
                  className="px-4 py-2 rounded-lg border border-border bg-surface text-muted cursor-pointer font-medium text-sm hover:bg-surface-strong transition-colors"
                >
                  Clear All
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 rounded-lg border-none bg-primary text-white cursor-pointer font-medium text-sm hover:bg-primary-strong transition-colors shadow-sm"
              >
                + Add Rule
              </button>
            </div>
          </div>

          {/* Create form */}
          {showCreateForm && (
            <div className="mb-6 p-6 border border-border rounded-xl bg-surface shadow-sm animate-fade-in">
              <h3 className="text-base font-semibold mb-4 text-text">Create New Rule</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium block mb-2 text-text">Rule Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Minimum Images"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2 text-text">Rule Type</label>
                  <select
                    value={formData.ruleType}
                    onChange={(e) => setFormData({ ...formData, ruleType: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  >
                    {Object.entries(RULE_DEFINITIONS).map(([key, def]) => (
                      <option key={key} value={key}>
                        {def.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {definition?.configSchema?.fields.length > 0 && (
                <div className="mb-4">
                  <label className="text-sm font-medium block mb-3 text-text">Configuration</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {definition.configSchema.fields.map((field) => (
                      <div key={field.key}>
                        <label className="text-xs text-muted block mb-1">{field.label}</label>
                        <input
                          type={field.type}
                          value={(formData.config as any)[field.key] ?? field.default ?? ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              config: { ...formData.config, [field.key]: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCreateRule}
                  disabled={!formData.name}
                  className={`px-5 py-2 rounded-lg border-none text-sm font-medium transition-colors ${
                    formData.name
                      ? "bg-primary text-white cursor-pointer hover:bg-primary-strong shadow-sm"
                      : "bg-surface-strong text-muted cursor-not-allowed"
                  }`}
                >
                  Create Rule
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-5 py-2 rounded-lg border border-border bg-surface cursor-pointer text-sm hover:bg-surface-strong transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          <div className="grid gap-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-5 border border-border rounded-xl bg-surface transition-all hover:shadow-sm ${
                  rule.isEnabled ? "opacity-100" : "opacity-50"
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold mb-1 text-text">{rule.name}</h3>
                    {rule.description && <p className="text-sm text-muted">{rule.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleRule(rule.id, rule.isEnabled)}
                      className={`px-3 py-2 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                        rule.isEnabled
                          ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                          : "bg-surface text-muted border-border hover:bg-surface-strong"
                      }`}
                    >
                      {rule.isEnabled ? "✓ Enabled" : "Disabled"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="px-3 py-2 rounded-lg border border-border bg-surface text-error cursor-pointer text-xs font-medium hover:bg-error/10 hover:border-error/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <span className="font-medium">Type:</span>
                    {RULE_DEFINITIONS[rule.ruleType as keyof typeof RULE_DEFINITIONS]?.label}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-medium">Severity:</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                        rule.severity === "high"
                          ? "bg-error/10 text-error"
                          : rule.severity === "medium"
                            ? "bg-warning/10 text-warning"
                            : "bg-muted/10 text-muted"
                      }`}
                    >
                      {rule.severity}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {rules.length === 0 && !showCreateForm && (
            <div className="p-12 text-center border-2 border-dashed border-border rounded-xl bg-surface">
              <div className="w-12 h-12 rounded-full bg-muted/10 flex items-center justify-center mx-auto mb-4">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-muted"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <p className="text-base font-medium text-text mb-1">No rules yet</p>
              <p className="text-sm text-muted">Start with a template or create a custom rule to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
