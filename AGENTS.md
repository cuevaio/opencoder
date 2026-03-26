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
- Zod v4 for validation

## Tooling and Package Manager

- Package manager/runtime: Bun (`bun.lock` is present)
- Build tool: Vite (with Nitro for SSR, `babel-plugin-react-compiler` on all React files)
- Lint/format: Biome 2.x (pinned exact version in devDependencies)
- Tests: Vitest (`jsdom` environment default, can override per-file)
- Migrations: Drizzle Kit

Prefer Bun commands in docs, scripts, and agent instructions.

## Build / Lint / Test Commands

Use these from repo root:

```bash
bun install
bun run dev
bun run build
bun run preview

bun run check       # biome check (lint + format) — run before every PR
bun run lint        # biome lint only
bun run format      # biome format only

bun run test                                      # run all tests
bun run test -- src/path/to/file.test.ts          # run one file
bunx vitest run src/path/to/file.test.ts          # alternative single-file run
bunx vitest run -t "test name"                    # run by test name

bun run db:generate
bun run db:migrate
bun run db:push
bun run db:pull
bun run db:studio

bun run trigger:dev  # local Trigger.dev dev server
```

Notes:
- `bun run test -- <file>` is the default single-test-file command.
- `bunx vitest run -t "..."` is the fastest way to target one test by name.
- Run `bun run check` before opening a PR.
- `drizzle.config.ts` and `trigger.config.ts` are outside `src/` and excluded from Biome.

## Commit and Plan Policy

- If an OpenCode plan exists for the work, include it in the commit context/message.
- For non-trivial changes, create/update a plan first using OpenCode tooling.
- Do not commit generated noise unrelated to the task.
- Keep commits focused and descriptive.
- **Always append the following co-author trailer to every commit message:**
  ```
  Co-authored-by: opencode-agent[bot] <opencode-agent[bot]@users.noreply.github.com>
  ```

## Code Style Rules

### Formatting and Linting

- Biome is the single formatter/linter (no Prettier/ESLint).
- Indentation: tabs.
- JS/TS quote style: double quotes.
- Import ordering: rely on Biome `organizeImports` (configured via `assist.actions.source`).
- Biome includes: `src/**/*`, `.vscode/**/*`, `index.html`, `vite.config.ts`
- Biome excludes: `src/routeTree.gen.ts` (generated), `src/styles.css`
- Biome does NOT read `.gitignore` (`vcs.useIgnoreFile: false`).

### TypeScript

- `strict: true` with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`,
  and `noUncheckedSideEffectImports`.
- `verbatimModuleSyntax: true` — use `import type` for type-only imports.
- `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`.
- Prefer explicit, narrow types at boundaries (API payloads, DB writes, task inputs).
- Use `z.infer<typeof schema>` from Zod to derive payload types.

### Imports

Ordering:
1. Node built-ins (`node:fs`, `node:path`, …)
2. Third-party libraries
3. Internal aliases (`#/...`)
4. Relative imports

Rules:
- **Always use `#/` alias** (not `@/`) for imports from `src/`.
- **Include the `.ts` or `.tsx` extension** in import paths: `from "#/db/index.ts"`.
- Use `import type` for type-only imports: `import type { Foo } from "#/lib/types.ts"`.
- Double quotes for all import strings (enforced by Biome).

### Naming Conventions

- Files: `kebab-case` (`auth-helpers.ts`, `session-import.ts`)
- React component files and exports: `PascalCase` (`ChatView.tsx`, `export function ChatView`)
- React hooks: `useCamelCase` in a `use-kebab-case.ts` file
- Variables/functions: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Route files: TanStack file-route style (`_authed.tsx`, `chat.$sessionId.tsx`, `__root.tsx`)
- DB schema table exports: `camelCase` (`agentSessions`, `sessionEvents`, `authUsers`)

### Types vs Interfaces

- Default to `type` for unions, aliases, mapped/utility types, and Zod-inferred types.
- Use `interface` for component props and contract-like object shapes.
- Use discriminated unions with a literal `type` field for event/state models:
  ```ts
  type StreamEvent =
    | { type: "part-update"; part: MessagePart }
    | { type: "status"; status: SessionStatus }
  ```

### React and Routing

- Keep route modules in `src/routes/` and API routes in `src/routes/api/`.
- Do not manually edit `src/routeTree.gen.ts`.
- Prefer named exports for components (no default exports).
- Prefer colocated hooks/utilities when scope is route-specific.
- Tailwind classes applied directly; use `tailwind-merge`/`clsx` only when conditional merging is needed.

### Error Handling

- Catch `unknown`; narrow with `instanceof Error`:
  ```ts
  const msg = error instanceof Error ? error.message : "Unknown error";
  ```
- API handlers: return `Response.json({ error: msg }, { status: 500 })` for user-facing failures.
- Auth helpers return `Response` objects; callers check `instanceof Response` before continuing.
- Trigger.dev tasks: use `logger.warn(...)` / `logger.info(...)` with structured context objects.
- Best-effort `catch {}` blocks must include a brief justification comment.
- In client code, convert unknown errors into safe user-facing messages.

### Comments and Pragmas

- Keep comments minimal and only for non-obvious behavior.
- Biome suppressions must include a reason:
  ```ts
  // biome-ignore lint/style/noNonNullAssertion: drizzle-kit reads env at config load
  ```
- Section-delimiter comments are used in long files (e.g., schema):
  ```ts
  // ─── Agent Sessions ──────────────────────────────────────
  ```

## Testing Guidance

- Place tests next to implementation files (`foo.ts` → `foo.test.ts`).
- Use Vitest; import from `"vitest"` (`describe`, `it`, `expect`, `vi`).
- Use `@testing-library/react` for component tests.
- Default test environment is Node; override per-file when the DOM is needed:
  ```ts
  /** @vitest-environment jsdom */
  ```
- Use `vi.mock(...)` for module mocking; prefer `vi.fn()` over manual stubs.
- Prefer deterministic tests; avoid relying on network or real timers.
- For debugging, target one file/test first, then run the full suite.

## Database (Drizzle + PostgreSQL)

- Schema lives in `src/db/schema.ts`.
- All tables use `pgTable`; export names are `camelCase`, SQL names are `snake_case`.
- Timestamps always use `{ withTimezone: true }`.
- Use `$onUpdate(() => new Date())` for `updatedAt` columns.
- Indexes and relations defined inline in the same file as the table.
- Migrations output to `./drizzle/`; config in `drizzle.config.ts` (outside Biome scope).

## Environment and Secrets

Required env vars are listed in `.env.example` (notably `DATABASE_URL`, auth keys, GitHub OAuth
keys, Trigger.dev keys, Electric SQL keys, and AI gateway keys).
`drizzle.config.ts` loads `.env.local` first, then `.env`.
Never commit real secrets or tokens.

## External Agent Rules Audit

Checked for additional agent-rule files:
- `.cursor/rules/`: not present
- `.cursorrules`: not present
- `.github/copilot-instructions.md`: not present

If any of these files are added later, merge their instructions into this document.
