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

```sh
bun install --cwd web --frozen-lockfile
```

Then provision or connect a WorkOS staging/unclaimed environment once with the pinned CLI:

```sh
bun run --cwd web workos install --install-dir . --redirect-uri http://localhost:5333/callback --homepage-url http://localhost:5333 --no-branch --no-commit
bun run --cwd web workos doctor --install-dir . --skip-ai
```

The installer configures `http://localhost:5333`, including the `/callback` redirect, and temporarily writes credentials to `web/.env.local`. Move those values into Aspire's parameter store, then remove the file:

```sh
aspire secret set "Parameters:workos-client-id" "<WORKOS_CLIENT_ID>"
aspire secret set "Parameters:workos-api-key" "<WORKOS_API_KEY>"
aspire secret set "Parameters:workos-cookie-password" "<WORKOS_COOKIE_PASSWORD>"
rm web/.env.local
```

The local callback parameter defaults to `http://localhost:5333/callback`. Application secrets are supplied by Aspire.

## Run the app

Start Docker first, then run:

```sh
aspire start
```

Aspire starts PostgreSQL and the web app. Open <http://localhost:5333>, sign in through AuthKit.

Stop the environment cleanly with:

```sh
aspire stop
```

PostgreSQL uses the named Docker volume `picknic-postgres`, so stopping Aspire does not delete development data.

## Optional AI recipe import

Authentication does not require AI credentials. To enable AI-assisted recipe parsing, store the token as an Aspire parameter:

```sh
aspire secret set "Parameters:github-models-api-key" "<GITHUB_MODELS_API_KEY>"
```

The model and endpoint default to `openai/gpt-5-mini` and `https://models.github.ai/inference`. Without the API-key parameter, the rest of the application remains available and recipe parsing reports that AI import is not configured.

## Validate changes

Run the repository checks from the root:

```sh
bun run check
```

CI performs a frozen Bun install, Prisma generation and schema validation, typechecking, tests, linting, a production build, and a high-severity dependency audit. In that same job, it installs the dev-channel Aspire CLI, starts the file-based AppHost in isolation, waits for an Aspire-provisioned PostgreSQL database and the web app, verifies migrations against that database, checks the live public and unauthorized API behavior, and then stops Aspire. Required CI checks do not receive real WorkOS or GitHub Models secrets; a real WorkOS sign-in remains an optional staging smoke test.

## Deployment

Run **Deploy Picknic** manually from GitHub Actions to publish the Aspire Docker Compose model and deploy it to the Docker host through a temporary Tailscale SSH context. The deployment runs Prisma migrations as a one-shot service before starting the web service, preserves PostgreSQL data in the `picknic-postgres` volume, and exposes Picknic on host port `5333` for the reverse proxy.

Create a GitHub environment named `Production` with these secrets:

- `SSH_HOST` and `SSH_USER`
- `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET`
- `PICKNIC_POSTGRES_PASSWORD`
- `PICKNIC_WORKOS_CLIENT_ID`, `PICKNIC_WORKOS_API_KEY`, and `PICKNIC_WORKOS_COOKIE_PASSWORD`
- `PICKNIC_GITHUB_MODELS_API_KEY`

Add `PICKNIC_WORKOS_REDIRECT_URI` as an environment variable containing the complete public callback URL, such as `https://picknic.example.com/callback`. Optionally override `PICKNIC_GITHUB_MODELS_ENDPOINT`; it defaults to GitHub Models.

The Docker host needs Docker 28 or newer with Compose, and the tailnet policy must allow `tag:ci` to reach it over SSH. Configure the reverse proxy to forward the public HTTPS site to `http://<docker-host>:5333`, and configure the same callback URL plus the public sign-in and logout URLs in the WorkOS environment.
