# opencoder

opencoder is a web app that runs AI coding sessions against GitHub repositories.
Users sign in with GitHub, pick a repository, run a task, and stream session output in real time.

## Stack

- TanStack Start + TanStack Router (React 19 SSR)
- Trigger.dev for long-running background jobs
- OpenCode SDK for agent execution
- Better Auth (GitHub OAuth)
- Drizzle ORM + PostgreSQL (Neon)
- Electric SQL + TanStack DB collections for realtime sync
- Tailwind CSS v4 + shadcn/ui
- Zod validation

## Prerequisites

- Bun (package manager/runtime)
- PostgreSQL (Neon or local)
- GitHub OAuth app credentials
- Trigger.dev project and secret key
- Electric Cloud source credentials

## Quick Start

1. Install dependencies.

```bash
bun install
```

2. Create your env file from `.env.example`.

```bash
cp .env.example .env
```

3. Fill required values in `.env`.

4. Run migrations.

```bash
bun run db:migrate
```

5. Start the app.

```bash
bun run dev
```

The app runs on `http://localhost:3000` by default.

## Environment Variables

See `.env.example` for the source of truth. Required keys include:

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `TRIGGER_PROJECT_ID`
- `TRIGGER_SECRET_KEY`
- `ELECTRIC_URL`
- `ELECTRIC_SOURCE_ID`
- `ELECTRIC_SECRET`
- `OPENCODER_KEYS_MASTER_KEY`
- `GITHUB_APP_WEBHOOK_SECRET`

Never commit secrets.

## Scripts

```bash
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
- Use `bun run test -- <file>` as the default single-test-file command.
- Use `bunx vitest run -t "..."` to target one test by name.
- Run `bun run check` before opening a PR.

## Project Structure

```text
src/
  components/     React UI (chat + base components)
  db/             Drizzle schema and DB client
  hooks/          React hooks
  integrations/   Better Auth and TanStack Query integration code
  lib/            Shared business logic and utilities
  routes/         TanStack app routes and API routes
  trigger/        Trigger.dev task orchestration
drizzle/          SQL migrations and metadata snapshots
db/               Local DB bootstrap SQL
```

## Development Workflow

- Use OpenCode workflows in this repository.
- Prefer Bun commands in docs and scripts.
- For non-trivial changes, create/update an OpenCode plan first.
- If a plan exists for the work, include it in the commit context/message.
- Keep commits focused and avoid unrelated generated changes.

See `AGENTS.md` for coding-agent specific rules, style guidance, and error-handling conventions.

## UI Components (shadcn/ui)

Add components with:

```bash
bunx shadcn@latest add <component>
```

Components live in `src/components/ui/`.

## Realtime + Background Jobs

- Trigger.dev runs long-lived coding sessions.
- Session events are written to Postgres.
- Electric SQL syncs data to the browser for realtime updates.

## License

MIT. See `LICENSE`.
