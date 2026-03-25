# AGENTS.md — OpenCoder

OpenCoder is a web app that runs an AI coding agent on any GitHub repository from
the browser. Users authenticate via GitHub OAuth, pick a repo, describe a task, and
a cloud-hosted agent (OpenCode + Claude) streams results back in real time.

## Stack

- **Framework**: TanStack Start (React 19 SSR) + TanStack Router (file-based routing)
- **Realtime sync**: Electric SQL → TanStack DB (Postgres logical replication to browser)
- **Background tasks**: Trigger.dev (long-running agent sessions, up to 1 hour)
- **AI agent**: OpenCode SDK (wraps Claude via Vercel AI Gateway)
- **Auth**: Better Auth with GitHub OAuth
- **Database**: PostgreSQL (Neon) + Drizzle ORM
- **Styling**: Tailwind CSS v4 + shadcn/ui (New York style, Zinc base, Lucide icons)
- **Validation**: Zod v4

## Build / Lint / Test Commands

```bash
npm run dev              # Vite dev server on port 3000
npm run build            # Production build
npm run check            # Biome check (lint + format combined)
npm run lint             # Biome lint only
npm run format           # Biome format only
npm run test             # vitest run (all tests)
npx vitest run path/to/file.test.ts          # Run a single test file
npx vitest run -t "test name"                # Run a single test by name
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run Drizzle migrations
npm run db:push          # Push schema directly to database
```

Always run `npm run check` before committing. It enforces both lint rules and
formatting in a single pass.

## Commit Policy

Every commit **must** include its corresponding OpenCode plan. Before committing,
create a plan using `opencode plan` that describes the changes, then reference it
in the commit. Do not make commits without an associated plan.

## Code Style

### Formatter & Linter — Biome (sole tool, no Prettier/ESLint)

- **Indent**: Tabs (not spaces)
- **Quotes**: Double quotes for JS/TS
- **Linter rules**: Biome `recommended` ruleset
- **Import ordering**: Automatic via Biome `organizeImports`
- Biome scope: `src/**/*`, `.vscode/**/*`, `index.html`, `vite.config.ts`
- Excluded from Biome: `src/routeTree.gen.ts` (auto-generated), `src/styles.css`

### TypeScript Configuration

- `strict: true` with `noUnusedLocals`, `noUnusedParameters`
- `verbatimModuleSyntax: true` — use `import type { ... }` for type-only imports
- `target: ES2022`, bundler module resolution
- `.ts` extensions are allowed in import specifiers

### Import Conventions

Biome auto-sorts imports. Follow this general grouping:

1. Node built-ins (`import { rmSync } from "node:fs"`)
2. Third-party packages (`@tanstack/*`, `react`, `zod`, etc.)
3. Internal via `#/` alias (`import { db } from "#/db/index.ts"`)
4. Relative siblings (`import { ChatFooter } from "./ChatFooter"`)

The `#/*` path alias maps to `./src/*` (configured in both `tsconfig.json` paths
and `package.json` imports). Prefer `#/` over `@/` — both resolve identically but
`#/` is the convention used throughout the codebase.

### Naming Conventions

| Element              | Convention     | Example                             |
|----------------------|---------------|-------------------------------------|
| Source files         | `kebab-case`  | `auth-helpers.ts`, `clone-repo.ts`  |
| React components     | `PascalCase`  | `ChatView.tsx`, `RepoSelector.tsx`  |
| shadcn/ui components | `kebab-case`  | `button.tsx`, `card.tsx`            |
| Route files          | TanStack conv | `_authed.tsx`, `chat.$sessionId.tsx`|
| Directories          | `kebab-case`  | `db-collections/`, `tanstack-query/`|
| Variables/functions  | `camelCase`   | `dbWriter`, `handleSubmit`          |
| Types & interfaces   | `PascalCase`  | `StreamEvent`, `ToolState`          |
| Constants            | `UPPER_SNAKE` | `DEFAULT_MODEL`, `SESSION_COLUMNS`  |
| DB schema exports    | `camelCase`   | `userProfiles`, `agentSessions`     |

### Types vs Interfaces

- Use `type` by default for type aliases, unions, and utility types.
- Use `interface` for component props and complex object shapes describing
  API contracts (e.g., `interface ChatViewProps`, `interface CloneResult`).
- Discriminated unions use a string literal `type` field:
  ```typescript
  type StreamEvent =
    | { type: "part-update"; partId: string; content: string }
    | { type: "status"; status: string };
  ```

### Error Handling

- **API routes**: `try/catch` with `error: unknown`, narrow via `instanceof Error`:
  ```typescript
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to start session";
    return Response.json({ error: message }, { status: 500 });
  }
  ```
- **Trigger.dev tasks**: Use `logger.error(...)` with structured context.
- **Best-effort cleanup**: Empty `catch {}` with a `/* Best-effort */` comment.
- **Auth validation**: Return `Response` objects on failure, not exceptions:
  ```typescript
  async function validateAgentAuth(req: Request): Promise<{ userId: string } | Response>
  ```
- **Client-side**: Set error state via React — `setError(err instanceof Error ? err.message : "...")`.
- Use `// biome-ignore lint/suspicious/noExplicitAny: <reason>` when SDK types are opaque.

## Project Structure

```
src/
  components/          # React components
    chat/              # Chat UI (ChatView, SessionSidebar, ToolCall, etc.)
    ui/                # shadcn/ui primitives (button, card, dialog, etc.)
  db/                  # Drizzle DB instance + schema (5 tables)
  hooks/               # Custom React hooks
  integrations/        # Third-party provider wrappers (TanStack Query, Better Auth)
  lib/                 # Shared utilities, auth helpers, display-item pipeline
  routes/              # TanStack Router file-based routes
    api/               # Server API endpoints (agent/, github/, shapes/, webhook/)
    _authed/           # Auth-gated pages (dashboard, chat)
  trigger/             # Trigger.dev background tasks
    lib/               # Task helpers (clone, DB writer, event handler, etc.)
```

Key files:
- `src/db/schema.ts` — Drizzle schema (user_profiles, repositories, agent_sessions, session_events)
- `src/lib/auth.ts` — Better Auth server config
- `src/lib/collections.ts` — Electric SQL / TanStack DB collection definitions
- `src/lib/display-items.ts` — StreamEvent → DisplayItem rendering pipeline
- `src/trigger/run-session.ts` — Main Trigger.dev task (orchestrates the agent)
- `trigger.config.ts` — Trigger.dev config (custom Docker build, 1hr max duration)
- `src/routeTree.gen.ts` — Auto-generated by TanStack Router; never edit manually

## Testing

Test infra is configured but test files do not yet exist. When adding tests:

- Place test files next to the source: `foo.ts` → `foo.test.ts`
- Use Vitest (`vitest run`) with `@testing-library/react` for component tests
- jsdom is configured as the test environment

## shadcn/ui

Install new components with:
```bash
pnpm dlx shadcn@latest add <component>
```
Components go to `src/components/ui/`. Style: New York, base color: Zinc.
Uses `#/lib/utils` for the `cn()` helper (clsx + tailwind-merge).

## Route Files

TanStack Router uses file-based routing in `src/routes/`. The route tree is
auto-generated into `src/routeTree.gen.ts` — never edit it by hand.

- `__root.tsx` — Root layout (HTML shell, providers)
- `_authed.tsx` — Auth-gated layout wrapper (redirects unauthenticated users)
- `_authed/chat.$sessionId.tsx` — Dynamic route for active chat sessions
- `api/**/*.ts` — Server-only API routes (createAPIFileRoute)

## Environment

See `.env.example` for required variables. Key ones: `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`TRIGGER_SECRET_KEY`, `ELECTRIC_URL`, `AI_GATEWAY_API_KEY`.
