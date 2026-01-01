/**
 * Image Analyzer Component
 * 
 * Displays image readiness analysis for a product:
 * - Resolution checks
 * - Aspect ratio validation
 * - Alt text status
 * - Actionable recommendations
 */

import { useState } from "react";
import type { ImageAnalysis, ProductImageAnalysis } from "../lib/services/image-analyzer.server";

interface ImageAnalyzerProps {
  analysis: ProductImageAnalysis;
  onGenerateAltText?: (imageId: string) => void;
  onGenerateAllAltText?: () => void;
  isGenerating?: boolean;
  aiAvailable?: boolean;
  isPro?: boolean;
}

export function ImageAnalyzer({
  analysis,
  onGenerateAltText,
  onGenerateAllAltText,
  isGenerating = false,
  aiAvailable = false,
  isPro = false,
}: ImageAnalyzerProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const imagesNeedingAlt = analysis.images.filter(
    img => img.issues.some(i => i.type === "alt_text" && i.severity === "error")
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Summary Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px",
        background: analysis.criticalIssues > 0 
          ? "var(--color-warning-soft)" 
          : "var(--color-success-soft)",
        borderRadius: "var(--radius-md)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Score circle */}
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "var(--color-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "var(--text-lg)",
            color: analysis.overallScore >= 80 
              ? "var(--color-success)" 
              : analysis.overallScore >= 50 
                ? "var(--color-warning)" 
                : "var(--color-critical)",
          }}>
            {analysis.overallScore}
          </div>
          <div>
            <div style={{ 
              fontWeight: 600, 
              color: "var(--color-text)",
              fontSize: "var(--text-sm)",
            }}>
              Image Readiness Score
            </div>
            <div style={{ 
              fontSize: "var(--text-xs)", 
              color: "var(--color-text-secondary)" 
            }}>
              {analysis.summary}
            </div>
          </div>
        </div>

        {/* Generate all alt text button */}
        {imagesNeedingAlt.length > 0 && aiAvailable && isPro && onGenerateAllAltText && (
          <button
            type="button"
            onClick={onGenerateAllAltText}
            disabled={isGenerating}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              background: isGenerating ? "var(--color-surface-strong)" : "var(--gradient-primary)",
              color: isGenerating ? "var(--color-muted)" : "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              cursor: isGenerating ? "not-allowed" : "pointer",
              transition: "all var(--transition-fast)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            {isGenerating ? "Generating..." : `Generate ${imagesNeedingAlt.length} Alt Texts`}
          </button>
        )}
      </div>

      {/* Image Grid */}
      {analysis.images.length === 0 ? (
        <div style={{
          padding: "40px",
          textAlign: "center",
          color: "var(--color-muted)",
          background: "var(--color-surface-strong)",
          borderRadius: "var(--radius-md)",
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: "0 auto 12px" }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <div style={{ fontWeight: 500 }}>No images found</div>
          <div style={{ fontSize: "var(--text-sm)", marginTop: "4px" }}>
            Add product images to improve conversion rates
          </div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "12px",
        }}>
          {analysis.images.map((image, index) => (
            <ImageCard
              key={image.id}
              image={image}
              index={index}
              isExpanded={expandedImage === image.id}
              onToggle={() => setExpandedImage(
                expandedImage === image.id ? null : image.id
              )}
              onGenerateAltText={onGenerateAltText}
              isGenerating={isGenerating}
              aiAvailable={aiAvailable}
              isPro={isPro}
            />
          ))}
        </div>
      )}

      {/* Recommendations */}
      {analysis.images.length > 0 && analysis.totalIssues > 0 && (
        <div style={{
          padding: "16px",
          background: "var(--color-surface-strong)",
          borderRadius: "var(--radius-md)",
        }}>
          <div style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}>
            Recommendations
          </div>
          <ul style={{
            margin: 0,
            paddingLeft: "18px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}>
            {getUniqueRecommendations(analysis.images).map((rec, i) => (
              <li key={i} style={{ 
                fontSize: "var(--text-sm)", 
                color: "var(--color-text-secondary)",
                lineHeight: 1.4,
              }}>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ImageCardProps {
  image: ImageAnalysis;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onGenerateAltText?: (imageId: string) => void;
  isGenerating: boolean;
  aiAvailable: boolean;
  isPro: boolean;
}

function ImageCard({
  image,
  index,
  isExpanded,
  onToggle,
  onGenerateAltText,
  isGenerating,
  aiAvailable,
  isPro,
}: ImageCardProps) {
  const hasAltTextIssue = image.issues.some(i => i.type === "alt_text" && i.severity === "error");
  const hasWarnings = image.issues.some(i => i.severity === "warning");
  
  const borderColor = hasAltTextIssue 
    ? "var(--color-critical)" 
    : hasWarnings 
      ? "var(--color-warning)" 
      : "var(--color-success)";

  return (
    <div style={{
      position: "relative",
      borderRadius: "var(--radius-md)",
      overflow: "hidden",
      border: `2px solid ${borderColor}`,
      background: "var(--color-surface)",
      cursor: "pointer",
      transition: "transform var(--transition-fast), box-shadow var(--transition-fast)",
    }}>
      {/* Image */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
        }}
      >
        <div style={{
          aspectRatio: "1",
          overflow: "hidden",
          background: "var(--color-surface-strong)",
        }}>
          <img
            src={image.url}
            alt={image.altText || `Product image ${index + 1}`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      </button>

      {/* Score badge */}
      <div style={{
        position: "absolute",
        top: "6px",
        right: "6px",
        padding: "2px 6px",
        borderRadius: "var(--radius-full)",
        background: "rgba(0,0,0,0.7)",
        color: "#fff",
        fontSize: "10px",
        fontWeight: 600,
      }}>
        {image.score}%
      </div>

      {/* Issue indicator */}
      {image.issues.length > 0 && (
        <div style={{
          position: "absolute",
          top: "6px",
          left: "6px",
          padding: "2px 6px",
          borderRadius: "var(--radius-full)",
          background: hasAltTextIssue ? "var(--color-critical)" : "var(--color-warning)",
          color: "#fff",
          fontSize: "9px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "3px",
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          {image.issues.length}
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div style={{
          padding: "10px",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}>
          {/* Dimensions */}
          {image.width && image.height && (
            <div style={{
              fontSize: "11px",
              color: "var(--color-muted)",
              marginBottom: "6px",
            }}>
              {image.width} × {image.height}px
            </div>
          )}

          {/* Alt text */}
          <div style={{
            fontSize: "11px",
            color: image.altText ? "var(--color-text-secondary)" : "var(--color-critical)",
            marginBottom: "8px",
            fontStyle: image.altText ? "normal" : "italic",
          }}>
            {image.altText || "No alt text"}
          </div>

          {/* Issues list */}
          {image.issues.length > 0 && (
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "4px", 
              marginBottom: "8px" 
            }}>
              {image.issues.map((issue, i) => (
                <div key={i} style={{
                  fontSize: "10px",
                  color: issue.severity === "error" 
                    ? "var(--color-critical)" 
                    : issue.severity === "warning" 
                      ? "var(--color-warning)" 
                      : "var(--color-muted)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "4px",
                }}>
                  <span>•</span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Generate alt text button */}
          {hasAltTextIssue && aiAvailable && onGenerateAltText && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGenerateAltText(image.id);
              }}
              disabled={isGenerating || !isPro}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: !isPro 
                  ? "var(--color-surface-strong)" 
                  : isGenerating 
                    ? "var(--color-surface-strong)" 
                    : "var(--color-primary)",
                color: !isPro || isGenerating ? "var(--color-muted)" : "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "10px",
                fontWeight: 600,
                cursor: !isPro || isGenerating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
              title={!isPro ? "Pro plan required" : undefined}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
              {!isPro ? "Pro Required" : isGenerating ? "..." : "Generate Alt Text"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function getUniqueRecommendations(images: ImageAnalysis[]): string[] {
  const recommendations = new Set<string>();
  
  for (const image of images) {
    for (const rec of image.recommendations) {
      recommendations.add(rec);
    }
  }

  // Add general recommendations
  if (images.length < 3) {
    recommendations.add("Add more images (3-5 recommended) to showcase your product from different angles");
  }
  
  return Array.from(recommendations);
}

export default ImageAnalyzer;

