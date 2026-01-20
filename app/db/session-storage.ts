import { Session } from "@shopify/shopify-api"
import { SessionStorage } from "@shopify/shopify-app-session-storage"
import { eq } from "drizzle-orm"
import { db, sessions } from "./index"

/**
 * Custom Drizzle session storage for Shopify
 */
export class DrizzleSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const sessionData = {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope ?? null,
      expires: session.expires ?? null,
      accessToken: session.accessToken ?? "",
      userId: session.onlineAccessInfo?.associated_user?.id?.toString() ?? null,
      firstName: session.onlineAccessInfo?.associated_user?.first_name ?? null,
      lastName: session.onlineAccessInfo?.associated_user?.last_name ?? null,
      email: session.onlineAccessInfo?.associated_user?.email ?? null,
      accountOwner: session.onlineAccessInfo?.associated_user?.account_owner ?? false,
      locale: session.onlineAccessInfo?.associated_user?.locale ?? null,
      collaborator: session.onlineAccessInfo?.associated_user?.collaborator ?? false,
      emailVerified: session.onlineAccessInfo?.associated_user?.email_verified ?? false,
    }

    try {
      // Try to update existing session
      const results = await db.select().from(sessions).where(eq(sessions.id, session.id))
      const existing = results[0]

      if (existing) {
        await db.update(sessions).set(sessionData).where(eq(sessions.id, session.id))
      } else {
        await db.insert(sessions).values(sessionData)
      }
      return true
    } catch (error) {
      console.error("Error storing session:", error)
      return false
    }
  }

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const results = await db.select().from(sessions).where(eq(sessions.id, id))
      const row = results[0]

      if (!row) {
        return undefined
      }

      const session = new Session({
        id: row.id,
        shop: row.shop,
        state: row.state,
        isOnline: row.isOnline,
      })

      session.scope = row.scope ?? undefined
      session.expires = row.expires ?? undefined
      session.accessToken = row.accessToken

      if (row.userId) {
        session.onlineAccessInfo = {
          expires_in: 0,
          associated_user_scope: row.scope ?? "",
          associated_user: {
            id: parseInt(row.userId, 10),
            first_name: row.firstName ?? "",
            last_name: row.lastName ?? "",
            email: row.email ?? "",
            account_owner: row.accountOwner,
            locale: row.locale ?? "",
            collaborator: row.collaborator ?? false,
            email_verified: row.emailVerified ?? false,
          },
        }
      }

      return session
    } catch (error) {
      console.error("Error loading session:", error)
      return undefined
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await db.delete(sessions).where(eq(sessions.id, id))
      return true
    } catch (error) {
      console.error("Error deleting session:", error)
      return false
    }
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      for (const id of ids) {
        await db.delete(sessions).where(eq(sessions.id, id))
      }
      return true
    } catch (error) {
      console.error("Error deleting sessions:", error)
      return false
    }
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const rows = await db.select().from(sessions).where(eq(sessions.shop, shop))

      return rows.map((row) => {
        const session = new Session({
          id: row.id,
          shop: row.shop,
          state: row.state,
          isOnline: row.isOnline,
        })

        session.scope = row.scope ?? undefined
        session.expires = row.expires ?? undefined
        session.accessToken = row.accessToken

        return session
      })
    } catch (error) {
      console.error("Error finding sessions by shop:", error)
      return []
    }
  }
}

export const sessionStorage = new DrizzleSessionStorage()
