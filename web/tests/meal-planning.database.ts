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
const selectedWeek = new Date("2030-04-01");
const generate = () => generateShoppingListForWeek({ householdId: readerHouseholdId, userId: readerId, weekStart: selectedWeek });
const readList = () => getShoppingListForWeek(readerHouseholdId, selectedWeek);

test("plan a future week, shop, change servings, refresh, and retain progress", async () => {
  const recipe = await prisma.recipe.create({ data: {
    householdId: readerHouseholdId, createdById: readerId, title: "Rice bowls", servings: 2,
    ingredients: { create: [{ name: "Rice", quantity: 200, unit: "g", unitId: "metric-gram", position: 1 }, { name: "Salt", quantity: 2, unit: "g", unitId: "metric-gram", position: 2 }] },
  } });
  expect((await plan(recipe.id, 4)).status).toBe(201);
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

  expect((await plan(recipe.id, 6)).status).toBe(201);
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
