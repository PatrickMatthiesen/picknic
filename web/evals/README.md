# Live AI recipe evaluations

These evaluations call the configured AI model and therefore consume usage. They
are intentionally separate from `bun test` and `bun run check`.

Start Aspire and complete provider login before running them. From the repository
root, opt in explicitly:

```powershell
$env:RUN_AI_EVALS = "1"
bun run test:ai
```

Run one or more selected cases when iterating on a specific parser behavior:

```powershell
$env:AI_EVAL_CASE = "qualitative-and-custom-units"
$env:RUN_AI_EVALS = "1"
bun run test:ai
```

Available cases:

- `qualitative-and-custom-units`
- `timing-notes-and-advance-notice`
- `component-groups`

The runner discovers the current CLIProxyAPI endpoint from the running Aspire
AppHost. If Aspire discovery is unavailable, it falls back to
`http://localhost:8317/v1`. `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` can
override those defaults for another explicitly configured environment.
