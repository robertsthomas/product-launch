import type { ProductImage } from "./types"

interface ProductMediaCardProps {
  images: ProductImage[]
  featuredImageId: string | null
  productId: string
  productTitle: string
  aiAvailable: boolean
  generatingImage: boolean
  generatingBulkAlt: boolean
  setGeneratingBulkAlt: (value: boolean) => void
  onRefresh: () => void
  onOpenImagePromptModal: () => void
  onAltTextChange: (imageId: string, altText: string) => void
  // ImageManager component passed in to avoid circular deps
  ImageManager: React.ComponentType<any>
}

export function ProductMediaCard({
  images,
  featuredImageId,
  productId,
  productTitle,
  aiAvailable,
  generatingImage,
  generatingBulkAlt,
  setGeneratingBulkAlt,
  onRefresh,
  onOpenImagePromptModal,
  onAltTextChange,
  ImageManager,
}: ProductMediaCardProps) {
  return (
    <div
      id="section-images"
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
          Images
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            color: "#71717a",
          }}
        >
          {images.length} {images.length === 1 ? "image" : "images"}
        </p>
      </div>

      <ImageManager
        images={images}
        featuredImageId={featuredImageId}
        productId={productId}
        productTitle={productTitle}
        aiAvailable={aiAvailable}
        onRefresh={onRefresh}
        generatingImage={generatingImage}
        generatingBulkAlt={generatingBulkAlt}
        setGeneratingBulkAlt={setGeneratingBulkAlt}
        onOpenImagePromptModal={onOpenImagePromptModal}
        onAltTextChange={onAltTextChange}
      />
    </div>
  )
}
