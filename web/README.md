# Picknic Web

The Picknic web application uses Next.js App Router, Prisma, PostgreSQL, and WorkOS AuthKit. The supported local runtime is the repository's Aspire AppHost; see the root README for prerequisites and the full startup workflow.

## Authentication

Development and production use the same AuthKit integration. Local development connects to a WorkOS staging or unclaimed environment and stores its credentials in the ignored `web/.env.local` file. There is no application-level development login endpoint or authentication bypass.

From the repository root, configure WorkOS once with the pinned CLI and verify it:

```powershell
bun run --cwd web workos install --install-dir . --redirect-uri http://localhost:5333/callback --homepage-url http://localhost:5333 --no-branch --no-commit
bun run --cwd web workos doctor --install-dir . --skip-ai
```

Run the installer only when `web/.env.local` is absent; existing credentials are developer-owned. Because the installer can update integration files, review `git diff` after the first run. Use the doctor command to detect configuration drift. Picknic authorization currently lives in the local Prisma household model, so setup does not seed unused WorkOS roles, permissions, or organizations.

## Development

Start PostgreSQL and the web application through Aspire from the repository root:

```powershell
bun run dev
```

The application is available at <http://localhost:5333>. AuthKit returns through `/callback`; `/sign-in` is the canonical sign-in initiation route. Stop all resources with `bun run stop`.

## Validation

Run all web checks directly from this directory with:

```powershell
bun run check
bun audit --audit-level=high
```

The full repository validation command is `bun run check` from the repository root.
