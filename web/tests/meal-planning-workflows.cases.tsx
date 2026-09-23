import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Prisma } from "@prisma/client";
import { isValidElement, type ReactNode } from "react";

// Run in a separate Bun process: module mocks must not replace the real auth
// helpers used by the profile-linking tests in the main test suite.
const prisma = {
  recipe: { findMany: mock(), findUniqueOrThrow: mock() },
  recipeRevision: { findFirst: mock(), findUnique: mock(), create: mock() },
  mealPlan: { findUnique: mock(), upsert: mock() },
  mealPlanEntry: { upsert: mock(), updateMany: mock() },
  pantryItem: { findFirst: mock(), findMany: mock(), update: mock() },
  shoppingList: { upsert: mock(), findFirst: mock(), findUnique: mock() },
  shoppingListItem: { findMany: mock(), create: mock(), update: mock(), updateMany: mock(), deleteMany: mock() },
  $transaction: mock(async (operation: unknown) => typeof operation === "function"
    ? operation(prisma)
    : Promise.all(operation as Promise<unknown>[])),
};
const authContext = mock(async () => ({ userId: "reader", organizationId: undefined }));
const activeMembership = mock(async () => ({ householdId: "reader-household", role: "OWNER" }));
const activeHousehold = mock(async () => "reader-household");
const revalidatePath = mock();
mock.module("@/lib/prisma", () => ({ prisma }));
mock.module("@/lib/auth-context", () => ({
  requireAppAuthContext: authContext,
  resolveActiveMembership: activeMembership,
  resolveActiveHouseholdId: activeHousehold,
}));
mock.module("next/cache", () => ({ revalidatePath }));
mock.module("@/app/_components/page-shell", () => ({ AppPageShell: () => null }));

const { POST: planMeals } = await import("../src/app/api/meal-plans/route");
const { PATCH: updatePantry } = await import("../src/app/api/pantry/[pantryItemId]/route");
const { generateShoppingListForWeek, getShoppingListForWeek } = await import("../src/lib/shopping-list-service");
const { default: ShoppingListPage } = await import("../src/app/shopping-list/page");
const { default: PlannerPage } = await import("../src/app/planner/page");

beforeEach(() => {
  for (const model of Object.values(prisma)) {
    if (typeof model !== "function") {
      for (const method of Object.values(model)) method.mockReset();
    }
  }
  revalidatePath.mockClear();
  prisma.mealPlan.upsert.mockResolvedValue({ id: "plan" });
  prisma.mealPlan.findUnique.mockResolvedValue(null);
});

function request(path: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${path}`, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

const sharedRecipe = {
  id: "shared-recipe", householdId: "author-household", createdById: "author",
  latestRevisionId: "published-revision", visibility: "PRIVATE", deletedAt: null,
};
const publicSnapshot = { recipeId: sharedRecipe.id, title: "Published recipe", notes: "Published notes", servings: 2, visibility: "PUBLIC" };
const planRequest = () => request("/api/meal-plans", {
  weekStart: "2030-04-01", entries: [{ date: "2030-04-03", mealType: "DINNER", recipeId: sharedRecipe.id }],
});

describe("planning shared recipes", () => {
  test.each([
    ["unpublished", "PRIVATE", null],
    ["public", "PUBLIC", null],
    ["deleted", "PRIVATE", new Date("2026-09-23")],
  ])("uses the published revision for a saved %s recipe", async (_label, visibility, deletedAt) => {
    prisma.recipe.findMany.mockResolvedValue([{ ...sharedRecipe, visibility, deletedAt }]);
    prisma.recipeRevision.findFirst.mockResolvedValue({ id: "published-revision", snapshot: publicSnapshot });
    const response = await planMeals(planRequest());
    expect(response.status).toBe(201);
    expect(prisma.recipe.findMany.mock.calls[0][0].where.OR).toContainEqual({
      saves: { some: { userId: "reader" } }, latestRevisionId: { not: null },
    });
    expect(prisma.recipeRevision.findFirst).toHaveBeenCalledWith({ where: { id: "published-revision", recipeId: sharedRecipe.id } });
    expect(prisma.mealPlanEntry.upsert.mock.calls[0][0].create.recipeRevisionId).toBe("published-revision");
    expect(prisma.recipe.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.recipeRevision.create).not.toHaveBeenCalled();
  });

  test.each([null, { id: "private-revision", snapshot: { ...publicSnapshot, visibility: "PRIVATE", notes: "Secret edits" } }])(
    "rejects a missing or non-public retained revision",
    async (revision) => {
      prisma.recipe.findMany.mockResolvedValue([sharedRecipe]);
      prisma.recipeRevision.findFirst.mockResolvedValue(revision);
      expect((await planMeals(planRequest())).status).toBe(400);
      expect(prisma.mealPlan.upsert).not.toHaveBeenCalled();
      expect(prisma.recipeRevision.create).not.toHaveBeenCalled();
    },
  );

  test("does not snapshot a foreign recipe without a published revision", async () => {
    prisma.recipe.findMany.mockResolvedValue([{ ...sharedRecipe, latestRevisionId: null }]);
    expect((await planMeals(planRequest())).status).toBe(400);
    expect(prisma.recipe.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.mealPlanEntry.upsert).not.toHaveBeenCalled();
  });

  test("still snapshots the household's own private recipe", async () => {
    const owned = { ...sharedRecipe, householdId: "reader-household", createdById: "reader" };
    prisma.recipe.findMany.mockResolvedValue([owned]);
    prisma.recipe.findUniqueOrThrow.mockResolvedValue({ ...owned, ...publicSnapshot, visibility: "PRIVATE", createdBy: { displayName: "Reader" }, ingredients: [], steps: [] });
    prisma.recipeRevision.findFirst.mockResolvedValue({ version: 1 });
    prisma.recipeRevision.create.mockResolvedValue({ id: "own-private-revision" });
    expect((await planMeals(planRequest())).status).toBe(201);
    expect(prisma.mealPlanEntry.upsert.mock.calls[0][0].create.recipeRevisionId).toBe("own-private-revision");
  });

  test("rejects recipes outside the access query without writing a plan", async () => {
    prisma.recipe.findMany.mockResolvedValue([]);
    expect((await planMeals(planRequest())).status).toBe(400);
    expect(prisma.mealPlan.upsert).not.toHaveBeenCalled();
  });
});

function patchPantry(body: unknown) {
  return updatePantry(request("/api/pantry/rice", body, "PATCH"), { params: Promise.resolve({ pantryItemId: "rice" }) });
}

describe("pantry unit integrity", () => {
  beforeEach(() => {
    prisma.pantryItem.findFirst.mockResolvedValue({ id: "rice", unitId: "metric-gram" });
    prisma.pantryItem.update.mockImplementation(async ({ data }) => data);
  });

  test("updates canonical unit and identity together", async () => {
    const response = await patchPantry({ unit: "kilograms", quantity: 2 });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ unit: "kg", unitId: "metric-kilogram", unitKey: "metric-kilogram", quantity: 2 });
  });

  test("clears the old unit identity when changing to a custom unit", async () => {
    const response = await patchPantry({ unit: "sacks" });
    expect((await response.json()).data).toMatchObject({ unit: "sacks", unitId: null, unitKey: "unit:sacks" });
  });

  test("preserves an existing US cup when an ambiguous alias is submitted", async () => {
    prisma.pantryItem.findFirst.mockResolvedValue({ id: "rice", unitId: "us-cup" });
    const response = await patchPantry({ unit: "cups" });
    expect((await response.json()).data).toMatchObject({ unit: "cup", unitId: "us-cup", unitKey: "us-cup" });
  });

  test("accepts an explicit system change for ambiguous units", async () => {
    prisma.pantryItem.findFirst.mockResolvedValue({ id: "rice", unitId: "us-cup" });
    const response = await patchPantry({ unit: "cup", unitId: "metric-cup" });
    expect((await response.json()).data.unitKey).toBe("metric-cup");
  });

  test("quantity-only updates leave units unchanged", async () => {
    await patchPantry({ quantity: 5 });
    expect(prisma.pantryItem.update.mock.calls[0][0].data).not.toHaveProperty("unitKey");
    expect(prisma.pantryItem.update.mock.calls[0][0].data).not.toHaveProperty("unitId");
  });

  test("rejects an empty unit", async () => {
    expect((await patchPantry({ unit: " " })).status).toBe(400);
    expect(prisma.pantryItem.update).not.toHaveBeenCalled();
  });

  test("returns a conflict instead of merging or overwriting another pantry item", async () => {
    prisma.pantryItem.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "7.9.0" }));
    expect((await patchPantry({ unit: "kg" })).status).toBe(409);
  });
});

type Item = { id: string; ingredientName: string; quantity: number; unit: string; unitId: string | null; source: "AUTO" | "MANUAL"; status: "BOUGHT" | "PENDING" | "SKIPPED" };
const entryFields = { id: "entry", recipeId: "recipe", recipeRevisionId: null, date: new Date("2030-04-03"), mealType: "DINNER" };
let items: Item[];
let ingredients: Array<{ name: string; quantity: number; unit: string; unitId?: string }>;
function generateList() {
  return generateShoppingListForWeek({ householdId: "reader-household", userId: "reader", weekStart: new Date("2030-04-01") });
}

describe("shopping list refresh", () => {
  beforeEach(() => {
    items = [
      { id: "rice", ingredientName: "Rice", quantity: 200, unit: "g", unitId: "metric-gram", source: "AUTO", status: "BOUGHT" },
      { id: "salt", ingredientName: "Salt", quantity: 2, unit: "g", unitId: "metric-gram", source: "AUTO", status: "SKIPPED" },
      { id: "milk", ingredientName: "Milk", quantity: 1, unit: "l", unitId: "metric-liter", source: "AUTO", status: "PENDING" },
      { id: "manual", ingredientName: "Rice", quantity: 100, unit: "g", unitId: "metric-gram", source: "MANUAL", status: "BOUGHT" },
    ];
    ingredients = [{ name: "rice", quantity: 300, unit: "grams" }, { name: "Salt", quantity: 2, unit: "g" }, { name: "Eggs", quantity: 2, unit: "pieces" }];
    prisma.mealPlan.findUnique.mockImplementation(async () => ({ id: "plan", entries: [{ ...entryFields, servingsOverride: null, recipeRevision: null, recipe: { householdId: "reader-household", servings: 1, ingredients } }] }));
    prisma.pantryItem.findMany.mockResolvedValue([]);
    prisma.shoppingList.upsert.mockResolvedValue({ id: "list" });
    prisma.shoppingListItem.findMany.mockImplementation(async () => items.filter((item) => item.source === "AUTO"));
    prisma.shoppingListItem.update.mockImplementation(async ({ where, data }) => {
      const item = items.find((item) => item.id === where.id)!;
      Object.assign(item, data);
      return item;
    });
    prisma.shoppingListItem.create.mockImplementation(async ({ data }) => {
      const item = { id: `new-${items.length}`, ...data };
      items.push(item);
      return item;
    });
    prisma.shoppingListItem.deleteMany.mockImplementation(async ({ where }) => {
      items = items.filter((item) => item.source !== where.source || where.id.notIn.includes(item.id));
    });
    prisma.shoppingList.findUnique.mockImplementation(async () => ({ id: "list", items }));
  });

  test("preserves bought/skipped status and IDs while refreshing quantities and aliases", async () => {
    await generateList();
    expect(items.find((item) => item.id === "rice")).toMatchObject({ quantity: 300, unit: "g", status: "BOUGHT" });
    expect(items.find((item) => item.id === "salt")?.status).toBe("SKIPPED");
    expect(items.find((item) => item.ingredientName === "Eggs")?.status).toBe("PENDING");
    expect(items.some((item) => item.id === "milk")).toBe(false);
    expect(items.find((item) => item.id === "manual")).toMatchObject({ quantity: 100, source: "MANUAL", status: "BOUGHT" });
  });

  test("repeated refreshes retain item IDs and do not duplicate generated items", async () => {
    await generateList();
    const first = structuredClone(items);
    await generateList();
    expect(items).toEqual(first);
  });

  test("an empty plan removes generated items and preserves manual additions", async () => {
    ingredients = [];
    await generateList();
    expect(items.map((item) => item.id)).toEqual(["manual"]);
  });

  test("does not transfer checked status across incompatible cup systems", async () => {
    items = [{ id: "us-flour", ingredientName: "Flour", quantity: 1, unit: "cup", unitId: "us-cup", source: "AUTO", status: "BOUGHT" }];
    ingredients = [{ name: "Flour", quantity: 1, unit: "cup", unitId: "metric-cup" }];
    await generateList();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ unitId: "metric-cup", status: "PENDING" });
  });

  test("uses pinned ingredients instead of private live edits", async () => {
    prisma.mealPlan.findUnique.mockResolvedValue({ id: "plan", entries: [{ ...entryFields, servingsOverride: null, recipeRevision: { snapshot: { servings: 1, ingredients: [{ name: "Rice", quantity: 200, unit: "g" }] } }, recipe: { householdId: "other-household", servings: 1, ingredients: [{ name: "Secret ingredient", quantity: 1, unit: "g" }] } }] });
    await generateList();
    expect(items.some((item) => item.ingredientName === "Secret ingredient")).toBe(false);
    expect(items.find((item) => item.id === "rice")?.status).toBe("BOUGHT");
  });
});

function elements(node: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode), ...elements(node.props.headerChildren as ReactNode)];
}
function formAction(node: ReactNode, index: number) {
  const form = elements(node).filter((element) => element.type === "form")[index];
  return form.props.action as (data: FormData) => Promise<void>;
}

describe("selected shopping week", () => {
  beforeEach(() => {
    prisma.mealPlan.findUnique.mockResolvedValue({ id: "future-plan", entries: [] });
    prisma.shoppingList.findFirst.mockResolvedValue(null);
    prisma.shoppingList.upsert.mockResolvedValue({ id: "future-list" });
    prisma.shoppingListItem.findMany.mockResolvedValue([]);
    prisma.pantryItem.findMany.mockResolvedValue([]);
  });

  test("reads the selected week and links to adjacent weeks and its meal plan", async () => {
    const page = await ShoppingListPage({ searchParams: Promise.resolve({ week: "2030-04-03" }) });
    expect(prisma.mealPlan.findUnique.mock.calls[0][0].where.householdId_weekStart.weekStart).toEqual(new Date("2030-04-01"));
    const hrefs = elements(page).map((element) => element.props.href);
    expect(hrefs).toContain("/shopping-list?week=2030-03-25");
    expect(hrefs).toContain("/shopping-list?week=2030-04-08");
    expect(hrefs).toContain("/planner?week=2030-04-01");
  });

  test("regenerates and adds manual items to the selected week", async () => {
    const page = await ShoppingListPage({ searchParams: Promise.resolve({ week: "2030-04-01" }) });
    await formAction(page, 0)(new FormData());
    const data = new FormData();
    data.set("ingredientName", "Bread");
    await formAction(page, 1)(data);
    for (const [query] of prisma.mealPlan.findUnique.mock.calls) {
      expect(query.where.householdId_weekStart.weekStart).toEqual(new Date("2030-04-01"));
    }
    expect(prisma.shoppingList.upsert.mock.calls[1][0].create.name).toBe("Week of 2030-04-01");
    expect(prisma.shoppingListItem.create.mock.calls[0][0].data).toMatchObject({ shoppingListId: "future-list", source: "MANUAL", ingredientName: "Bread" });
  });

  test("falls back to the current week for an invalid selection", async () => {
    const { getWeekStartUtc } = await import("../src/lib/meal-plan");
    await ShoppingListPage({ searchParams: Promise.resolve({ week: "not-a-date" }) });
    expect(prisma.mealPlan.findUnique.mock.calls[0][0].where.householdId_weekStart.weekStart).toEqual(getWeekStartUtc(new Date()));
  });

  test("planner links shopping to the week currently being planned", async () => {
    prisma.mealPlan.findUnique.mockResolvedValue(null);
    prisma.recipe.findMany.mockResolvedValue([]);
    const page = await PlannerPage({ searchParams: Promise.resolve({ week: "2030-04-01" }) });
    expect(elements(page).map((element) => element.props.href)).toContain("/shopping-list?week=2030-04-01");
  });
});

describe("shopping list freshness and planned servings", () => {
  test("flags a changed plan and clears the notice after refresh", async () => {
    const { getShoppingPlanFingerprint } = await import("../src/lib/shopping-list-state");
    const entry = { ...entryFields, servingsOverride: 2 };
    let fingerprint = getShoppingPlanFingerprint([entry]);
    prisma.mealPlan.findUnique.mockImplementation(async () => ({ id: "plan", entries: [{ ...entry, recipeRevision: null, recipe: { householdId: "reader-household", servings: 2, ingredients: [] } }] }));
    prisma.shoppingList.findFirst.mockImplementation(async () => ({ id: "list", planFingerprint: fingerprint, items: [] }));
    expect((await getShoppingListForWeek("reader-household", new Date("2030-04-01")))?.isStale).toBe(false);
    entry.servingsOverride = 4;
    expect((await getShoppingListForWeek("reader-household", new Date("2030-04-01")))?.isStale).toBe(true);
    prisma.pantryItem.findMany.mockResolvedValue([]);
    prisma.shoppingListItem.findMany.mockResolvedValue([]);
    prisma.shoppingList.upsert.mockImplementation(async ({ update }) => { fingerprint = update.planFingerprint; return { id: "list" }; });
    await generateList();
    expect((await getShoppingListForWeek("reader-household", new Date("2030-04-01")))?.isStale).toBe(false);
  });

  test("serving edits are household-scoped and invalidate shopping and cook views", async () => {
    prisma.recipe.findMany.mockResolvedValue([]);
    prisma.mealPlan.findUnique.mockResolvedValue({ id: "plan", entries: [{ ...entryFields, servingsOverride: 2, recipe: { id: "recipe", title: "Rice", servings: 2, imageUrl: null }, recipeRevision: null }] });
    const page = await PlannerPage({ searchParams: Promise.resolve({ week: "2030-04-01" }) });
    const form = elements(page).find((element) => element.props.className === "planned-servings")!;
    const data = new FormData(); data.set("entryId", "entry"); data.set("servings", "4");
    await (form.props.action as (data: FormData) => Promise<void>)(data);
    expect(prisma.mealPlanEntry.updateMany).toHaveBeenCalledWith({ where: { id: "entry", mealPlan: { householdId: "reader-household" } }, data: { servingsOverride: 4 } });
    expect(revalidatePath).toHaveBeenCalledWith("/shopping-list");
    expect(revalidatePath).toHaveBeenCalledWith("/cook");
    data.set("servings", "0.5");
    await expect((form.props.action as (data: FormData) => Promise<void>)(data)).rejects.toThrow("whole servings");
    expect(prisma.mealPlanEntry.updateMany).toHaveBeenCalledTimes(1);
  });

  test.each([0, -1, 0.5, 101, "bad"])("rejects invalid API servings %s", async (servingsOverride) => {
    expect((await planMeals(request("/api/meal-plans", { entries: [{ date: "2030-04-03", mealType: "DINNER", recipeId: "recipe", servingsOverride }] }))).status).toBe(400);
    expect(prisma.mealPlanEntry.upsert).not.toHaveBeenCalled();
  });
});

describe("recipe import model policy at the API boundary", () => {
  let server: ReturnType<typeof Bun.serve>;
  let catalog = ["gpt-5.6-luna", "gpt-5.4-mini", "gpt-6-astra"];
  let catalogStatus = 200;
  let catalogCalls = 0;
  let completions: Array<Record<string, unknown>> = [];
  let savedEnvironment: Record<string, string | undefined>;
  const environmentKeys = ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "AI_ALLOWED_MODELS"];

  beforeEach(() => {
    catalog = ["gpt-5.6-luna", "gpt-5.4-mini", "gpt-6-astra"];
    catalogStatus = 200; catalogCalls = 0; completions = [];
    savedEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    server = Bun.serve({
      port: 0,
      async fetch(request) {
        if (new URL(request.url).pathname === "/v1/models") {
          catalogCalls++;
          return Response.json({ data: catalog.map((id) => ({ id })) }, { status: catalogStatus });
        }
        completions.push(await request.json() as Record<string, unknown>);
        return Response.json({ choices: [{ message: { content: JSON.stringify({ title: "Rice", servings: 2, ingredientComponents: [], instructionComponents: [] }) } }] });
      },
    });
    process.env.AI_BASE_URL = `${server.url.origin}/v1`;
    process.env.AI_API_KEY = "test-provider-key";
    process.env.AI_MODEL = "gpt-5.6-luna";
    process.env.AI_ALLOWED_MODELS = "gpt-5.4-mini";
  });
  afterEach(() => {
    server.stop(true);
    for (const key of environmentKeys) {
      if (savedEnvironment[key] === undefined) delete process.env[key]; else process.env[key] = savedEnvironment[key];
    }
  });

  async function parse(body: unknown) {
    const { POST } = await import("../src/app/api/recipes/parse/route");
    return POST(request("/api/recipes/parse", body));
  }

  test("uses the default and bounds completion tokens", async () => {
    expect((await parse({ text: "Cook rice." })).status).toBe(200);
    expect(completions[0]).toMatchObject({ model: "gpt-5.6-luna", max_completion_tokens: 8192, reasoning_effort: "low" });
  });
  test("honors an explicitly selected approved provider model", async () => {
    expect((await parse({ text: "Cook rice.", model: "gpt-5.4-mini" })).status).toBe(200);
    expect(completions[0].model).toBe("gpt-5.4-mini");
  });
  test("rejects a forged expensive model before contacting the provider", async () => {
    expect((await parse({ text: "Cook rice.", model: "gpt-6-astra" })).status).toBe(400);
    expect(catalogCalls).toBe(0);
    expect(completions).toHaveLength(0);
  });
  test("does not fall back when the default disappears", async () => {
    catalog = ["gpt-5.4-mini", "gpt-6-astra"];
    expect((await parse({ text: "Cook rice." })).status).toBe(503);
    expect(completions).toHaveLength(0);
  });
  test("does not guess or retry when model discovery fails", async () => {
    catalogStatus = 503;
    expect((await parse({ text: "Cook rice." })).status).toBe(503);
    expect(catalogCalls).toBe(1);
    expect(completions).toHaveLength(0);
  });
  test("rejects oversized input before any provider call", async () => {
    expect((await parse({ text: "x".repeat(50_001) })).status).toBe(400);
    expect(catalogCalls).toBe(0);
  });
  test("UI discovery filters the catalog and invalidates cached choices on policy changes", async () => {
    const { getAiRecipeImportStatus } = await import("../src/lib/ai-config");
    expect((await getAiRecipeImportStatus()).models).toEqual(["gpt-5.6-luna", "gpt-5.4-mini"]);
    delete process.env.AI_ALLOWED_MODELS;
    expect((await getAiRecipeImportStatus()).models).toEqual(["gpt-5.6-luna"]);
  });
});
