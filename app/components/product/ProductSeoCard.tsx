import type { ProductForm, AIGenerateMode, FieldVersion } from "./types";

interface ProductSeoCardProps {
  form: ProductForm;
  productId: string;
  productTitle: string;
  updateField: (field: string, value: string) => void;
  generating: Set<string>;
  generatingModes: Record<string, AIGenerateMode>;
  aiAvailable: boolean;
  fieldVersions: Record<string, FieldVersion[]>;
  aiGeneratedFields: Set<string>;
  preGenerationValues: Record<string, string | string[]>;
  onGenerateAI: (type: string, field: string, mode: AIGenerateMode) => void;
  onRevert: (field: string, version: number) => void;
  onInlineRevert: (field: string) => void;
  // EditableField component passed in
  EditableField: React.ComponentType<any>;
}

export function ProductSeoCard({
  form,
  productId,
  productTitle,
  updateField,
  generating,
  generatingModes,
  aiAvailable,
  fieldVersions,
  aiGeneratedFields,
  preGenerationValues,
  onGenerateAI,
  onRevert,
  onInlineRevert,
  EditableField,
}: ProductSeoCardProps) {
  const slug = productTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <div
      id="section-seo"
      style={{
        padding: "16px",
        border: "1px solid #e4e4e7",
        borderRadius: "12px",
        backgroundColor: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ marginBottom: "12px" }}>
        <h3
          style={{
            margin: "0 0 2px 0",
            fontSize: "13px",
            fontWeight: 600,
            color: "#18181b",
          }}
        >
          Search Engine Listing
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            color: "#71717a",
          }}
        >
          How this appears in search results
        </p>
      </div>

      {/* Google Preview */}
      <div
        style={{
          padding: "16px 20px",
          backgroundColor: "#fafafa",
          borderRadius: "8px",
          marginBottom: "24px",
          border: "1px solid #e4e4e7",
        }}
      >
        <div
          style={{
            color: "#1a0dab",
            fontSize: "16px",
            marginBottom: "4px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "Arial, sans-serif",
          }}
        >
          {form.seoTitle || form.title || "Page title"}
        </div>
        <div
          style={{
            color: "#006621",
            fontSize: "13px",
            marginBottom: "6px",
            fontFamily: "Arial, sans-serif",
          }}
        >
          yourstore.com › products › {slug}
        </div>
        <div
          style={{
            color: "#545454",
            fontSize: "13px",
            lineHeight: "1.5",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontFamily: "Arial, sans-serif",
          }}
        >
          {form.seoDescription || form.description.slice(0, 160) || "Add a meta description..."}
        </div>
      </div>

      {/* SEO Title */}
      <div id="field-seo-title" style={{ marginBottom: "16px" }}>
        <EditableField
          label="SEO Title"
          value={form.seoTitle}
          onChange={(v: string) => updateField("seoTitle", v)}
          onGenerateAI={(mode: AIGenerateMode) => onGenerateAI("seo_title", "seoTitle", mode)}
          isGenerating={generating.has("seoTitle")}
          generatingMode={generatingModes.seoTitle}
          showAI={aiAvailable}
          placeholder={form.title}
          maxLength={60}
          helpText="50-60 characters recommended"
          fieldVersions={fieldVersions.seoTitle}
          onRevert={(field: string, version: number) => onRevert(field, version)}
          field="seoTitle"
          productId={productId}
          canInlineRevert={aiGeneratedFields.has("seoTitle") && !!preGenerationValues.seoTitle}
          onInlineRevert={() => onInlineRevert("seoTitle")}
        />
      </div>

      {/* Meta Description */}
      <div id="field-seo-description">
        <EditableField
          label="Meta Description"
          value={form.seoDescription}
          onChange={(v: string) => updateField("seoDescription", v)}
          onGenerateAI={(mode: AIGenerateMode) => onGenerateAI("seo_description", "seoDescription", mode)}
          isGenerating={generating.has("seoDescription")}
          generatingMode={generatingModes.seoDescription}
          showAI={aiAvailable}
          multiline
          placeholder="Describe this product for search engines..."
          maxLength={160}
          helpText="120-155 characters recommended"
          fieldVersions={fieldVersions.seoDescription}
          onRevert={(field: string, version: number) => onRevert(field, version)}
          field="seoDescription"
          productId={productId}
          canInlineRevert={aiGeneratedFields.has("seoDescription") && !!preGenerationValues.seoDescription}
          onInlineRevert={() => onInlineRevert("seoDescription")}
        />
      </div>
    </div>
  );
}
