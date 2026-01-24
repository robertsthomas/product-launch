import type { LoaderFunctionArgs } from "react-router"
import { verifyAuditPersistence } from "../lib/services/audit.server"
import { authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shopDomain = session.shop

  const diagnostics = await verifyAuditPersistence(shopDomain)

  return Response.json(diagnostics)
}
