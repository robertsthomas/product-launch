/**
 * Email Notification Service (Pro Feature)
 *
 * Sends email notifications for:
 * - Drift alerts (high severity drifts)
 * - Weekly/monthly health reports
 * - New product alerts
 *
 * Supports multiple email providers:
 * - Resend (default)
 * - SendGrid
 * - Shopify Email (via App Bridge)
 */

import { eq } from "drizzle-orm"
import { db } from "~/db"
import { catalogReports, scheduledAudits, shops } from "~/db/schema"

// Email provider type
type EmailProvider = "resend" | "sendgrid" | "console"

interface EmailConfig {
  provider: EmailProvider
  apiKey?: string
  fromEmail: string
  fromName: string
}

interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

/**
 * Get email configuration from environment
 */
function getEmailConfig(): EmailConfig {
  const provider = (process.env.EMAIL_PROVIDER || "console") as EmailProvider

  return {
    provider,
    apiKey: process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY,
    fromEmail: process.env.EMAIL_FROM || "noreply@launchready.app",
    fromName: process.env.EMAIL_FROM_NAME || "LaunchReady",
  }
}

/**
 * Send an email using the configured provider
 */
async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const config = getEmailConfig()

  try {
    switch (config.provider) {
      case "resend":
        return await sendWithResend(payload, config)
      case "sendgrid":
        return await sendWithSendGrid(payload, config)
      case "console":
      default:
        console.log("[Email] Would send email:", {
          to: payload.to,
          subject: payload.subject,
        })
        console.log("[Email] HTML:", payload.html.substring(0, 500) + "...")
        return true
    }
  } catch (error) {
    console.error("[Email] Error sending email:", error)
    return false
  }
}

/**
 * Send email using Resend
 */
async function sendWithResend(payload: EmailPayload, config: EmailConfig): Promise<boolean> {
  if (!config.apiKey) {
    console.error("[Email] Resend API key not configured")
    return false
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error("[Email] Resend error:", error)
    return false
  }

  return true
}

/**
 * Send email using SendGrid
 */
async function sendWithSendGrid(payload: EmailPayload, config: EmailConfig): Promise<boolean> {
  if (!config.apiKey) {
    console.error("[Email] SendGrid API key not configured")
    return false
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: config.fromEmail, name: config.fromName },
      subject: payload.subject,
      content: [
        { type: "text/plain", value: payload.text || payload.subject },
        { type: "text/html", value: payload.html },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error("[Email] SendGrid error:", error)
    return false
  }

  return true
}

/**
 * Get the notification email for a shop
 */
async function getShopNotificationEmail(shopDomain: string): Promise<string | null> {
  const [shop] = await db.select().from(shops).where(eq(shops.shopDomain, shopDomain)).limit(1)

  if (!shop) return null

  // Check for custom notification email in scheduled audit settings
  const [auditConfig] = await db.select().from(scheduledAudits).where(eq(scheduledAudits.shopId, shop.id)).limit(1)

  if (auditConfig?.notificationEmail) {
    return auditConfig.notificationEmail
  }

  // Fall back to shop email (would need to be stored in shop settings)
  // For now, return null and log
  console.log(`[Email] No notification email configured for ${shopDomain}`)
  return null
}

/**
 * Send a drift alert email
 */
export async function sendDriftAlertEmail(
  shopDomain: string,
  data: {
    driftsDetected: number
    productsAudited: number
  }
): Promise<boolean> {
  const email = await getShopNotificationEmail(shopDomain)
  if (!email) {
    console.log(`[Email] Skipping drift alert - no email configured for ${shopDomain}`)
    return false
  }

  const html = buildDriftAlertEmail(shopDomain, data)

  return sendEmail({
    to: email,
    subject: `[LaunchReady] ${data.driftsDetected} compliance drift${data.driftsDetected !== 1 ? "s" : ""} detected`,
    html,
    text: `${data.driftsDetected} compliance drift(s) were detected in your catalog. Log in to LaunchReady to review and resolve them.`,
  })
}

/**
 * Send a health report email
 */
export async function sendReportEmail(shopDomain: string, reportId: string): Promise<boolean> {
  const email = await getShopNotificationEmail(shopDomain)
  if (!email) {
    console.log(`[Email] Skipping report email - no email configured for ${shopDomain}`)
    return false
  }

  // Get the report data
  const [report] = await db.select().from(catalogReports).where(eq(catalogReports.id, reportId)).limit(1)

  if (!report) {
    console.error(`[Email] Report not found: ${reportId}`)
    return false
  }

  const html = buildReportEmail(shopDomain, report)

  return sendEmail({
    to: email,
    subject: `[LaunchReady] Your Catalog Health Report`,
    html,
    text: `Your catalog health report is ready. Average score: ${Math.round(report.averageScore)}%. ${report.readyProducts} of ${report.totalProducts} products are launch-ready.`,
  })
}

/**
 * Build the drift alert email HTML
 */
function buildDriftAlertEmail(shopDomain: string, data: { driftsDetected: number; productsAudited: number }): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compliance Drifts Detected</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <tr>
            <td style="padding: 32px; text-align: center; background: linear-gradient(135deg, #1f4fd8 0%, #4169e1 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                LaunchReady
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <!-- Alert Icon -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; width: 64px; height: 64px; background: #fef2f2; border-radius: 50%; line-height: 64px;">
                  <span style="font-size: 32px;">⚠️</span>
                </div>
              </div>
              
              <h2 style="margin: 0 0 16px; color: #111827; font-size: 20px; font-weight: 600; text-align: center;">
                Compliance Drifts Detected
              </h2>
              
              <p style="margin: 0 0 24px; color: #6b7280; font-size: 16px; line-height: 1.5; text-align: center;">
                ${data.driftsDetected} compliance drift${data.driftsDetected !== 1 ? "s were" : " was"} detected in your catalog.
              </p>
              
              <!-- Stats -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="50%" style="padding: 16px; background: #fef2f2; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: 700; color: #ef4444;">${data.driftsDetected}</div>
                    <div style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Drifts</div>
                  </td>
                  <td width="16"></td>
                  <td width="50%" style="padding: 16px; background: #f1f5f9; border-radius: 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: 700; color: #111827;">${data.productsAudited}</div>
                    <div style="font-size: 12px; color: #6b7280; text-transform: uppercase;">Products</div>
                  </td>
                </tr>
              </table>
              
              <div style="text-align: center;">
                <a href="https://${shopDomain}/admin/apps/launch-ready/monitoring" style="display: inline-block; padding: 14px 28px; background: #1f4fd8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Review Drifts
                </a>
              </div>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
          <tr>
            <td style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
              You received this email because drift monitoring is enabled for your store.
              <br>
              <a href="https://${shopDomain}/admin/apps/launch-ready/settings" style="color: #6b7280;">Manage notifications</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

/**
 * Build the health report email HTML
 */
function buildReportEmail(
  shopDomain: string,
  report: {
    totalProducts: number
    readyProducts: number
    averageScore: number
    driftsDetected: number
  }
): string {
  const readinessPercent =
    report.totalProducts > 0 ? Math.round((report.readyProducts / report.totalProducts) * 100) : 0

  const scoreColor = report.averageScore >= 80 ? "#22c55e" : report.averageScore >= 50 ? "#fbbf24" : "#ef4444"

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Catalog Health Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <tr>
            <td style="padding: 32px; text-align: center; background: linear-gradient(135deg, #1f4fd8 0%, #4169e1 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                LaunchReady
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 8px; color: #111827; font-size: 20px; font-weight: 600; text-align: center;">
                Catalog Health Report
              </h2>
              <p style="margin: 0 0 24px; color: #6b7280; font-size: 14px; text-align: center;">
                Your weekly catalog overview
              </p>
              
              <!-- Score -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; width: 120px; height: 120px; border-radius: 50%; background: ${scoreColor}20; line-height: 120px; border: 4px solid ${scoreColor};">
                  <span style="font-size: 36px; font-weight: 700; color: ${scoreColor};">${Math.round(report.averageScore)}%</span>
                </div>
                <p style="margin: 12px 0 0; color: #6b7280; font-size: 14px;">Average Health Score</p>
              </div>
              
              <!-- Stats Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="50%" style="padding: 16px; background: #f0fdf4; border-radius: 8px 0 0 8px; text-align: center; border-right: 2px solid #ffffff;">
                    <div style="font-size: 28px; font-weight: 700; color: #22c55e;">${report.readyProducts}</div>
                    <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Ready</div>
                  </td>
                  <td width="50%" style="padding: 16px; background: #fef2f2; border-radius: 0 8px 8px 0; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #ef4444;">${report.totalProducts - report.readyProducts}</div>
                    <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Incomplete</div>
                  </td>
                </tr>
              </table>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px; background: #f1f5f9; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: #111827;">${readinessPercent}%</div>
                    <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Catalog Readiness</div>
                  </td>
                </tr>
              </table>
              
              ${
                report.driftsDetected > 0
                  ? `
              <div style="padding: 16px; background: #fffbeb; border-radius: 8px; border-left: 4px solid #fbbf24; margin-bottom: 24px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>${report.driftsDetected} drift${report.driftsDetected !== 1 ? "s" : ""}</strong> detected this period
                </p>
              </div>
              `
                  : ""
              }
              
              <div style="text-align: center;">
                <a href="https://${shopDomain}/admin/apps/launch-ready/monitoring" style="display: inline-block; padding: 14px 28px; background: #1f4fd8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  View Full Report
                </a>
              </div>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
          <tr>
            <td style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
              You received this email as part of your scheduled health reports.
              <br>
              <a href="https://${shopDomain}/admin/apps/launch-ready/settings" style="color: #6b7280;">Manage notifications</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}
