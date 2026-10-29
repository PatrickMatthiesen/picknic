import { afterAll, beforeAll, expect, mock, test } from "bun:test";

// This suite is only run against the explicitly supplied Aspire test database.
// Authentication is mocked in this test process; the application has no bypass.
if (process.env.PICKNIC_INTEGRATION_TESTS !== "1" || !process.env.DATABASE_URL) {
  throw new Error("Supply DATABASE_URL for an isolated test database and PICKNIC_INTEGRATION_TESTS=1.");
}

const { prisma } = await import("../src/lib/prisma");
let readerId: string;
let readerHouseholdId: string;
let authorId: string;
let authorHouseholdId: string;
const userIds: string[] = [];
const householdIds: string[] = [];
mock.module("@/lib/auth-context", () => ({
  requireAppAuthContext: async () => ({ userId: readerId }),
  resolveActiveMembership: async () => ({ householdId: readerHouseholdId, role: "OWNER" }),
}));
const { POST: planMeals } = await import("../src/app/api/meal-plans/route");
const { createRecipeRevision } = await import("../src/lib/recipe-revisions");
const { generateShoppingListForWeek, getShoppingListForWeek } = await import("../src/lib/shopping-list-service");
const { loadRecipeSearchPage } = await import("../src/lib/recipe-search-service");

beforeAll(async () => {
  for (const label of ["reader", "author"]) {
    const unique = crypto.randomUUID();
    const user = await prisma.user.create({ data: { workosUserId: `test-${unique}`, email: `${unique}@picknic-test.invalid` } });
    userIds.push(user.id);
    const household = await prisma.household.create({ data: { name: `Integration ${label}`, ownerId: user.id } });
    householdIds.push(household.id);
    if (label === "reader") { readerId = user.id; readerHouseholdId = household.id; }
    else { authorId = user.id; authorHouseholdId = household.id; }
  }
});

afterAll(async () => {
  await prisma.shoppingList.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.mealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.recipe.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

function plan(recipeId: string, servingsOverride: number, date = "2030-04-03") {
  return planMeals(new Request("http://localhost/api/meal-plans", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weekStart: "2030-04-01", entries: [{ date, mealType: "DINNER", recipeId, servingsOverride }] }),
  }));
}
function planMany(recipeIds: string[], weekStart = "2030-04-01", date = "2030-04-03") {
  return planMeals(new Request("http://localhost/api/meal-plans", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weekStart, entries: recipeIds.map((recipeId) => ({ date, mealType: "DINNER", recipeId })) }),
  }));
}
const selectedWeek = new Date("2030-04-01");
const generate = () => generateShoppingListForWeek({ householdId: readerHouseholdId, userId: readerId, weekStart: selectedWeek });
const readList = () => getShoppingListForWeek(readerHouseholdId, selectedWeek);

test("plan a future week, shop, change servings, refresh, and retain progress", async () => {
  const recipe = await prisma.recipe.create({ data: {
    householdId: readerHouseholdId, createdById: readerId, title: "Rice bowls", servings: 2,
    ingredients: { create: [{ name: "Rice", quantity: 200, unit: "g", unitId: "metric-gram", position: 1 }, { name: "Salt", quantity: 2, unit: "g", unitId: "metric-gram", position: 2 }] },
  } });
  const planned = await plan(recipe.id, 4);
  expect(planned.status).toBe(201);
  const plannedPayload = await planned.json();
  const first = (await generate())!;
  const rice = first.items.find((item) => item.ingredientName === "Rice")!;
  const salt = first.items.find((item) => item.ingredientName === "Salt")!;
  expect(Number(rice.quantity)).toBe(400);
  expect((await readList())?.isStale).toBe(false);
  expect(await getShoppingListForWeek(readerHouseholdId, new Date("2030-03-25"))).toBeNull();
  await prisma.shoppingListItem.update({ where: { id: rice.id }, data: { status: "BOUGHT" } });
  await prisma.shoppingListItem.update({ where: { id: salt.id }, data: { status: "SKIPPED" } });
  const manual = await prisma.shoppingListItem.create({ data: { shoppingListId: first.id, ingredientName: "Bread", source: "MANUAL", quantity: 1 } });
  expect((await readList())?.isStale).toBe(false);

  await prisma.mealPlanEntry.update({ where: { id: plannedPayload.data.entries[0].id }, data: { servingsOverride: 6 } });
  expect((await readList())?.isStale).toBe(true);
  const refreshed = (await generate())!;
  expect(refreshed.items.find((item) => item.id === rice.id)?.status).toBe("BOUGHT");
  expect(Number(refreshed.items.find((item) => item.id === rice.id)?.quantity)).toBe(600);
  expect(refreshed.items.find((item) => item.id === salt.id)?.status).toBe("SKIPPED");
  expect(refreshed.items.some((item) => item.id === manual.id)).toBe(true);
  expect((await readList())?.isStale).toBe(false);

  await prisma.mealPlanEntry.deleteMany({ where: { mealPlanId: first.mealPlanId! } });
  expect((await readList())?.isStale).toBe(true);
  const empty = (await generate())!;
  expect(empty.items.map((item) => item.id)).toEqual([manual.id]);
  expect((await readList())?.isStale).toBe(false);
}, 20_000);

test("saved shared recipes keep public ingredients after the author makes private edits", async () => {
  const recipe = await prisma.recipe.create({ data: {
    householdId: authorHouseholdId, createdById: authorId, title: "Published rice", servings: 2, visibility: "PUBLIC",
    ingredients: { create: { name: "Published ingredient", quantity: 100, unit: "g", unitId: "metric-gram", position: 1 } },
  } });
  const published = await createRecipeRevision(prisma, recipe.id, authorId);
  await prisma.savedRecipe.create({ data: { userId: readerId, recipeId: recipe.id, lastSeenRevisionId: published.id } });
  await prisma.recipe.update({ where: { id: recipe.id }, data: { visibility: "PRIVATE", title: "Private title", notes: "Private note", ingredients: { updateMany: { where: {}, data: { name: "Private ingredient", quantity: 999 } } } } });

  const response = await plan(recipe.id, 4);
  expect(response.status).toBe(201);
  const payload = await response.json();
  expect(payload.data.entries[0].recipe.title).toBe("Published rice");
  expect(payload.data.entries[0].recipeRevisionId).toBe(published.id);
  const list = (await generate())!;
  expect(list.items.some((item) => item.ingredientName === "Private ingredient")).toBe(false);
  expect(Number(list.items.find((item) => item.ingredientName === "Published ingredient")?.quantity)).toBe(200);
  expect(await prisma.recipeRevision.count({ where: { recipeId: recipe.id } })).toBe(1);

  await prisma.savedRecipe.delete({ where: { userId_recipeId: { userId: readerId, recipeId: recipe.id } } });
  expect((await plan(recipe.id, 4, "2030-04-04")).status).toBe(400);
}, 20_000);

test("search paginates older household recipes and uses only retained public snapshots for saved recipes", async () => {
  const recipe = await prisma.recipe.create({ data: {
    householdId: authorHouseholdId, createdById: authorId, title: "Public Snapshot Tofu", servings: 2, visibility: "PUBLIC", tags: ["snapshotgreen"],
    ingredients: { create: { name: "Snapshot lentils", quantity: 100, unit: "g", unitId: "metric-gram", position: 1 } },
  } });
  const revision = await createRecipeRevision(prisma, recipe.id, authorId);
  await prisma.savedRecipe.create({ data: { userId: readerId, recipeId: recipe.id, lastSeenRevisionId: revision.id } });
  await prisma.recipe.update({ where: { id: recipe.id }, data: { visibility: "PRIVATE", title: "Hidden edit mango", tags: ["hiddeneditdiet"], ingredients: { updateMany: { where: {}, data: { name: "Hidden edit pistachio" } } } } });
  const filler = await prisma.recipe.createMany({ data: Array.from({ length: 52 }, (_, i) => ({ householdId: readerHouseholdId, createdById: readerId, title: `Recent filler ${i}` })) });
  expect(filler.count).toBe(52);
  await prisma.recipe.create({ data: { householdId: readerHouseholdId, createdById: readerId, title: "Old broccoli target", createdAt: new Date("2020-01-01T00:00:00Z"), ingredients: { create: { name: "broccoli leaf", position: 1 } } } });

  const oldMatch = await loadRecipeSearchPage({ userId: readerId, householdId: readerHouseholdId, view: "mine", q: "broccoli", page: "1", pageSize: 24 });
  expect(oldMatch.total).toBe(1);
  expect(oldMatch.items[0]?.title).toBe("Old broccoli target");
  const publishedMatch = await loadRecipeSearchPage({ userId: readerId, householdId: readerHouseholdId, view: "saved", q: "tofu snapshotgreen lentils", page: "1", pageSize: 24 });
  expect(publishedMatch.total).toBe(1);
  expect(publishedMatch.items[0]?.title).toBe("Public Snapshot Tofu");
  for (const privateQuery of ["mango", "pistachio", "hiddeneditdiet"]) {
    const result = await loadRecipeSearchPage({ userId: readerId, householdId: readerHouseholdId, view: "saved", q: privateQuery, page: "1", pageSize: 24 });
    expect(result.total).toBe(0);
  }
}, 20_000);

test("adding dishes to a meal slot preserves existing dishes and freeform notes", async () => {
  const recipes = await Promise.all(["Dish one", "Dish two", "Dish three"].map((title) => prisma.recipe.create({ data: { householdId: readerHouseholdId, createdById: readerId, title } })));
  const week = new Date("2030-04-08T00:00:00.000Z"), date = new Date("2030-04-10T00:00:00.000Z");
  expect((await planMany(recipes.slice(0, 2).map((recipe) => recipe.id), "2030-04-08", "2030-04-10")).status).toBe(201);
  const mealPlan = await prisma.mealPlan.findUniqueOrThrow({ where: { householdId_weekStart: { householdId: readerHouseholdId, weekStart: week } } });
  const note = await prisma.mealPlanEntry.create({ data: { mealPlanId: mealPlan.id, date, mealType: "DINNER", kind: "NOTE", note: "Eat at grandparents" } });
  expect((await planMany([recipes[2]!.id], "2030-04-08", "2030-04-10")).status).toBe(201);
  const entries = await prisma.mealPlanEntry.findMany({ where: { mealPlanId: mealPlan.id, date, mealType: "DINNER" }, include: { recipe: true } });
  expect(entries.filter((entry) => entry.kind === "RECIPE").map((entry) => entry.recipe?.title).sort()).toEqual(["Dish one", "Dish three", "Dish two"]);
  expect(entries.find((entry) => entry.id === note.id)?.note).toBe("Eat at grandparents");
}, 20_000);

test("weekly templates retain recipes, notes and servings, and entries can move without losing details", async () => {
  const recipe = await prisma.recipe.create({ data: { householdId: readerHouseholdId, createdById: readerId, title: "Reusable roast", servings: 4 } });
  const revision = await createRecipeRevision(prisma, recipe.id, readerId);
  const template = await prisma.mealPlanTemplate.create({ data: {
    householdId: readerHouseholdId, createdById: readerId, name: `Reusable ${crypto.randomUUID()}`,
    entries: { create: [
      { dayOffset: 2, mealType: "DINNER", kind: "RECIPE", recipeId: recipe.id, recipeRevisionId: revision.id, servingsOverride: 6 },
      { dayOffset: 4, mealType: "LUNCH", kind: "LEFTOVERS", note: "Use the remaining roast" },
    ] },
  }, include: { entries: true } });
  expect(template.entries).toHaveLength(2);
  expect(template.entries[0]).toMatchObject({ recipeId: recipe.id, recipeRevisionId: revision.id, servingsOverride: 6 });
  const plan = await prisma.mealPlan.create({ data: { householdId: readerHouseholdId, createdById: readerId, weekStart: new Date("2030-05-06T00:00:00Z") } });
  const entry = await prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, date: new Date("2030-05-08T00:00:00Z"), mealType: "DINNER", recipeId: recipe.id, recipeRevisionId: revision.id, servingsOverride: 6 } });
  await prisma.mealPlanEntry.updateMany({ where: { id: entry.id, mealPlan: { householdId: readerHouseholdId } }, data: { date: new Date("2030-05-09T00:00:00Z") } });
  const moved = await prisma.mealPlanEntry.findUniqueOrThrow({ where: { id: entry.id } });
  expect(moved).toMatchObject({ date: new Date("2030-05-09T00:00:00Z"), recipeRevisionId: revision.id, servingsOverride: 6 });
}, 20_000);
