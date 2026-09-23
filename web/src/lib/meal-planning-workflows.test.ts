import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("API and shopping workflow regression suite", async () => {
  // Bun module mocks are global. Isolate route/page mocks from the main suite's
  // real auth-context and helper imports, and propagate every assertion failure.
  const child = Bun.spawn([process.execPath, "test", "./tests/meal-planning-workflows.cases.tsx"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
}, 30_000);
