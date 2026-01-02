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
> LaunchReady scans your products for launch issues like missing images, weak SEO titles, short descriptions, missing tags, and incomplete collection assignments. Review a readiness score and checklist per product, then apply guided fixes with confirmation. Pro users get AI-powered suggestions and bulk actions. Version history and undo support keep you confident.

### Features (3–5, each ≤80 chars)
- Readiness score and checklist for SEO, images, tags, and collections
- Guided fixes with preview and confirmation (no surprises)
- SEO preview showing Google-style title and meta description
- AI-powered suggestions for Pro (titles, descriptions, tags, alt text)
- Bulk actions with version history and undo support

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
1) Dashboard — readiness scores + product issues  
   Alt text: "LaunchReady dashboard showing product launch readiness scores"
2) Product detail — checklist + guided fix with confirmation  
   Alt text: "Product checklist with guided fix confirmation modal"
3) AI suggestions (Pro) — preview + apply flow  
   Alt text: "AI-powered suggestions preview for product title and description"

> **Asset location:** Screenshots folder at `LaunchReady_Brand_Assets_FULL/screenshots/`

---

## 4) Review package (required to speed approval)

Provide in the app submission:
- **Demo screencast** (2–5 minutes) showing:
  - Install → app open inside Admin → dashboard → product detail
  - Audit run → checklist with issues
  - Free: guided fix with confirmation modal (e.g., apply tags, add collection)
  - Free: undo / revert last fix
  - Pro: AI suggestion preview → apply
  - Pro: bulk AI actions with progress tracking
  - Settings (templates, brand voice for Pro)
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

| Plan | Price   | Trial  | AI Credits        | Key Features                                          |
|------|---------|--------|-------------------|-------------------------------------------------------|
| Free | $0      | —      | 0                 | See below                                             |
| Pro  | $19/mo  | 7 days | 100/mo (20 trial) | See below                                             |

### Free Plan (high value, safe)
- **Unlimited audits**
- Readiness score + checklist
- SEO preview
- Image readiness analyzer
- Templates (1–2 templates)
- **Guided fixes (non-AI) with confirmation modals:**
  - ✅ "Fix this one item" per product
  - ✅ "Apply recommended tags" with preview
  - ✅ "Add to default collection" with confirmation
- **Limited bulk**: max 10 products per bulk action
- **Version history**: 24 hours
- **Undo / revert last fix** for confidence
- ❌ No AI

### Pro Plan ($19/mo)
- Everything in Free, plus:
- **AI suggestions** + preview + apply
- **Monthly AI credits**: 100/mo (20 during 7-day trial)
- **Bulk AI actions** + higher batch sizes (up to 100)
- **Brand voice presets** + custom notes
- **Version history**: 30 days

#### Always-on Monitoring (LaunchReady Monitor)
- Watches for new/updated products via webhooks
- Flags regressions automatically:
  - SEO title removed/too long/too short
  - Description shortened or removed
  - Images removed or low count
  - Alt text missing
  - Tags removed
  - Collection removed
  - Custom rule violations
- Dashboard: "7 products drifted out of compliance this week"

#### Monthly Catalog Health Report
- Email + in-app monthly scorecard:
  - Overall readiness score trend
  - Top issues this month
  - Most improved products
  - Products at risk
  - Suggestions to improve
- Download: PDF/CSV export for teams

#### Catalog Standards (Custom Rules)
- Define store-wide rules:
  - "All products must have ≥ 6 images"
  - "SEO title must be 40–60 chars"
  - "Alt text required for every image"
  - "Must include required metafields"
  - "Tag set must include at least 1 from each group"
- Auto-audit: nightly/weekly scheduled checks
- Alerts when rules are violated

### AI Credit Schedule (1 credit = 1 generation attempt)

| Action | Credits | Notes |
|--------|---------|-------|
| SEO title | 1 | ~120 output tokens |
| SEO/meta description | 1 | ~250 output tokens |
| Tag suggestions | 1 | ~120 output tokens |
| Alt text (per image) | 1 | ~120 output tokens |
| Full product refresh | 3 | title + meta + tags bundle |
| Bulk SEO meta | 1/product | per product in bulk |

### Cost controls (keep AI bill < $19/mo per merchant)
- **Model**: gpt-4o-mini ($0.30/1M input, $1.20/1M output)
- **Max input tokens**: 2,000 (truncate long product data)
- **Max output tokens**: 120–700 depending on task
- **Regen limit**: 3 per field per product per day
- **Estimated cost**: ~$0.001/credit → 100 credits ≈ $0.10

**Philosophy:**
- Free = guided fixes, not "auto-run everything"
- Pro = speed + scale + automation + AI + ongoing monitoring
- Charge per generation attempt (not per apply) to prevent regen abuse

---

END
