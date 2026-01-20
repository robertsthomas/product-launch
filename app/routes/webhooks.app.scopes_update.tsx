import { eq } from "drizzle-orm"
import type { ActionFunctionArgs } from "react-router"
import { db, sessions } from "../db"
import { authenticate } from "../shopify.server"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request)
  console.log(`Received ${topic} webhook for ${shop}`)

  const current = payload.current as string[]
  if (session) {
    await db.update(sessions).set({ scope: current.toString() }).where(eq(sessions.id, session.id))
  }
  return new Response()
}
