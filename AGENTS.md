# AGENTS.md

このファイルは、このリポジトリで作業する AI エージェント向けの作業規約です。既存実装を優先し、変更は小さく、保守しやすく、再利用しやすい形で進めてください。

## 1. System & Tech Stack

- Current runtime: Bun 1.x workspaces.
- Current packages: `agent-server`, `slack-bot`, `pipeline`, `observability` (shared).
- Current backend: Hono HTTP API, Slack Bolt bot, Redis-backed integrations, Claude/Anthropic SDK usage.
- Frontend standard, when a frontend is added: Next.js App Router with TypeScript.
- Style standard, when UI is added: Tailwind CSS and shadcn/ui.
- Database standard, when persistence is added: Prisma with PostgreSQL.
- Prefer TypeScript and ES modules across all packages.

## 2. Core Commands

Run commands from the repository root unless a package-specific command is required.

- Install: `bun install`
- Dev: `bun run dev`
- Slack bot dev: `bun run dev:slack`
- Build: `npm run build`
- Dev, npm-compatible target: `npm run dev`
- Test: `npm run test`
- Lint/Format: `npm run lint` / `npm run format`
- Current package build: `bun --filter <package> run build`
- Current package typecheck: run `bunx tsc --noEmit` from the relevant package directory.
- Docker Compose: `bun run docker:up`
- Redis only: `bun run docker:redis`

If an npm script listed above does not exist yet, do not invent behavior silently. Report the missing script and use the closest existing Bun command only when it validates the same surface.

## 3. Coding Standards

- Components: Use arrow functions and export them as named exports.
- State: Use React Server Components by default. Add `"use client"` only when a component truly needs client-side state, effects, browser APIs, or event handlers.
- API: Wrap all external API calls in `try/catch` and log failures with `console.error`.
- TypeScript: Keep types explicit at module boundaries, public functions, API handlers, and persisted data shapes.
- Validation: Use schema validation, such as Zod, for untrusted input and external service responses when practical.
- Errors: Preserve useful context in error messages and rethrow or return a typed failure where callers need to act.
- Async code: Avoid fire-and-forget promises unless intentionally detached and logged.
- Structure: Prefer small modules with clear ownership over broad utility files.
- Comments: Do not delete existing comments unless explicitly requested. Add new comments only when they explain non-obvious intent or constraints.
- Formatting: Follow the package's existing style. Keep unrelated formatting churn out of focused changes.

## 4. Agent Guidelines (Do & Don't)

### DO

- Read the relevant existing code before editing.
- Keep changes scoped to the user's request.
- Run `npm run lint` and `npm run test` after any code modification when those scripts exist.
- For this Bun workspace, also run the relevant `bunx tsc --noEmit` and package build commands when they better match the changed package.
- Ask for user confirmation before installing any new npm packages.
- Explain missing scripts, skipped checks, or environment blockers in the final response.
- Preserve user changes in the working tree and avoid reverting unrelated files.

### DON'T

- Do not delete existing comments unless explicitly requested.
- Do not introduce new dependencies without confirmation.
- Do not commit, push, or create a PR unless explicitly asked.
- Do not edit `.env` files or add secrets to the repository.
- Do not make broad refactors while fixing a narrow issue.
- Do not hide failing checks; report the command and the failure clearly.

## 5. Repository Notes

- `agent-server` contains the Hono API and agent orchestration.
- `slack-bot` contains Slack event handling and bot entrypoints.
- `pipeline` contains background jobs and X/Slack related integrations.
- `observability` is a shared package providing Sentry initialization and capture helpers. Each runtime imports and calls `initObservability({ service })` at startup.
- Root `package.json` is a Bun workspace manifest, not a complete npm script surface today.
- Prefer package-local changes when behavior belongs to a single workspace.
- Shared behavior should be extracted only after real duplication or a stable cross-package contract appears.

## 6. Testing & Verification

- Before editing, identify the smallest meaningful verification target.
- After TypeScript changes, run type checking for the touched package.
- After API, Slack, or pipeline behavior changes, run a build or targeted runtime check when available.
- If tests are added later, keep them close to the behavior they cover and make them deterministic.
- If a requested check cannot run because scripts or services are missing, state that explicitly.

## 7. Security & Configuration

- Keep secrets in `.env` files or external secret stores only.
- Use `.env.example` as documentation for required variables.
- Treat Slack, X, Anthropic, GitHub, Redis, and database credentials as sensitive.
- Validate inbound webhooks, API payloads, and external data before using them.
- Log enough context to debug failures, but never log tokens, secrets, or full credential-bearing URLs.
