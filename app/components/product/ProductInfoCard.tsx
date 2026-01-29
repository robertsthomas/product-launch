import type { AIGenerateMode, AutocompleteOptions, FieldVersion, ProductData, ProductForm } from "./types"

interface ProductInfoCardProps {
  product: ProductData
  form: ProductForm
  updateField: (field: string, value: string | string[]) => void
  generating: Set<string>
  generatingModes: Record<string, AIGenerateMode>
  aiAvailable: boolean
  autocomplete: AutocompleteOptions
  fieldVersions: Record<string, FieldVersion[]>
  aiGeneratedFields: Set<string>
  preGenerationValues: Record<string, string | string[]>
  onGenerateAI: (type: string, field: string, mode: AIGenerateMode) => void
  onRevert: (field: string, version: number) => void
  onInlineRevert: (field: string) => void
  // Sub-components passed in to avoid circular deps
  EditableField: React.ComponentType<any>
  AutocompleteField: React.ComponentType<any>
  TagsInput: React.ComponentType<any>
}

export function ProductInfoCard({
  product,
  form,
  updateField,
  generating,
  generatingModes,
  aiAvailable,
  autocomplete,
  fieldVersions,
  aiGeneratedFields,
  preGenerationValues,
  onGenerateAI,
  onRevert,
  onInlineRevert,
  EditableField,
  AutocompleteField,
  TagsInput,
}: ProductInfoCardProps) {
  return (
    <div
      id="section-info"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "24px",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        backgroundColor: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {/* Header with thumbnail */}
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
        {/* Product Image Thumbnail */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "12px",
            overflow: "hidden",
            backgroundColor: "#f9fafb",
            flexShrink: 0,
            border: "1px solid #e5e7eb",
          }}
        >
          {product.featuredImage ? (
            <img
              src={product.featuredImage}
              alt={product.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          )}
        </div>

        {/* Title & Organization */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div id="field-title">
            <EditableField
              label="Title"
              value={form.title}
              onChange={(v: string) => updateField("title", v)}
              onGenerateAI={(mode: AIGenerateMode) => onGenerateAI("title", "title", mode)}
              isGenerating={generating.has("title")}
              generatingMode={generatingModes.title}
              showAI={aiAvailable}
              placeholder="Product title"
              fieldVersions={fieldVersions.title}
              onRevert={(field: string, version: number) => onRevert(field, version)}
              field="title"
              productId={product.id}
              canInlineRevert={aiGeneratedFields.has("title") && !!preGenerationValues.title}
              onInlineRevert={() => onInlineRevert("title")}
            />
          </div>

          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            <div id="field-vendor" style={{ flex: 1 }}>
              <AutocompleteField
                label="Vendor"
                value={form.vendor}
                onChange={(v: string) => updateField("vendor", v)}
                options={autocomplete.vendors}
                placeholder="Brand or vendor"
              />
            </div>
            <div id="field-product-type" style={{ flex: 1 }}>
              <AutocompleteField
                label="Product Type"
                value={form.productType}
                onChange={(v: string) => updateField("productType", v)}
                options={autocomplete.productTypes}
                placeholder="e.g., T-Shirt"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div id="field-description">
        <EditableField
          label="Description"
          value={form.description}
          onChange={(v: string) => updateField("description", v)}
          onGenerateAI={(mode: AIGenerateMode) => onGenerateAI("description", "description", mode)}
          isGenerating={generating.has("description")}
          generatingMode={generatingModes.description}
          showAI={aiAvailable}
          multiline
          placeholder="Describe your product..."
          fieldVersions={fieldVersions.description}
          onRevert={(field: string, version: number) => onRevert(field, version)}
          field="description"
          productId={product.id}
          canInlineRevert={aiGeneratedFields.has("description") && !!preGenerationValues.description}
          onInlineRevert={() => onInlineRevert("description")}
        />
      </div>

      {/* Tags */}
      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          paddingTop: "20px",
        }}
      >
        <div id="field-tags">
          <TagsInput
            tags={form.tags}
            onChange={(v: string[]) => updateField("tags", v)}
            onGenerateAI={(mode: AIGenerateMode) => onGenerateAI("tags", "tags", mode)}
            isGenerating={generating.has("tags")}
            generatingMode={generatingModes.tags}
            showAI={aiAvailable}
            fieldVersions={fieldVersions.tags}
            onRevert={(field: string, version: number) => onRevert(field, version)}
            field="tags"
            productId={product.id}
            canInlineRevert={aiGeneratedFields.has("tags") && !!preGenerationValues.tags}
            onInlineRevert={() => onInlineRevert("tags")}
          />
        </div>
      </div>
    </div>
  )
}
