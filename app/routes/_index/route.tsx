import type { LoaderFunctionArgs } from "react-router"
import { redirect } from "react-router"

/**
 * Root route handler
 *
 * For embedded Shopify apps, this route should:
 * 1. If `shop` param exists: redirect to /app (which triggers OAuth)
 * 2. If no `shop` param: redirect to Shopify App Store listing
 *
 * The app should only be accessed through Shopify admin, not directly.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const shop = url.searchParams.get("shop")

  if (shop) {
    // Redirect to /app which will handle authentication
    throw redirect(`/app?${url.searchParams.toString()}`)
  }

  // No shop parameter - this is a direct visit to the app URL
  // Redirect to Shopify App Store or show install instructions
  // For now, redirect to the app with a message to access via Shopify admin

  // You can change this to your App Store listing URL once published:
  // throw redirect("https://apps.shopify.com/launch-ready");

  // For now, show a simple message
  return { message: "Please access this app through your Shopify admin." }
}

export default function Index() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: "#0a1628",
        color: "#fff",
        padding: "20px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: "2.5rem",
          marginBottom: "1rem",
          color: "#00d9ff",
        }}
      >
        Launch Ready
      </h1>
      <p
        style={{
          fontSize: "1.1rem",
          marginBottom: "2rem",
          color: "#8b9dc3",
          maxWidth: "400px",
        }}
      >
        This app is designed to run inside the Shopify admin.
      </p>
      <p
        style={{
          fontSize: "1rem",
          color: "#8b9dc3",
        }}
      >
        To use Launch Ready, please install it from the{" "}
        <a href="https://apps.shopify.com" style={{ color: "#00d9ff", textDecoration: "underline" }}>
          Shopify App Store
        </a>{" "}
        or access it through your Shopify admin.
      </p>
    </div>
  )
}
