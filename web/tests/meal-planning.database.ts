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
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
const { POST: planMeals } = await import("../src/app/api/meal-plans/route");
const { POST: saveRecipe } = await import("../src/app/api/recipes/route");
const { GET: listCaptures } = await import("../src/app/api/recipes/captures/route");
const { DELETE: deleteCapture } = await import("../src/app/api/recipes/captures/[captureId]/route");
const { GET: getCapturePhoto } = await import("../src/app/api/recipes/captures/[captureId]/photos/[photoId]/route");
const { createRecipeRevision } = await import("../src/lib/recipe-revisions");
const { generateShoppingListForWeek, getShoppingListForWeek } = await import("../src/lib/shopping-list-service");
const { loadRecipeSearchPage } = await import("../src/lib/recipe-search-service");
const { logCookedToday, swapCookedMeal } = await import("../src/app/cook/cook-log-actions");
const { addUtcDays, getDateKey, getWeekStartUtc, toUtcDate } = await import("../src/lib/meal-plan");

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

test("a standalone cook logs once and atomically swaps the selected entries' dates", async () => {
  const today = toUtcDate(new Date());
  const weekStart = getWeekStartUtc(today);
  const plannedDate = addUtcDays(today, today.getUTCDay() === 0 ? -1 : 1);
  const recipe = await prisma.recipe.create({ data: { householdId: readerHouseholdId, createdById: readerId, title: "Cooked soup" } });
  const revision = await createRecipeRevision(prisma, recipe.id, readerId);
  const plan = await prisma.mealPlan.create({ data: { householdId: readerHouseholdId, createdById: readerId, weekStart } });
  const otherPlan = await prisma.mealPlan.create({ data: { householdId: authorHouseholdId, createdById: authorId, weekStart } });
  const [planned, selected, unselected, foreign] = await Promise.all([
    prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, date: plannedDate, mealType: "DINNER", recipeId: recipe.id, recipeRevisionId: revision.id, servingsOverride: 5 } }),
    prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, date: today, mealType: "DINNER", kind: "NOTE", note: "Dinner at home" } }),
    prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, date: today, mealType: "DINNER", kind: "LEFTOVERS" } }),
    prisma.mealPlanEntry.create({ data: { mealPlanId: otherPlan.id, date: today, mealType: "DINNER", kind: "NOTE" } }),
  ]);
  const logInput = { recipeId: recipe.id, recipeRevisionId: recipe.id, dateKey: getDateKey(today) };
  const swapInput = { ...logInput, plannedEntryId: planned.id, plannedDateKey: getDateKey(plannedDate), todayEntryId: selected.id };
  await expect(swapCookedMeal(swapInput)).rejects.toThrow("Log the cooked meal");
  await expect(logCookedToday({ ...logInput, dateKey: getDateKey(addUtcDays(today, -2)) })).rejects.toThrow("today's date");

  await Promise.all([logCookedToday(logInput), logCookedToday(logInput)]);
  const cookLogs = await prisma.cookLog.findMany({ where: { householdId: readerHouseholdId, date: today, recipeId: recipe.id }, include: { recipeRevision: true } });
  expect(cookLogs).toHaveLength(1);
  expect(cookLogs[0]?.recipeRevision).toMatchObject({ recipeId: recipe.id, version: 2 });
  expect(await prisma.recipeRevision.count({ where: { recipeId: recipe.id } })).toBe(2);

  await expect(swapCookedMeal({ ...swapInput, plannedDateKey: logInput.dateKey })).rejects.toThrow("planned meal changed");
  await expect(swapCookedMeal({ ...swapInput, todayEntryId: foreign.id })).rejects.toThrow("Today's meal plan changed");
  await expect(swapCookedMeal({ ...swapInput, todayEntryId: "" })).rejects.toThrow("Today's meal plan changed");
  const duplicate = await prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, date: today, mealType: "DINNER", recipeId: recipe.id, recipeRevisionId: revision.id } });
  await expect(swapCookedMeal(swapInput)).rejects.toThrow("already planned");
  await prisma.mealPlanEntry.delete({ where: { id: duplicate.id } });

  const swaps = await Promise.allSettled([swapCookedMeal(swapInput), swapCookedMeal(swapInput)]);
  expect(swaps.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  const entries = await prisma.mealPlanEntry.findMany({ where: { mealPlanId: plan.id } });
  expect(entries.find((entry) => entry.id === planned.id)).toMatchObject({ date: today, recipeId: recipe.id, recipeRevisionId: revision.id, servingsOverride: 5 });
  expect(entries.find((entry) => entry.id === selected.id)).toMatchObject({ date: plannedDate, note: "Dinner at home" });
  expect(entries.find((entry) => entry.id === unselected.id)?.date).toEqual(today);
  await expect(swapCookedMeal(swapInput)).rejects.toThrow("already moved");

  const breakfast = await prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, date: plannedDate, mealType: "BREAKFAST", recipeId: recipe.id, recipeRevisionId: revision.id } });
  await expect(swapCookedMeal({ ...swapInput, plannedEntryId: breakfast.id, todayEntryId: "" })).rejects.toThrow("already moved");
}, 20_000);

test("cook logs verify shared revisions and can move a recipe into an empty meal slot", async () => {
  const today = toUtcDate(new Date());
  const weekStart = getWeekStartUtc(today);
  const plannedDate = addUtcDays(today, today.getUTCDay() === 0 ? -1 : 1);
  const recipe = await prisma.recipe.create({ data: { householdId: authorHouseholdId, createdById: authorId, title: "Shared tart", visibility: "PUBLIC" } });
  const published = await createRecipeRevision(prisma, recipe.id, authorId);
  await prisma.recipe.update({ where: { id: recipe.id }, data: { visibility: "PRIVATE" } });
  const privateRevision = await createRecipeRevision(prisma, recipe.id, authorId);
  const plan = await prisma.mealPlan.upsert({
    where: { householdId_weekStart: { householdId: readerHouseholdId, weekStart } },
    create: { householdId: readerHouseholdId, createdById: readerId, weekStart },
    update: {},
  });
  const entry = await prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, date: plannedDate, mealType: "LUNCH", recipeId: recipe.id, recipeRevisionId: published.id } });
  const input = { recipeId: recipe.id, recipeRevisionId: published.id, dateKey: getDateKey(today) };
  await expect(logCookedToday({ ...input, recipeRevisionId: privateRevision.id })).rejects.toThrow("recipe revision is not available");
  await logCookedToday(input);
  await swapCookedMeal({ ...input, plannedEntryId: entry.id, plannedDateKey: getDateKey(plannedDate), todayEntryId: "" });
  expect(await prisma.mealPlanEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ date: today, recipeRevisionId: published.id });
});

test("recipe captures scope photos to the uploader's active household and save only once", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const title = "Recipe from a photo";
  const reviewedTitle = "Reviewed recipe from a photo";
  const seedCapture = (userId: string, householdId: string) => prisma.recipeCapture.create({
    data: {
      userId, householdId, status: "READY", draft: { title },
      photos: { create: { bytes, contentType: "image/jpeg", position: 0 } },
    },
    include: { photos: true },
  });
  const capture = await seedCapture(readerId, readerHouseholdId);
  const otherUploader = await seedCapture(authorId, readerHouseholdId);
  const otherHousehold = await seedCapture(readerId, authorHouseholdId);
  const list = await listCaptures();
  expect((await list.json()).data.map(({ id }: { id: string }) => id)).toEqual([capture.id]);

  const photo = (captureId: string, photoId: string) => getCapturePhoto(
    new Request(`http://localhost/api/recipes/captures/${captureId}/photos/${photoId}`),
    { params: Promise.resolve({ captureId, photoId }) },
  );
  const response = await photo(capture.id, capture.photos[0]!.id);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect((await photo(otherUploader.id, otherUploader.photos[0]!.id)).status).toBe(404);
  expect((await photo(otherHousehold.id, otherHousehold.photos[0]!.id)).status).toBe(404);

  const save = (servings: number | null = 4) => saveRecipe(new Request("http://localhost/api/recipes", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ captureId: capture.id, title: reviewedTitle, servings }),
  }));
  expect((await save(null)).status).toBe(400);
  const attempts = await Promise.all([save(), save()]);
  expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
  const { data: recipe } = await attempts.find(({ status }) => status === 201)!.json();
  expect(await prisma.recipe.count({ where: { householdId: readerHouseholdId, title: reviewedTitle } })).toBe(1);
  expect((await prisma.recipeCapture.findUnique({ where: { id: capture.id } }))?.savedRecipeId).toBe(recipe.id);
  expect((await (await listCaptures()).json()).data[0]).toMatchObject({ id: capture.id, title: reviewedTitle });

  const deletion = await deleteCapture(
    new Request(`http://localhost/api/recipes/captures/${capture.id}`, { method: "DELETE" }),
    { params: Promise.resolve({ captureId: capture.id }) },
  );
  expect(deletion.status).toBe(204);
  expect(await prisma.recipeCapturePhoto.count({ where: { captureId: capture.id } })).toBe(0);
  expect(await prisma.recipe.count({ where: { id: recipe.id } })).toBe(1);
});

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

test("deleted household recipes remain searchable through saves and collections using their published snapshot", async () => {
  const recipe = await prisma.recipe.create({ data: {
    householdId: readerHouseholdId, createdById: readerId, title: "Retained household soup", visibility: "PUBLIC",
    tags: ["retainedhousehold"], ingredients: { create: [{ name: "retained turnip", position: 1 }] },
  } });
  const published = await createRecipeRevision(prisma, recipe.id, readerId);
  await prisma.savedRecipe.create({ data: { userId: readerId, recipeId: recipe.id, lastSeenRevisionId: published.id } });
  const collection = await prisma.recipeCollection.create({ data: {
    userId: readerId, name: "Retained household recipes", items: { create: [{ recipeId: recipe.id, position: 1 }] },
  } });
  await prisma.recipe.update({ where: { id: recipe.id }, data: {
    deletedAt: new Date(), visibility: "PRIVATE", title: "Deleted live title", tags: ["deletedlivetag"],
    ingredients: { deleteMany: {}, create: [{ name: "deleted live ingredient", position: 1 }] },
  } });
  for (const view of ["mine", "saved", "collections"] as const) {
    const options = { userId: readerId, householdId: readerHouseholdId, view, collectionId: collection.id };
    const result = await loadRecipeSearchPage({ ...options, q: "soup retainedhousehold turnip" });
    expect(result.items.map(item => item.id)).toEqual([recipe.id]);
    expect(result.items[0]?.title).toBe("Retained household soup");
    expect((await loadRecipeSearchPage({ ...options, q: "deleted live" })).total).toBe(0);
  }
});

test("search paginates older household recipes and uses only retained public snapshots for saved recipes", async () => {
  const recipe = await prisma.recipe.create({ data: {
    householdId: authorHouseholdId, createdById: authorId, title: "Public Snapshot Tofu", servings: 2, totalTimeMinutes: 25, visibility: "PUBLIC", tags: ["snapshotgreen"],
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
  const firstPage = await loadRecipeSearchPage({ userId: readerId, householdId: readerHouseholdId, view: "mine", page: "1", pageSize: 24 });
  const nextPage = await loadRecipeSearchPage({ userId: readerId, householdId: readerHouseholdId, view: "mine", page: "2", pageSize: 24 });
  expect(firstPage.items).toHaveLength(24);
  expect(nextPage.items).toHaveLength(24);
  expect(nextPage.items.some(recipe => firstPage.items.some(first => first.id === recipe.id))).toBe(false);

  const publishedMatch = await loadRecipeSearchPage({ userId: readerId, householdId: readerHouseholdId, view: "saved", q: "tofu snapshotgreen lentils", page: "1", pageSize: 24 });
  expect(publishedMatch.total).toBe(1);
  expect(publishedMatch.items[0]?.title).toBe("Public Snapshot Tofu");
  const filters = { userId: readerId, householdId: readerHouseholdId, view: "saved" as const, q: "tofu", diet: "SnapshotGreen" };
  expect((await loadRecipeSearchPage({ ...filters, maxMinutes: "30" })).total).toBe(1);
  expect((await loadRecipeSearchPage({ ...filters, maxMinutes: "15" })).total).toBe(0);
  expect((await loadRecipeSearchPage({ ...filters, exclude: "lentils" })).total).toBe(0);

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


test("invitation reservations serialize concurrent sends and apply both account and household budgets", async () => {
  const { reserveHouseholdInvitation } = await import("../src/lib/household-invitations");
  const concurrent = await Promise.all([
    reserveHouseholdInvitation(readerHouseholdId, readerId),
    reserveHouseholdInvitation(readerHouseholdId, readerId),
  ]);
  expect(concurrent.filter(result => result.allowed)).toHaveLength(1);
  expect(concurrent.filter(result => !result.allowed)).toHaveLength(1);
  // The same account cannot evade cooldown by using a different household.
  expect((await reserveHouseholdInvitation(authorHouseholdId, readerId)).allowed).toBe(false);
  // Another owner in the same household shares its cooldown.
  expect((await reserveHouseholdInvitation(readerHouseholdId, authorId)).allowed).toBe(false);
  const records = await prisma.householdInvitationAttempt.findMany({ where: { requestedById: readerId } });
  expect(records).toHaveLength(1);
  expect(records[0]?.status).toBe("RESERVED");
});
