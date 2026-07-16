# Picknic agent guidance

- Use `bun` and the scripts in the root `package.json`; do not substitute npm or pnpm.
- Operate the distributed app with `aspire start`, `aspire stop`, `aspire wait`, and Aspire diagnostics. Do not run the AppHost with `dotnet run`.
- Preserve the pinned Aspire daily package family and `apphost/nuget.config`. Do not migrate to stable Aspire or remove the scoped engineering feed as incidental cleanup.
- PostgreSQL persists in the Docker volume `picknic-postgres`; never create or move database data directories inside the repository.
- Existing WorkOS credentials in `web/.env.local` are user-owned; do not rewrite them automatically.
- Use AuthKit for development and production authentication. Do not add a local authentication bypass, parallel cookie, or seeded application identity.
- If a requested operation fails, stop after one focused diagnostic attempt. Do not substitute a materially different operation, change dependencies, or mask an orchestration failure without asking the user.
- After filesystem, generation, migration, or dependency operations, inspect `git status --short --untracked-files=all` and stop if unexpected files appear.
- Before handing off code changes, run the narrowest relevant checks; use `bun run check` for the full repository validation when appropriate.
