**Agent Guide**

- Purpose: instructions for agentic coding assistants operating in this repository.
- Location: repository root — this file is the authoritative guide for build, lint, test, and style rules.

- **Quick Commands**
  - **build**: `pnpm run build` (runs `react-router build`).
  - **dev**: `pnpm run dev` (starts local Shopify dev server via `shopify app dev`).
  - **start (production)**: `pnpm run start` (serves `./build/server/index.js`).
  - **docker dev**: `pnpm run docker-start` (runs `npm run setup && npm run start`).
  - **db**: `pnpm run db:push` (push schema), `pnpm run db:generate`, `pnpm run db:studio`.
  - **typecheck**: `pnpm run typecheck` (runs `react-router typegen && tsc --noEmit`).

- **Lint & Format**
  - Lint: `pnpm run lint` (`biome lint .`).
  - Fix lint issues: `pnpm run lint:fix` (`biome lint --write .`).
  - Format (apply): `pnpm run format` (`biome format --write .`).
  - Format (check only): `pnpm run format:check` (`biome format .`).
  - Biome config: see `biome.json` for rules and formatter settings.

- **Running Tests**
  - Note: This repository does not include a test runner by default. There are no `test` scripts in `package.json`.
  - If you add tests, recommended runners and example single-test commands:

```bash
# Vitest (recommended for Vite/TS projects):
pnpm add -D vitest @testing-library/react
pnpm vitest        # run all tests
pnpm vitest -t "my test name"   # run single test by name

# Jest (if chosen):
pnpm add -D jest @types/jest ts-jest
pnpm jest --testNamePattern="my test name"

# Playwright / Cypress: follow their runners (use their `--grep` / test filter flags to run a single test)
```

- When adding tests, add a `test` script to `package.json` and include the chosen test runner in devDependencies.

- **How to run a single file through Biome lint/format**
  - Lint a single file: `pnpm run lint -- path/to/file.tsx`.
  - Format a single file: `pnpm run format -- path/to/file.tsx`.

- **Useful CI / deploy commands**
  - Deploy to Shopify: `pnpm run deploy:shopify`.
  - Deploy to GCP: `pnpm run deploy:gcp`.
  - Combined deploy: `pnpm run deploy:all`.

**Style & Code Guidelines**

- **Formatting (automatic)**
  - Biome is the primary linter/formatter. See `biome.json` for canonical settings.
  - Key formatter settings (from `biome.json`): 2 spaces, lineWidth 120, double quotes, trailing commas `es5`, semicolons `asNeeded`.
  - Editor should respect `.editorconfig` (utf-8, indent_size=2, insert final newline).

- **Imports**
  - Use organized import groups and rely on `biome` organizeImports. Preferred ordering:
    1. External packages (node_modules)
    2. Absolute project aliases (if configured via `tsconfig`/Vite paths)
    3. Relative imports from parent/relative directories
    4. Styles and assets (css/images) last
  - Keep imports minimal: import only what you use.
  - Prefer named imports over default when a module exposes multiple utilities.

- **TypeScript & Types**
  - Always enable `--noEmit` typecheck in CI; use `pnpm run typecheck` locally.
  - Prefer explicit return types on exported functions and module-level APIs (e.g. `async function foo(): Promise<Foo>`).
  - Minimize `any`. If `any` is necessary, add a short comment explaining why and mark as technical debt.
  - Avoid unnecessary non-null assertions (`!`). Prefer narrowing checks or returning `null | undefined` explicitly.
  - Keep types close to the code that uses them. Use `types.ts` files for shared domain types (see `app/lib/checklist/types.ts`).

- **Naming Conventions**
  - Files and directories: kebab-case or dot-separated where present (follow existing layout in `app/routes`).
  - Variables & functions: camelCase.
  - React components & types/interfaces: PascalCase (e.g. `ProductCard`, `CatalogReport`)
  - Constants: UPPER_SNAKE for environment-level constants; otherwise `camelCase` for module-scoped constants.
  - Database entities / Drizzle definitions: follow the existing `db/schema.ts` naming; table names are plural where applicable.

- **React / UI**
  - Components: small, focused, and typed props. Prefer `FC`-style implicit return only for simple components; otherwise declare props interface explicitly.
  - Keep presentation and data-fetching separate: loader/server functions should live alongside routes (see `app/routes/*`) and UI should consume `useLoaderData`.
  - Side effects (fetching, session) belong in server/loader functions, not inside render-only components.

- **Error Handling & Logging**
  - Catch and surface errors early. Wrap external calls (Shopify API, OpenAI/OpenRouter, DB operations) with try/catch and return a meaningful error type.
  - Do not swallow errors silently. Log errors with context (shop id, request id) and rethrow or return a structured error to the caller.
  - Use `throw new Response(...)` or framework-specific error handlers for route errors so the client receives proper status codes.
  - Add telemetry hooks or Sentry integration if available — annotate errors with actionable metadata.

- **Performance & Safety**
  - Avoid large synchronous CPU tasks on the main event loop (use background jobs or Cloud Run async patterns).
  - Rate-limit external API calls and add retry/backoff logic for transient failures.
  - Sanitize inputs from webhooks and external sources before using them in DB queries or API calls.

- **Secrets & Environment**
  - Do not commit secrets. Use `.env` for local development and cloud secret managers for deployment.
  - Required envs are documented in `README.md` (OPENROUTER_API_KEY, SHOPIFY_API_SECRET, etc.).

**Repository Conventions & Files to Read**

- Biome config: `biome.json` — canonical linter/formatter rules.
- Editor config: `.editorconfig` — editor-level rules.
- Prettier ignore: `.prettierignore` — files excluded from formatting.
- Package scripts: `package.json` — all runnable commands.

**Cursor / Copilot Rules**

- Cursor MCP config: `.cursor/mcp.json` — defines dev MCP server used by Cursor tooling. Current content:

```json
{
  "mcpServers": {
    "shopify-dev-mcp": {
      "command": "npx",
      "args": ["-y", "@shopify/dev-mcp@latest"],
      "env": {
        "POLARIS_UNIFIED": "true",
        "LIQUID": "true"
      }
    }
  }
}
```

- Copilot instructions: `.github/copilot-instructions.md` — follow these rules when using GitHub Copilot:

```
Be concise.
No explanations unless I ask.
Prefer patches/diffs over full files.
When coding, output only the changed lines or a unified diff.
If you must output code, keep it minimal and do not repeat unchanged code.
Limit responses to ~150-250 tokens unless I ask for more.
```

**When You Are Uncertain**

- If a rule is ambiguous, follow existing patterns in the repository (read the surrounding folder file styles) and prefer minimal, well-typed changes.
- Only ask a human when a change is destructive, security-sensitive, or requires credentials/billing changes.

**Next Steps Agents Might Take**

- Run `pnpm install` then `pnpm run lint` and `pnpm run typecheck` to validate a branch.
- Add tests: pick `vitest` for Vite/TS ecosystems and add `test` script to `package.json`.
- For large refactors: run `pnpm run format` and `pnpm run lint:fix` before opening a PR.
