# LaunchReady — Shopify App Store Listing Requirements + Compliant Copy
> Use this doc to implement and validate our Shopify App Store listing fields, screenshots, and review package.
> Source docs:
> - App Store requirements: https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
> - App introduction requirements: https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements#4-app-introduction
> - Best practices: https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices

---

## 1) What Shopify is looking for (do not violate)

### Hard rules (common rejection causes)
- **No “best/first/only” claims**, no guarantees, no results-based statements (no stats like “increase sales 30%”).
- **No pricing** in intro/details/screenshots/icon.
- **No links/URLs** inside App details.
- **No keyword stuffing**. Keep it readable.
- **No PII** in screenshots (names, emails, store data).
- **No Shopify branding misuse** in icons or screenshots (don’t use Shopify logo as your own).
- Provide a **review package**: demo screencast + valid test credentials.

### Field length constraints (enforce in code / CI)
- **App introduction:** ≤ 100 characters
- **App details:** ≤ 500 characters
- **Features:** 3–5 items, each ≤ 80 characters
- **Subtitle:** ≤ 62 characters
- **Search terms:** 1–5 terms, each ≤ 20 characters

---

## 2) Listing copy (Shopify-compliant, ready to paste)

### App name
**LaunchReady**

### App introduction (≤100 chars) — pick ONE
Option A:
> Audit product listings before you publish. Fix SEO, images, tags, and collections with AI help.
Option B:
> Find launch-blocking product issues fast. Improve SEO, images, and tags with guided fixes and AI.
Option C:
> Catch missing SEO and product details before launch. Fix in bulk and generate content with AI.

### App details (≤500 chars)
> LaunchReady scans your products for launch issues like missing images, weak SEO titles, short descriptions, missing tags, and incomplete collection assignments. Review a readiness score and checklist per product, then apply guided fixes or generate improved titles, descriptions, tags, alt text, and images with AI. Bulk actions let you update multiple products with progress tracking, undo support, and version history.

### Features (3–5, each ≤80 chars)
- Readiness score and checklist for SEO titles, descriptions, tags, and images
- SEO preview showing Google-style title and meta description before publish
- AI suggestions for titles, descriptions, tags, alt text, and product images
- Bulk actions to fix selected products with progress, batching, and undo support
- Brand voice presets and custom notes to keep AI content on-brand

### App card subtitle (≤62 chars) — pick ONE
Option A:
> Launch readiness checks and AI fixes for product SEO
Option B:
> Product SEO and listing audits with readiness scores
Option C:
> Pre-launch product audits for SEO, images, tags, collections

### Search terms (1–5 terms, each ≤20 chars)
- product SEO
- image alt text
- product audit
- launch checklist
- bulk editing

---

## 3) Screenshot set requirements + recommended set

### Screenshot rules (enforce)
- Crop browser chrome / avoid clutter.
- Remove or mask any PII.
- Do not include pricing, reviews, or “results” claims.
- Ensure each screenshot communicates ONE feature clearly.
- Provide alt text for each screenshot (keep concise).

### Recommended 3 screenshots (minimum viable set)
1) Dashboard — readiness scores + issues summary  
   Alt text: "LaunchReady dashboard showing launch readiness scores"
2) Product detail — checklist + fix actions  
   Alt text: "Product checklist with SEO and content issues"
3) AI preview — generate + apply flow  
   Alt text: "AI suggestions to improve product title and description"

> **Asset location:** Screenshots folder at `LaunchReady_Brand_Assets_FULL/screenshots/`

---

## 4) Review package (required to speed approval)

Provide in the app submission:
- **Demo screencast** (2–5 minutes) showing:
  - Install → app open inside Admin → dashboard → product detail
  - Audit run → checklist failures → apply a fix
  - AI suggestion preview → apply
  - Bulk fix flow (confirm + progress)
  - Settings (template + brand voice)
- **Test credentials** for Shopify review team:
  - If required, provide a test store and/or staff account credentials.
  - Ensure the app works in that environment without manual setup.

---

## 5) "Do not get rejected" checklist (pre-submit QA)

Before submission, verify:
- [ ] No pricing shown in intro/details/screenshots/icon.
- [ ] No superlatives ("best", "#1") or outcome claims ("increase sales").
- [ ] No URLs inside the App details text.
- [ ] No PII in screenshots.
- [ ] Polaris UI usage is consistent and feels native.
- [ ] Required scopes are minimal and justified.
- [ ] App uninstall cleanup exists (delete shop data / revoke tokens).
- [ ] Billing flow works (trial → paid → cancel → downgrade).
- [ ] Review package includes screencast + working credentials.
- [ ] Admin extensions (product score block, launch checklist action) work correctly.

---

## 6) Implementation notes for engineers (how to enforce)

### Add a “listing validation” utility (optional but recommended)
Create a script that:
- Validates character limits for intro/details/subtitle/features/search terms
- Blocks merge if limits are exceeded
- Greps for disallowed phrases: “best”, “#1”, “increase”, “guarantee”, “ROI”, “%”
- Greps for “http://” or “https://” inside App details content

Example pseudo-checks:
- intro.length <= 100
- details.length <= 500
- subtitle.length <= 62
- features.length between 3 and 5
- each feature.length <= 80
- searchTerms.length between 1 and 5
- each searchTerm.length <= 20

---

## 7) Category suggestion
Recommend choosing the category that best matches:
- Product listing audits and content quality
- SEO and product page readiness

(Decide during submission; avoid miscategorizing.)

---

## 8) Current pricing reference (do NOT include in listing)

For internal reference only — actual pricing from `app/lib/billing/constants.ts`:

| Plan    | Price   | Trial | AI Credits     | Key Features                              |
|---------|---------|-------|----------------|-------------------------------------------|
| Free    | $0      | —     | 0              | Audits only (20/month), no auto-fix       |
| Starter | $12/mo  | 7 days| 0              | Unlimited audits, auto-fix, version history (24h) |
| Pro     | $39/mo  | 7 days| 100/mo (15 trial) | All features, AI generation, bulk AI, 30-day history |

---

END
