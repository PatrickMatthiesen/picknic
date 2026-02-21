# Copilot Instructions for Picknic

## Build, test, and lint commands

- **Install deps (web app):**
  - `cd web && bun install --frozen-lockfile`
- **Generate Prisma client (expected in CI and after schema changes):**
  - `cd web && bun run prisma:generate`
- **Run lint:**
  - `cd web && bun run lint`
- **Run tests:**
  - `cd web && bun run test`
- **Run a single test file:**
  - `cd web && bun test src/lib/shopping-list.test.ts`
  - `cd web && bun test src/lib/meal-plan.test.ts`
- **Build production web app:**
  - `cd web && bun run build`
- **Run distributed app with Aspire (repo root):**
  - `aspire run`
  - In agent/non-interactive environments: `aspire run --detach --isolated`
  - Stop running apphost: `aspire stop`

## High-level architecture

- The solution is orchestrated by **Aspire** in `apphost/apphost.cs`:
  - Provisions `postgres` + `picknicdb` and a Bun-hosted Next.js resource (`web`).
  - Web runs on fixed port `57334`.
  - WorkOS and GitHub Models values are injected via Aspire parameters/environment.
  - `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is composed from host + configurable redirect path parameter.
- `web/` is a **Next.js App Router** app (TypeScript + Bun) with API routes under `src/app/api/*` and UI pages under `src/app/*`.
- Persistence is in **PostgreSQL via Prisma** (`web/prisma/schema.prisma`) with household-scoped domain models:
  - users, households, memberships, recipes (+ ingredients/steps), meal plans (+ entries), shopping lists (+ items), pantry items.
- Authentication and tenant context:
  - `web/src/proxy.ts` applies WorkOS `authkitMiddleware` to app/API routes.
  - `web/src/app/callback/route.ts` handles callback and redirects on failure.
  - `web/src/lib/auth-context.ts` links WorkOS users to DB records and resolves active household membership.
- Shopping list generation path:
  - API: `src/app/api/shopping-lists/route.ts`
  - Service/domain logic: `src/lib/shopping-list-service.ts` + `src/lib/shopping-list.ts`
  - Generated AUTO items are derived from meal plans and reduced by pantry quantities.
- Recipe parser path:
  - API: `src/app/api/recipes/parse/route.ts`
  - Inference client: `src/lib/recipe-parser.ts` using OpenAI SDK against configurable GitHub Models endpoint/model.

## Key repository-specific conventions

- API routes consistently call `requireAppAuthContext()` then `resolveActiveMembership(...)` before household data access.
  - If no membership is found, handlers return `400` with `"No household found for this user."`.
- Household ownership rules are enforced on destructive endpoints:
  - `DELETE` of recipes/pantry items requires `MembershipRole.OWNER`.
- Week-based planning/list logic is normalized to **UTC Monday week start** using `getWeekStartUtc()` in `src/lib/meal-plan.ts`.
- Recipe updates replace ordered child collections by deleting/recreating `ingredients` and `steps` with explicit `position`.
- Shopping list refresh behavior preserves manual edits:
  - Regeneration deletes/recreates only `ShoppingItemSource.AUTO` items.
- Prisma connection resolution must stay aligned in both runtime and Prisma config:
  - Prefer Aspire-provided `PICKNICDB_URI` / `PICKNICDB_*` first, then `ConnectionStrings__picknicdb`, then `DATABASE_URL`.
- Because this app uses `src/` layout, auth middleware lives at `web/src/proxy.ts` (not project root).
