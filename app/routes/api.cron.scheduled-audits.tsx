/**
 * Cron Endpoint for Running Scheduled Audits
 *
 * This endpoint should be called by an external cron service (e.g., Cloud Scheduler, Vercel Cron).
 * It runs all due scheduled audits and sends email notifications if configured.
 *
 * Security: Protected by a secret token in the Authorization header.
 */

import type { LoaderFunctionArgs } from "react-router"
import { sendDriftAlertEmail, sendReportEmail } from "../lib/services/email.server"
import { runAllDueAudits } from "../lib/services/scheduler.server"

// Verify the cron secret to prevent unauthorized access
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("Authorization")
  const cronSecret = process.env.CRON_SECRET

  // If no secret is configured, allow in development
  if (!cronSecret) {
    if (process.env.NODE_ENV === "development") {
      return true
    }
    console.error("[Cron] CRON_SECRET not configured")
    return false
  }

  return authHeader === `Bearer ${cronSecret}`
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  console.log("[Cron] Starting scheduled audit run")
  const startTime = Date.now()

  try {
    // Run all due audits
    const results = await runAllDueAudits()

    // Send email notifications for each result
    for (const result of results) {
      if (result.success && result.driftsDetected > 0) {
        try {
          await sendDriftAlertEmail(result.shopDomain, {
            driftsDetected: result.driftsDetected,
            productsAudited: result.productsAudited,
          })
        } catch (emailError) {
          console.error(`[Cron] Failed to send drift alert email for ${result.shopDomain}:`, emailError)
        }
      }

      if (result.success && result.reportId) {
        try {
          await sendReportEmail(result.shopDomain, result.reportId)
        } catch (emailError) {
          console.error(`[Cron] Failed to send report email for ${result.shopDomain}:`, emailError)
        }
      }
    }

    const duration = Date.now() - startTime
    const summary = {
      success: true,
      auditsRun: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      totalDriftsDetected: results.reduce((sum, r) => sum + r.driftsDetected, 0),
      durationMs: duration,
    }

    console.log(`[Cron] Completed scheduled audit run in ${duration}ms`, summary)

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[Cron] Error running scheduled audits:", error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}

// Also support POST for flexibility
export const action = loader
