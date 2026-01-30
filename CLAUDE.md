# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Launch Ready is a Shopify app that automatically checks products against configurable launch checklists and provides AI-powered auto-fixes. Built with React Router (Remix-style), TypeScript, SQLite (Drizzle ORM), and integrates with Shopify's Admin GraphQL API.

## Development Commands

```bash
# Development
pnpm dev                    # Start dev server with Shopify CLI
pnpm build                  # Build for production

# Database (Drizzle ORM)
pnpm db:push                # Push schema changes to database (development)
pnpm db:generate            # Generate migration files from schema
pnpm db:studio              # Open Drizzle Studio to browse data

# Code Quality
pnpm check                  # Run all Biome checks (lint + format)
pnpm check:fix              # Auto-fix all Biome issues
pnpm lint                   # Lint only
pnpm lint:fix               # Fix lint issues
pnpm format                 # Format code
pnpm typecheck              # Type check without emit

# GraphQL
pnpm graphql-codegen        # Generate TypeScript types from GraphQL operations

# Deployment
pnpm deploy:shopify         # Deploy app configuration to Shopify
pnpm deploy:gcp             # Deploy to Google Cloud Run
pnpm deploy:all             # Deploy both Shopify config and GCP
pnpm logs:gcp               # View GCP logs

# Shopify CLI
pnpm config:link            # Link to Shopify app
pnpm config:use             # Switch app configurations
pnpm generate               # Generate new extensions
```

## Architecture

### Framework & Routing
- **React Router v7** (Remix-style) with flat file-based routing
- Routes in `app/routes/` use flat naming: `app._index.tsx`, `app.products.$id.tsx`, `webhooks.products.create.tsx`
- API routes return JSON, app routes return React components
- Server-only code marked with `.server.ts` suffix

### Database (Drizzle ORM + SQLite)
- Schema defined in `app/db/schema.ts` - single source of truth
- Key tables:
  - `shops` - Shop configuration, billing, AI usage tracking
  - `checklistTemplates` - Configurable checklist templates (apparel, POD, digital, etc.)
  - `checklistItems` - Individual rules in templates
  - `productAudits` - Audit results with pass/fail status
  - `productFieldVersions` - Version history for product changes
  - `productHistory` - Activity log of all changes
- **Workflow**: Modify `schema.ts` → run `pnpm db:push` (dev) or `pnpm db:generate` → `pnpm db:push` (production)
- Database client: `app/db/index.ts`
- Session storage adapter: `app/db/session-storage.ts`

### Checklist Engine
Located in `app/lib/checklist/`:
- `types.ts` - Core types (`Product`, `ChecklistRule`, `RuleResult`)
- `rules.ts` - Individual rule implementations (title, images, SEO, etc.)
- `engine.ts` - Rule runner that evaluates products

Rules return `RuleResult` with:
- `status`: "passed" | "failed"
- `canAutoFix`: boolean
- `fixType`: "manual" | "auto" | "ai"
- `targetField`: which field the rule checks (seo_title, images, etc.)

### AI Integration
Located in `app/lib/ai/`:
- `openai.server.ts` - OpenAI/OpenRouter client with fallback support
- `prompts.ts` - Centralized AI prompt templates
- Supports both app-provided API keys and user-provided keys
- AI features: SEO titles/descriptions, alt text, tags, product descriptions, image generation
- Models: OpenRouter (preferred), OpenAI (fallback), Kie.ai (image generation)

### Billing & Subscriptions
Located in `app/lib/billing/`:
- `constants.ts` - Plan configuration (Free vs Pro)
- `billing.server.ts` - Shopify Billing API integration
- `ai-gating.server.ts` - AI usage tracking and credit enforcement
- Free plan: No AI, 10 product bulk limit
- Pro plan ($19/mo): 100 AI credits/month, unlimited bulk operations, brand voice, scheduled audits

### Core Services
Located in `app/lib/services/`:
- `audit.server.ts` - Product auditing engine (run checklist rules)
- `autofix.server.ts` - Apply fixes to products via GraphQL mutations
- `shop.server.ts` - Shop initialization and configuration
- `history.server.ts` - Record audit/fix activity
- `version.server.ts` - Track product field changes over time
- `rules.server.ts` - Manage checklist rules and templates
- `scheduler.server.ts` - Scheduled audit background jobs
- `reports.server.ts` - Generate compliance reports

### Key Routes
- `app._index.tsx` - Main dashboard with product list and stats
- `app.products.$id.tsx` - Product detail view with checklist and AI suggestions
- `app.settings.tsx` - Settings page (rules, billing, brand voice, integrations)
- `app.plans.tsx` - Pricing page with upgrade flow
- `api.products.$id.autofix.tsx` - Apply single auto-fix
- `api.products.$id.suggest.tsx` - Generate AI suggestions
- `api.bulk-fix.tsx` - Bulk fix multiple products
- `webhooks.products.create.tsx` - Auto-audit on product creation
- `webhooks.products.update.tsx` - Auto-audit on product update

### Shopify Admin Extensions
Located in `extensions/`:
- `launch-checklist-action/` - Admin action on product detail page
- `product-score-block/` - Admin block showing product score
- Built with Shopify UI Extensions, configured in `shopify.extension.toml`

## Environment Variables

Required:
```bash
SHOPIFY_API_KEY           # From Partner Dashboard
SHOPIFY_API_SECRET        # From Partner Dashboard
SHOPIFY_APP_HANDLE        # App handle
```

AI Configuration (at least one required for AI features):
```bash
# Preferred: OpenRouter (300+ models)
OPENROUTER_API_KEY        # Main AI provider
OPENROUTER_MODEL          # Default: openrouter/auto
OPENROUTER_IMAGE_MODEL    # For vision/alt text

# Fallback: Direct OpenAI
OPENAI_API_KEY            # OpenAI direct access
OPENAI_MODEL              # Default: gpt-4o-mini

# Image generation
KIE_API_KEY               # Kie.ai for image generation
```

## Code Patterns

### Fetching Product Data
Use the GraphQL client from `@shopify/shopify-app-react-router`:
```typescript
const admin = await authenticate.admin(request)
const response = await admin.graphql(`
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      seo { title description }
      images(first: 10) { nodes { id url altText } }
    }
  }
`, { variables: { id: productId } })
```

### Running Audits
```typescript
import { auditProduct } from "~/lib/services/audit.server"

const audit = await auditProduct({
  shopDomain: shop,
  productId: "gid://shopify/Product/123",
  product: productData,
  admin: admin.graphql,
})
```

### Applying Auto-Fixes
```typescript
import { applyAutoFix } from "~/lib/services/autofix.server"

await applyAutoFix({
  shopDomain: shop,
  productId: "gid://shopify/Product/123",
  checklistItemKey: "seo_title",
  admin: admin.graphql,
})
```

### AI Generation
```typescript
import { generateAISuggestion } from "~/lib/ai"

const suggestion = await generateAISuggestion({
  type: "seo_title",
  product: productData,
  shopDomain: shop,
})
```

## Testing Locally

1. Install dependencies: `pnpm install`
2. Push database schema: `pnpm db:push`
3. Create `.env` file with required variables
4. Start dev server: `pnpm dev`
5. Install app on development store via provided URL
6. Create/update products to trigger audits

## Deployment

The app deploys to Google Cloud Run:
- Docker-based deployment using `Dockerfile`
- Build configuration in `cloudbuild.yaml`
- SQLite database persists in Cloud Run instance
- Deploy with: `pnpm deploy:gcp`

## Important Notes

- **Database migrations**: Always use `pnpm db:push` for schema changes in development. For production, generate migrations with `pnpm db:generate` first.
- **Webhooks**: Registered in `shopify.app.toml`. Products are auto-audited on create/update if enabled in shop settings.
- **AI Credits**: Tracked per-shop in `shops.aiCreditsUsed`. Credits reset monthly for Pro users.
- **Version History**: Product field changes are tracked in `productFieldVersions` table. Retention period depends on plan (24 hours Free, 30 days Pro).
- **Checklist Templates**: Templates can be business-type specific (apparel, POD, digital). Users can customize rules per template.
- **GraphQL Types**: Run `pnpm graphql-codegen` after modifying GraphQL operations in `app/` to regenerate types.
