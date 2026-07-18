# Picknic

Picknic is a household meal-planning app for recipes, weekly meal plans, pantry inventory, and generated shopping lists. The development environment is orchestrated by Aspire and runs the Next.js app with PostgreSQL.

## Development Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or another running Docker-compatible engine
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Bun 1.3.7](https://bun.sh/)
- [Node.js 22.11 or newer](https://nodejs.org/) for the pinned WorkOS CLI
- The Aspire CLI using the daily package feed.
- Network access to WorkOS for local authentication

## First-time setup

Install the web dependencies from the repository root:

```powershell
bun install --cwd web --frozen-lockfile
```

Then provision or connect a WorkOS staging/unclaimed environment once with the pinned CLI:

```powershell
bun run --cwd web workos install --install-dir . --redirect-uri http://localhost:5333/callback --homepage-url http://localhost:5333 --no-branch --no-commit
bun run --cwd web workos doctor --install-dir . --skip-ai
```

The installer configures `http://localhost:5333`, including the `/callback` redirect, and writes local credentials to the ignored `web/.env.local`.

## Run the app

Start Docker first, then run:

```powershell
aspire start
```

Aspire starts PostgreSQL and the web app. Open <http://localhost:5333>, sign in through AuthKit.

Stop the environment cleanly with:

```powershell
aspire stop
```

PostgreSQL uses the named Docker volume `picknic-postgres`, so stopping Aspire does not delete development data.

## Optional AI recipe import

Authentication does not require AI credentials. To enable AI-assisted recipe parsing, add these values to `web/.env.local`:

```dotenv
GITHUB_MODELS_API_KEY=your-token
GITHUB_MODELS_MODEL=openai/gpt-5-mini
GITHUB_MODELS_ENDPOINT=https://models.github.ai/inference
```

Without `GITHUB_MODELS_API_KEY`, the rest of the application remains available and recipe parsing reports that AI import is not configured.

## Validate changes

Run the repository checks from the root:

```powershell
bun run check
```

CI performs a frozen Bun install, Prisma generation and schema validation, typechecking, tests, linting, a production build, and a high-severity dependency audit. In that same job, it installs the dev-channel Aspire CLI, starts the file-based AppHost in isolation, waits for an Aspire-provisioned PostgreSQL database and the web app, verifies migrations against that database, checks the live public and unauthorized API behavior, and then stops Aspire. Required CI checks do not receive real WorkOS or GitHub Models secrets; a real WorkOS sign-in remains an optional staging smoke test.
