# Picknic agent guidance

- Use `bun` and the scripts in the root `package.json`; do not substitute npm or pnpm.
- Operate the distributed app with `aspire start`, `aspire stop`, `aspire wait`, and Aspire diagnostics. Do not run the AppHost with `dotnet run`.
- Preserve the pinned Aspire daily package family and `apphost/nuget.config`.
- Use AuthKit for development and production authentication. Do not add a local authentication bypass, parallel cookie, or seeded application identity.
- Before handing off code changes, run the narrowest relevant checks; use `bun run check` for the full repository validation when appropriate.
