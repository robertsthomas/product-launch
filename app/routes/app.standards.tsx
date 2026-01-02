import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { 
  getCatalogRules,
  createCatalogRule,
  deleteCatalogRule,
  toggleCatalogRule,
  applyRuleTemplate,
} from "../lib/services/rules.server";
import { RULE_DEFINITIONS, RULE_TEMPLATES } from "../lib/services/rules.types";
import { getShopPlanStatus } from "../lib/billing/guards.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Check Pro plan
  const { plan } = await getShopPlanStatus(shop);
  
  if (plan !== "pro") {
    return { plan, rules: [], templates: RULE_TEMPLATES, isPro: false };
  }

  const rules = await getCatalogRules(shop);

  return { plan, rules, templates: RULE_TEMPLATES, isPro: true };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const { plan } = await getShopPlanStatus(shop);
  if (plan !== "pro") {
    return Response.json({ error: "Pro plan required" }, { status: 403 });
  }

  if (intent === "create") {
    const name = formData.get("name") as string;
    const ruleType = formData.get("ruleType") as string;
    const config = JSON.parse(formData.get("config") as string || "{}");
    const severity = (formData.get("severity") || "medium") as string;

    const rule = await createCatalogRule(shop, {
      name,
      description: formData.get("description") as string,
      ruleType: ruleType as any,
      configJson: JSON.stringify(config),
      severity: severity as "low" | "medium" | "high",
      isEnabled: true,
      appliesToAll: true,
    });

    return Response.json({ success: true, rule });
  }

  if (intent === "update") {
    const ruleId = formData.get("ruleId") as string;
    const updates: any = {};
    
    const name = formData.get("name");
    if (name) updates.name = name;
    
    const config = formData.get("config");
    if (config) updates.configJson = config;
    
    const severity = formData.get("severity");
    if (severity) updates.severity = severity;

    const rule = await updateCatalogRule(ruleId, updates);
    return Response.json({ success: true, rule });
  }

  if (intent === "delete") {
    const ruleId = formData.get("ruleId") as string;
    await deleteCatalogRule(ruleId);
    return Response.json({ success: true });
  }

  if (intent === "toggle") {
    const ruleId = formData.get("ruleId") as string;
    const enabled = formData.get("enabled") === "true";
    await toggleCatalogRule(ruleId, enabled);
    return Response.json({ success: true });
  }

  if (intent === "applyTemplate") {
    const templateKey = formData.get("templateKey") as keyof typeof RULE_TEMPLATES;
    const rules = await applyRuleTemplate(shop, templateKey);
    return Response.json({ success: true, rules });
  }

  if (intent === "clearAll") {
    const allRules = await getCatalogRules(shop);
    for (const rule of allRules) {
      await deleteCatalogRule(rule.id);
    }
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
};

export default function CatalogStandardsPage() {
  const { rules, templates, isPro } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    ruleType: "min_images",
    config: { min: 6 },
    severity: "medium" as "low" | "medium" | "high",
  });

  // Show upgrade prompt for Free users
  if (!isPro) {
    return (
      <div style={{ maxWidth: "600px", margin: "60px auto", padding: "32px", textAlign: "center" }}>
        <div style={{
          width: "80px",
          height: "80px",
          borderRadius: "50%",
          background: "var(--color-primary-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h1 style={{ fontSize: "24px", fontWeight: 600, marginBottom: "12px" }}>
          Catalog Standards
        </h1>
        <p style={{ color: "var(--color-muted)", fontSize: "15px", marginBottom: "24px", lineHeight: 1.6 }}>
          Define store-wide rules to ensure your products stay compliant. Set requirements for images, SEO, tags, and more — then let LaunchReady automatically monitor your catalog.
        </p>
        
        <div style={{
          background: "var(--color-surface-secondary)",
          borderRadius: "var(--radius-lg)",
          padding: "24px",
          marginBottom: "24px",
          textAlign: "left",
        }}>
          <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>
            With Pro you can:
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              "Set minimum image requirements per product",
              "Enforce SEO title and description length limits",
              "Require alt text on all images",
              "Mandate specific tags or tag groups",
              "Get automatic compliance monitoring",
              "Receive alerts when products drift out of compliance",
            ].map((feature, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--color-text)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => navigate("/app/plans")}
          style={{
            padding: "14px 32px",
            borderRadius: "var(--radius-full)",
            border: "none",
            background: "var(--gradient-primary)",
            color: "#fff",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "var(--shadow-primary-glow)",
          }}
        >
          Upgrade to Pro — $19/mo
        </button>
        <p style={{ fontSize: "12px", color: "var(--color-muted)", marginTop: "12px" }}>
          7-day free trial • Cancel anytime
        </p>
      </div>
    );
  }

  const handleCreateRule = () => {
    const formDataObj = new FormData();
    formDataObj.append("intent", "create");
    formDataObj.append("name", formData.name);
    formDataObj.append("description", formData.description);
    formDataObj.append("ruleType", formData.ruleType);
    formDataObj.append("config", JSON.stringify(formData.config));
    formDataObj.append("severity", formData.severity);

    fetcher.submit(formDataObj, { method: "post" });
    setShowCreateForm(false);
    setFormData({
      name: "",
      description: "",
      ruleType: "min_images",
      config: { min: 6 },
      severity: "medium",
    });
  };

  const handleApplyTemplate = (templateKey: keyof typeof RULE_TEMPLATES) => {
    const formDataObj = new FormData();
    formDataObj.append("intent", "applyTemplate");
    formDataObj.append("templateKey", templateKey);
    fetcher.submit(formDataObj, { method: "post" });
  };

  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    const formDataObj = new FormData();
    formDataObj.append("intent", "toggle");
    formDataObj.append("ruleId", ruleId);
    formDataObj.append("enabled", String(!enabled));
    fetcher.submit(formDataObj, { method: "post" });
  };

  const handleDeleteRule = (ruleId: string) => {
    if (confirm("Delete this rule?")) {
      const formDataObj = new FormData();
      formDataObj.append("intent", "delete");
      formDataObj.append("ruleId", ruleId);
      fetcher.submit(formDataObj, { method: "post" });
    }
  };

  const handleClearAllRules = () => {
    if (confirm("Delete all rules? This cannot be undone.")) {
      const formDataObj = new FormData();
      formDataObj.append("intent", "clearAll");
      fetcher.submit(formDataObj, { method: "post" });
    }
  };

  const definition = RULE_DEFINITIONS[formData.ruleType as keyof typeof RULE_DEFINITIONS];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 600, marginBottom: "8px" }}>
          Catalog Standards
        </h1>
        <p style={{ color: "var(--color-muted)", fontSize: "14px" }}>
          Define store-wide rules to ensure product compliance. Your catalog is automatically audited nightly.
        </p>
      </div>

      {/* Template presets */}
      <div style={{ 
        marginBottom: "32px", 
        padding: "24px", 
        background: "var(--color-surface)", 
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
      }}>
        <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Quick Start Templates</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {Object.entries(templates).map(([key, template]) => (
            <button
              key={key}
              onClick={() => handleApplyTemplate(key as keyof typeof RULE_TEMPLATES)}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              {template.name}
            </button>
          ))}
        </div>
      </div>

      {/* Current rules */}
      <div style={{ 
        marginBottom: "32px",
        padding: "24px",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600 }}>Your Rules ({rules.length})</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            {rules.length > 0 && (
              <button
                onClick={handleClearAllRules}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-full)",
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-muted)",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "12px",
                }}
              >
                Clear All
              </button>
            )}
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-full)",
                border: "none",
                background: "var(--color-text)",
                color: "var(--color-surface)",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "12px",
              }}
            >
              + Add Rule
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <div style={{
            marginBottom: "24px",
            padding: "20px",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-surface-secondary)",
          }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Create New Rule</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px" }}>
                  Rule Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Minimum Images"
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "4px" }}>
                  Rule Type
                </label>
                <select
                  value={formData.ruleType}
                  onChange={(e) => setFormData({ ...formData, ruleType: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                  }}
                >
                  {Object.entries(RULE_DEFINITIONS).map(([key, def]) => (
                    <option key={key} value={key}>{def.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {definition?.configSchema?.fields.length > 0 && (
              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "8px" }}>
                  Configuration
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px" }}>
                  {definition.configSchema.fields.map((field) => (
                    <div key={field.key}>
                      <label style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                        {field.label}
                      </label>
                      <input
                        type={field.type}
                        value={(formData.config as any)[field.key] ?? field.default ?? ""}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: { ...formData.config, [field.key]: e.target.value }
                        })}
                        style={{
                          width: "100%",
                          padding: "6px",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleCreateRule}
                disabled={!formData.name}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: formData.name ? "var(--color-text)" : "var(--color-surface-strong)",
                  color: "var(--color-surface)",
                  cursor: formData.name ? "pointer" : "not-allowed",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Rules list */}
        <div style={{ display: "grid", gap: "12px" }}>
          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                padding: "16px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                background: "var(--color-surface-secondary)",
                opacity: rule.isEnabled ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "8px" }}>
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>
                    {rule.name}
                  </h3>
                  {rule.description && (
                    <p style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                      {rule.description}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => handleToggleRule(rule.id, rule.isEnabled)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: rule.isEnabled ? "var(--color-success-faint)" : "var(--color-surface)",
                      color: rule.isEnabled ? "var(--color-success)" : "var(--color-muted)",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 500,
                    }}
                  >
                    {rule.isEnabled ? "✓ Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      background: "transparent",
                      color: "var(--color-danger)",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 500,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--color-muted)" }}>
                <span>Type: {RULE_DEFINITIONS[rule.ruleType as keyof typeof RULE_DEFINITIONS]?.label}</span>
                <span>Severity: <strong>{rule.severity}</strong></span>
              </div>
            </div>
          ))}
        </div>

        {rules.length === 0 && !showCreateForm && (
          <div style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--color-muted)",
          }}>
            <p style={{ fontSize: "14px" }}>No rules yet. Start with a template or create a custom rule.</p>
          </div>
        )}
      </div>
    </div>
  );
}
