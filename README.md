# Launch Ready

**Never forget a step when launching a new product again.** Launch Ready is a Shopify app that checks every new/updated product against your launch checklist and auto-fixes what it can using AI.

## Features

### 🔍 Automated Product Scanning
- Products are automatically evaluated when created or updated
- Scans your entire catalog with one click
- Real-time dashboard showing launch readiness

### ✅ Configurable Checklist Rules
- **Title & Description**: Ensure products have descriptive content
- **Images**: Verify minimum image count and alt text
- **SEO**: Check for SEO titles and meta descriptions
- **Collections**: Ensure products are organized
- **Tags & Product Type**: Verify proper categorization

### ⚡ One-Click Auto-Fix
- Generate SEO titles from product names
- Create SEO descriptions automatically
- Add alt text to images using AI
- Add products to collections

### 🤖 AI-Powered Suggestions
- **SEO Titles**: AI-generated, keyword-optimized titles
- **SEO Descriptions**: Compelling meta descriptions (120-155 chars)
- **Product Descriptions**: Full conversion-focused product copy
- **Tags**: Intelligent tag suggestions based on product data
- **Image Alt Text**: Automatic accessibility descriptions
- **Product Images**: AI-generated product imagery
- Edit suggestions before applying, or apply with one click

### 📊 Launch Dashboard
- See all products and their launch status at a glance
- Filter by Ready/Incomplete
- View completion statistics
- Click into any product for detailed checklist view

## Plans

| Feature | Free | Pro ($19/mo) |
|---------|------|--------------|
| Product scanning | ✅ | ✅ |
| Manual fixes | ✅ | ✅ |
| AI suggestions | ❌ | 100/month |
| AI image generation | ❌ | ✅ |

## Tech Stack

- **Framework**: React Router (Remix-style) + TypeScript
- **UI**: Custom components with Shopify App Bridge
- **Database**: SQLite via Drizzle ORM
- **AI**: OpenAI GPT-4.1-mini for text, Kie.ai for images
- **Shopify Integration**: Admin GraphQL API + Webhooks

## Getting Started

### Prerequisites

- Node.js 20.x or later
- pnpm (recommended) or npm
- Shopify Partner account
- Development store
- OpenAI API key (for AI-powered suggestions)

### Installation

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd launch-ready
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Push the database schema:
   ```bash
   pnpm db:push
   ```

4. Start the development server:
   ```bash
   pnpm dev
   ```

### Environment Variables

Create a `.env` file with:

```bash
# Required for AI suggestions
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-4.1-mini

# Optional: Kie.ai for image generation
KIE_API_KEY=your-kie-api-key

# Shopify app handle (from Partner Dashboard)
SHOPIFY_APP_HANDLE=your-app-handle

# Shopify (auto-configured by CLI)
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
```

The app works without `OPENAI_API_KEY` but AI features will be disabled.

### Database Commands

```bash
# Push schema to database (creates/updates tables)
pnpm db:push

# Generate migrations from schema changes
pnpm db:generate

# Open Drizzle Studio to browse data
pnpm db:studio
```

## Deployment

### Google Cloud Run

See the [deployment guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run) for detailed instructions.

Quick deploy:
```bash
# Set up environment
export PROJECT_ID="launch-ready-app"
export SERVICE_NAME="launch-ready"
export REGION="us-central1"

# Create project and enable APIs
gcloud projects create $PROJECT_ID
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

# Deploy
gcloud run deploy $SERVICE_NAME --source . --region $REGION --allow-unauthenticated
```

## Project Structure

```
app/
├── db/
│   ├── schema.ts            # Drizzle schema (all tables)
│   ├── index.ts             # Database client
│   └── session-storage.ts   # Shopify session storage adapter
├── lib/
│   ├── ai/                  # AI integrations
│   │   ├── openai.server.ts # OpenAI API client
│   │   └── prompts.ts       # AI prompt templates
│   ├── billing/             # Subscription & billing
│   │   ├── billing.server.ts
│   │   ├── ai-gating.server.ts
│   │   └── constants.ts
│   ├── checklist/           # Checklist engine
│   │   ├── types.ts         # Type definitions
│   │   ├── rules.ts         # Individual checklist rules
│   │   └── engine.ts        # Rule runner
│   └── services/            # Business logic
│       ├── shop.server.ts   # Shop initialization
│       ├── audit.server.ts  # Product auditing
│       └── autofix.server.ts # Auto-fix actions
├── routes/
│   ├── app._index.tsx       # Main dashboard
│   ├── app.products.$id.tsx # Product detail view
│   ├── app.plans.tsx        # Pricing plans
│   ├── app.settings.tsx     # Settings page
│   └── webhooks.*.tsx       # Webhook handlers
└── ...
```

## Checklist Rules

| Rule | Description | Auto-fixable |
|------|-------------|--------------|
| Product Title | Min 10 characters | ❌ |
| Description | Min 50 characters | ✅ (AI) |
| Images | At least 3 images | ✅ (AI) |
| Alt Text | All images have alt text | ✅ (AI) |
| SEO Title | Custom SEO title set | ✅ (AI) |
| SEO Description | Min 80 characters | ✅ (AI) |
| Collections | In at least 1 collection | ✅ |
| Product Type | Product type set | ❌ |
| Vendor | Vendor/brand set | ❌ |
| Tags | At least 1 tag | ✅ (AI) |

## License

MIT
