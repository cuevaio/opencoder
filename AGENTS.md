# AGENTS.md — opencoder

This repository is built and maintained with OpenCode workflows.
Use OpenCode-oriented instructions and avoid Cursor- or Claude-Code-specific assumptions.

## Project Summary

opencoder is a web app that runs AI coding sessions against GitHub repositories.
Users authenticate with GitHub, select a repo, start a task, and stream results in real time.

Core stack:
- TanStack Start + TanStack Router (file-based routing, React 19 SSR)
- Trigger.dev for long-running background sessions
- OpenCode SDK for agent execution
- Better Auth (GitHub OAuth)
- Drizzle ORM + PostgreSQL (Neon)
- Electric SQL + TanStack DB collections for realtime sync
- Tailwind CSS v4 + shadcn/ui
- Zod for validation

## Tooling and Package Manager

- Package manager/runtime: Bun (`bun.lock` is present)
- Build tool: Vite
- Lint/format: Biome
- Tests: Vitest (`jsdom` environment)
- Migrations: Drizzle Kit

Prefer Bun commands in docs, scripts, and agent instructions.

## Build / Lint / Test Commands

Use these from repo root:

```bash
bun install
bun run dev
bun run build
bun run preview

bun run check
bun run lint
bun run format

bun run test
bun run test -- src/path/to/file.test.ts
bunx vitest run src/path/to/file.test.ts
bunx vitest run -t "test name"

bun run db:generate
bun run db:migrate
bun run db:push
bun run db:pull
bun run db:studio
```

Notes:
- `bun run test -- <file>` is the default single-test-file command.
- `bunx vitest run -t "..."` is the fastest way to target one test by name.
- Run `bun run check` before opening a PR.

## Commit and Plan Policy

- If an OpenCode plan exists for the work, include it in the commit context/message.
- For non-trivial changes, create/update a plan first using OpenCode tooling.
- Do not commit generated noise unrelated to the task.
- Keep commits focused and descriptive.

## Code Style Rules

### Formatting and Linting

- Biome is the single formatter/linter (no Prettier/ESLint).
- Indentation: tabs.
- JS/TS quote style: double quotes.
- Import ordering: rely on Biome organize imports.
- Biome includes:
  - `src/**/*`
  - `.vscode/**/*`
  - `index.html`
  - `vite.config.ts`
- Biome excludes:
  - `src/routeTree.gen.ts` (generated)
  - `src/styles.css`

### TypeScript

- `strict: true` with `noUnusedLocals` and `noUnusedParameters`.
- `verbatimModuleSyntax: true`.
- `moduleResolution: "bundler"`.
- `allowImportingTsExtensions: true`.
- Prefer explicit, narrow types at boundaries (API payloads, DB writes, task inputs).

### Imports

Use this ordering pattern:
1. Node built-ins (`node:*`)
2. Third-party libraries
3. Internal aliases (`#/...`)
4. Relative imports

Alias conventions:
- `#/*` and `@/*` both map to `src/*`.
- Prefer `#/` for consistency across this codebase.

### Naming Conventions

- Files: `kebab-case` (`auth-helpers.ts`, `session-import.ts`)
- React components: `PascalCase` (`ChatView.tsx`)
- Variables/functions: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Route files: TanStack file-route style (`_authed.tsx`, `chat.$sessionId.tsx`)
- DB schema exports: `camelCase` (`agentSessions`, `sessionEvents`)

### Types vs Interfaces

- Default to `type` for unions, aliases, mapped/utility types.
- Use `interface` for component props and contract-like object shapes.
- Use discriminated unions with a literal `type` field for event/state models.

### React and Routing

- Keep route modules in `src/routes/` and API routes in `src/routes/api/`.
- Do not manually edit `src/routeTree.gen.ts`.
- Prefer colocated hooks/utilities when scope is route-specific.

### Error Handling

- In API handlers, catch `unknown` and narrow with `instanceof Error`.
- Return `Response.json(..., { status })` for user-facing failures.
- In Trigger.dev tasks, log structured errors with relevant context.
- Use best-effort cleanup in `catch {}` only with a brief justification comment.
- In client code, convert unknown errors into safe user messages.

### Comments and Pragmas

- Keep comments minimal and only for non-obvious behavior.
- When Biome suppressions are unavoidable, include a reason:
  - `// biome-ignore lint/...: reason`

## Testing Guidance

- Place tests next to implementation files (`foo.ts` -> `foo.test.ts`).
- Use Vitest + Testing Library for component tests.
- Prefer deterministic tests; avoid network and timing flakiness.
- For debugging, target one file/test first, then run full suite.

## Environment and Secrets

Required env vars are listed in `.env.example` (notably `DATABASE_URL`, auth keys, GitHub OAuth keys, Trigger, Electric, and AI gateway keys).
Never commit real secrets or tokens.

## External Agent Rules Audit

Checked for additional agent-rule files:
- `.cursor/rules/`: not present
- `.cursorrules`: not present
- `.github/copilot-instructions.md`: not present

If any of these files are added later, merge their instructions into this document.
