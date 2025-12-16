# Product Launch Checklist + Automator

Never forget a step when launching a new product again. This Shopify app checks every new/updated product against your launch checklist and auto-fixes what it can.

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
- Add alt text to images
- Add products to collections

### 🤖 AI-Powered Suggestions
- **SEO Titles**: AI-generated, keyword-optimized titles
- **SEO Descriptions**: Compelling meta descriptions (120-155 chars)
- **Product Descriptions**: Full conversion-focused product copy
- **Tags**: Intelligent tag suggestions based on product data
- Edit suggestions before applying, or apply with one click

### 📊 Launch Dashboard
- See all products and their launch status at a glance
- Filter by Ready/Incomplete
- View completion statistics
- Click into any product for detailed checklist view

## Tech Stack

- **Framework**: React Router (Remix-style) + TypeScript
- **UI**: Shopify Polaris web components
- **Database**: SQLite via Drizzle ORM
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
   cd product-launch
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

### Database Commands

```bash
# Push schema to database (creates/updates tables)
pnpm db:push

# Generate migrations from schema changes
pnpm db:generate

# Open Drizzle Studio to browse data
pnpm db:studio
```

### Environment Variables

Create a `.env` file with:

```bash
# Required for AI suggestions
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_IMAGE_MODEL=gpt-4o-mini

# Shopify (auto-configured by CLI)
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
```

The app works without `OPENAI_API_KEY` but AI features will be disabled.

### Configuration

The app requires the following Shopify API scopes:
- `read_products` - Read product data for auditing
- `write_products` - Update products for auto-fix features
- `read_metaobjects` - Read metafield data
- `read_content` - Read SEO fields

## Project Structure

```
app/
├── db/
│   ├── schema.ts            # Drizzle schema (all tables)
│   ├── index.ts             # Database client
│   └── session-storage.ts   # Shopify session storage adapter
├── lib/
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
│   ├── app.settings.tsx     # Settings page
│   ├── app.tsx              # App layout
│   └── webhooks.products.*.tsx  # Webhook handlers
└── ...
```

## Checklist Rules

The default checklist includes:

| Rule | Description | Auto-fixable |
|------|-------------|--------------|
| Product Title | Min 10 characters | ❌ |
| Description | Min 50 characters | ❌ |
| Images | At least 3 images | ❌ |
| Alt Text | All images have alt text | ✅ |
| SEO Title | Custom SEO title set | ✅ |
| SEO Description | Min 80 characters | ✅ |
| Collections | In at least 1 collection | ✅ |
| Product Type | Product type set | ❌ |
| Vendor | Vendor/brand set | ❌ |
| Tags | At least 1 tag | ❌ |

## Webhooks

The app subscribes to:
- `products/create` - Audit new products
- `products/update` - Re-audit updated products

## Development

### Adding New Rules

1. Create the rule function in `app/lib/checklist/rules.ts`:
   ```typescript
   export const myNewRule: ChecklistRule = ({ product, config }) => {
     // Your validation logic
     if (/* passes */) {
       return { status: "passed" };
     }
     return {
       status: "failed",
       details: "Why it failed",
       canAutoFix: false,
     };
   };
   ```

2. Add to the rules map:
   ```typescript
   export const rulesMap: Record<string, ChecklistRule> = {
     // ...existing rules
     my_new_rule: myNewRule,
   };
   ```

3. Add default item in `app/lib/checklist/types.ts`:
   ```typescript
   export const DEFAULT_CHECKLIST_ITEMS: ChecklistItemInput[] = [
     // ...existing items
     {
       key: "my_new_rule",
       label: "My New Rule",
       description: "What this rule checks",
       configJson: JSON.stringify({}),
       autoFixable: false,
       order: 11,
     },
   ];
   ```

### Adding Auto-Fix Support

1. Create fix function in `app/lib/services/autofix.server.ts`:
   ```typescript
   async function fixMyRule(
     product: Product,
     admin: AdminGraphQL
   ): Promise<{ success: boolean; message: string }> {
     // Apply the fix via GraphQL mutation
     return { success: true, message: "Fixed!" };
   }
   ```

2. Add to the autoFixMap:
   ```typescript
   const autoFixMap: Record<string, AutoFixFn> = {
     // ...existing
     my_new_rule: fixMyRule,
   };
   ```

### Database Schema Changes

When you modify the schema in `app/db/schema.ts`:

```bash
# Option 1: Push changes directly (dev)
pnpm db:push

# Option 2: Generate and apply migrations (production)
pnpm db:generate
# Then apply with your deployment process
```

## Drizzle ORM

This app uses Drizzle ORM for database access. The schema is fully TypeScript-first:

```typescript
// Example query
const audits = await db.query.productAudits.findMany({
  where: eq(productAudits.shopId, shopId),
  with: {
    items: {
      with: { item: true }
    }
  }
});
```

Key benefits:
- TypeScript-first with full type inference
- Schema is code (no separate schema files)
- Lightweight and fast
- Relational queries with `with` syntax

## License

MIT
