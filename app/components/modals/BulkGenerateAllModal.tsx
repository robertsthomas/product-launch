import React, { useState } from "react"

// ============================================
// Bulk Generate All Modal Component
// ============================================

export function BulkGenerateAllModal({
  isOpen,
  onClose,
  selectedFields,
  onFieldToggle,
  onGenerate,
  isGenerating,
  fieldOptions,
  setFieldOptions,
}: {
  isOpen: boolean
  onClose: () => void
  selectedFields: string[]
  onFieldToggle: (field: string) => void
  onGenerate: () => void
  isGenerating: boolean
  fieldOptions: Record<string, string[]>
  setFieldOptions: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
}) {
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({})

  if (!isOpen) return null

  const fields = [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "tags", label: "Tags" },
    { key: "seoTitle", label: "SEO Title" },
    { key: "seoDescription", label: "Meta Description" },
    {
      key: "images",
      label: "Images",
      hasOptions: true,
      options: [
        { key: "image", label: "Generate Image" },
        { key: "alt", label: "Generate Alt Text" },
      ],
    },
  ]

  const toggleExpand = (fieldKey: string) => {
    setExpandedFields((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey],
    }))
  }

  // Check if any fields are selected (either in selectedFields or fieldOptions)
  const hasSelectedFields = selectedFields.length > 0
  const hasFieldOptions = Object.values(fieldOptions).some((options) => options.length > 0)
  const canGenerate = hasSelectedFields || hasFieldOptions

  return (
    <div className="modal-backdrop" onClick={onClose} tabIndex={-1} role="presentation">
      <div className="modal-container animate-scale-in" style={{ maxWidth: "500px", maxHeight: "70vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: "18px",
              fontWeight: 600,
              color: "#111827",
              letterSpacing: "-0.01em",
            }}
          >
            Generate All Fields
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "var(--radius-md)",
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0",
            backgroundColor: "#ffffff",
          }}
        >
          {fields.map((field, idx) => (
            <div key={field.key}>
              <button
                type="button"
                onClick={() => {
                  if (field.hasOptions) {
                    toggleExpand(field.key)
                    if (!fieldOptions[field.key] && field.options) {
                      setFieldOptions((prev) => ({
                        ...prev,
                        [field.key]: field.options?.map((opt) => opt.key) || [],
                      }))
                    }
                  } else {
                    onFieldToggle(field.key)
                  }
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  border: "none",
                  borderBottom: idx < fields.length - 1 ? "1px solid #e5e7eb" : "none",
                  background: (
                    field.hasOptions
                      ? (fieldOptions[field.key]?.length || 0) > 0
                      : selectedFields.includes(field.key)
                  )
                    ? "rgba(31, 79, 216, 0.08)"
                    : "#ffffff",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  const isSelected = field.hasOptions
                    ? (fieldOptions[field.key]?.length || 0) > 0
                    : selectedFields.includes(field.key)
                  if (!isSelected) {
                    e.currentTarget.style.background = "#f9fafb"
                  }
                }}
                onMouseLeave={(e) => {
                  const isSelected = field.hasOptions
                    ? (fieldOptions[field.key]?.length || 0) > 0
                    : selectedFields.includes(field.key)
                  e.currentTarget.style.background = isSelected ? "rgba(31, 79, 216, 0.08)" : "#ffffff"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flex: 1,
                    textAlign: "left",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      field.hasOptions ? (fieldOptions[field.key]?.length || 0) > 0 : selectedFields.includes(field.key)
                    }
                    onChange={(e) => {
                      e.stopPropagation()
                      if (field.hasOptions) {
                        const currentOptions = fieldOptions[field.key] || []
                        const allOptions = field.options?.map((opt) => opt.key) || []
                        if (currentOptions.length > 0) {
                          setFieldOptions((prev) => ({
                            ...prev,
                            [field.key]: [],
                          }))
                        } else {
                          setFieldOptions((prev) => ({
                            ...prev,
                            [field.key]: allOptions,
                          }))
                        }
                      } else {
                        onFieldToggle(field.key)
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "16px",
                      height: "16px",
                      accentColor: "#1f4fd8",
                      cursor: "pointer",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#111827",
                    }}
                  >
                    {field.label}
                  </span>
                </div>
                {field.hasOptions && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: expandedFields[field.key] ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                      color: "#6b7280",
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
              </button>

              {/* Expanded options for fields with multiple choices */}
              {expandedFields[field.key] && field.hasOptions && field.options && (
                <div
                  style={{
                    padding: "12px 20px 16px 48px",
                    backgroundColor: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      marginBottom: "8px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#6b7280",
                    }}
                  >
                    Choose what to generate:
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {field.options.map((option) => (
                      <label
                        key={option.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          cursor: "pointer",
                          fontSize: "14px",
                          color: "#111827",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={fieldOptions[field.key]?.includes(option.key) || false}
                          onChange={(e) => {
                            const currentOptions = fieldOptions[field.key] || []
                            if (e.target.checked) {
                              setFieldOptions((prev) => ({
                                ...prev,
                                [field.key]: [...currentOptions, option.key],
                              }))
                            } else {
                              setFieldOptions((prev) => ({
                                ...prev,
                                [field.key]: currentOptions.filter((opt) => opt !== option.key),
                              }))
                            }
                          }}
                          style={{
                            width: "14px",
                            height: "14px",
                            accentColor: "#1f4fd8",
                            cursor: "pointer",
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "20px 24px",
            borderTop: "1px solid #f3f4f6",
            display: "flex",
            gap: "12px",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#ffffff",
          }}
        >
          {/* Select All / Deselect All */}
          <button
            type="button"
            onClick={() => {
              if (selectedFields.length === fields.length) {
                selectedFields.forEach((key) => onFieldToggle(key))
              } else {
                fields.forEach((field) => {
                  if (!selectedFields.includes(field.key)) {
                    onFieldToggle(field.key)
                  }
                })
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 500,
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              color: "#111827",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f9fafb"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#ffffff"
            }}
          >
            {selectedFields.length === fields.length ? "Deselect All" : "Select All"}
          </button>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#ffffff",
                color: "#111827",
                cursor: isGenerating ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.5 : 1,
                transition: "all 0.15s ease",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating || !canGenerate}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                border: "none",
                borderRadius: "8px",
                backgroundColor: isGenerating || !canGenerate ? "#f3f4f6" : "#1f4fd8",
                color: isGenerating || !canGenerate ? "#9ca3af" : "#ffffff",
                cursor: isGenerating || !canGenerate ? "not-allowed" : "pointer",
                opacity: isGenerating ? 0.7 : 1,
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                if (!isGenerating && canGenerate) {
                  e.currentTarget.style.backgroundColor = "#1a43b8"
                }
              }}
              onMouseLeave={(e) => {
                if (canGenerate && !isGenerating) {
                  e.currentTarget.style.backgroundColor = "#1f4fd8"
                }
              }}
            >
              {isGenerating ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ animation: "spin 1s linear infinite" }}
                  >
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  </svg>
                  Generating...
                </>
              ) : (
                "Generate"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
