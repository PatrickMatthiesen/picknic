import { MealEntryKind, MealType, Prisma, RecipeVisibility } from "@prisma/client";
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, Plus, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppPageShell } from "@/app/_components/page-shell";
import { RecipeSearchForm } from "@/app/_components/recipe-search-form";
import { RecipeImage } from "@/app/_components/recipe-image";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { addUtcDays, getDateKey, getWeekStartUtc, MAX_PLANNED_SERVINGS, parseDateKey, parsePlannedServings, toUtcDate } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { formatMealType } from "@/lib/recipe-display";
import { ensureRecipeRevision, getPlanningRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";
import { loadRecipeSearchPage } from "@/lib/recipe-search-service";
import { readSearchFilters, type RecipeSearchParams } from "@/lib/recipe-search";
import "./planner.css";

const OPTIONAL_MEAL_TYPES = [MealType.DINNER, MealType.BREAKFAST, MealType.BRUNCH, MealType.LUNCH, MealType.SNACK, MealType.OTHER];
const RECIPE_VIEWS = ["all", "saved", "collections", "discover"] as const;
type RecipeView = (typeof RECIPE_VIEWS)[number];

type PageProps = {
  searchParams: Promise<RecipeSearchParams & { week?: string; day?: string; meal?: string; view?: string; pick?: string; page?: string }>;
};

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function getPlannedRecipe(entry: {
  recipe: { id: string; imageUrl: string | null; servings: number; title: string };
  recipeRevision: { snapshot: Prisma.JsonValue } | null;
}) {
  if (!entry.recipeRevision) return entry.recipe;
  const snapshot = readRecipeSnapshot(entry.recipeRevision.snapshot);
  return {
    id: entry.recipe.id,
    imageUrl: snapshot.imageUrl,
    servings: snapshot.servings,
    title: snapshot.title,
  };
}

export default async function PlannerPage({ searchParams }: PageProps) {
  const search = await searchParams;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return <main className="app-theme-page grid min-h-screen place-items-center p-6">No household is connected to this account.</main>;
  }

  const selectedDate = parseDateKey(search.day);
  const weekStart = getWeekStartUtc(parseDateKey(search.week) ?? selectedDate ?? new Date());
  const weekEnd = addUtcDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, index) => addUtcDays(weekStart, index));
  const todayKey = getDateKey(new Date());
  const selectedDay = selectedDate && selectedDate >= weekStart && selectedDate <= weekEnd
    ? selectedDate
    : days.find((day) => getDateKey(day) === todayKey) ?? weekStart;
  const selectedMealType = Object.values(MealType).includes(search.meal as MealType)
    ? (search.meal as MealType)
    : MealType.DINNER;
  const view = RECIPE_VIEWS.includes(search.view as RecipeView) ? (search.view as RecipeView) : "all";
  const query = search.q?.trim() ?? "";
  const weekKey = getDateKey(weekStart);
  const selectedDayKey = getDateKey(selectedDay);

  async function addEntry(formData: FormData) {
    "use server";
    const recipeId = String(formData.get("recipeId") ?? "");
    const date = parseDateKey(String(formData.get("date") ?? ""));
    const mealType = String(formData.get("mealType") ?? "") as MealType;
    const returnTo = String(formData.get("returnTo") ?? "/planner");
    if (!recipeId || !date || !Object.values(MealType).includes(mealType)) throw new Error("Choose a valid recipe and meal slot.");

    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");

    const recipe = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        OR: [
          { householdId: activeMembership.householdId, deletedAt: null },
          { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
          { saves: { some: { userId: context.userId } }, latestRevisionId: { not: null } },
        ],
      },
      select: { id: true, createdById: true, deletedAt: true, householdId: true, latestRevisionId: true, visibility: true },
    });
    if (!recipe) throw new Error("This recipe is not available to your household.");

    const revision = await getPlanningRevision(prisma, recipe, activeMembership.householdId);
    if (!revision) throw new Error("This shared recipe has no available published revision.");

    const activeWeekStart = getWeekStartUtc(date);
    const plan = await prisma.mealPlan.upsert({
      where: { householdId_weekStart: { householdId: activeMembership.householdId, weekStart: activeWeekStart } },
      update: {},
      create: { householdId: activeMembership.householdId, createdById: context.userId, weekStart: activeWeekStart },
      select: { id: true },
    });
    await prisma.mealPlanEntry.create({
      data: { mealPlanId: plan.id, recipeId, recipeRevisionId: revision.id, date: toUtcDate(date), mealType },
    });
    revalidatePath("/planner");
    revalidatePath("/shopping-list");
    redirect(returnTo);
  }

  async function addNote(formData: FormData) {
    "use server";
    const date = parseDateKey(String(formData.get("date") ?? ""));
    const rawNote = String(formData.get("note") ?? "").trim();
    const kind = String(formData.get("kind") ?? "NOTE") as Exclude<MealEntryKind, "RECIPE">;
    const note = rawNote || ({ LEFTOVERS: "Leftovers", EATING_OUT: "Eating out", NO_PLAN: "Leave open", NOTE: "Meal note" }[kind] ?? "Meal note");
    if (!date || !Object.values(MealEntryKind).filter((value) => value !== MealEntryKind.RECIPE).includes(kind)) throw new Error("Choose a plan type and add a short note.");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const weekStart = getWeekStartUtc(date);
    const plan = await prisma.mealPlan.upsert({
      where: { householdId_weekStart: { householdId: activeMembership.householdId, weekStart } },
      update: {}, create: { householdId: activeMembership.householdId, createdById: context.userId, weekStart },
    });
    await prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, date: toUtcDate(date), mealType: MealType.DINNER, kind, note } });
    revalidatePath("/planner");
    revalidatePath("/shopping-list");
  }

  async function updateServings(formData: FormData) {
    "use server";
    const entryId = String(formData.get("entryId") ?? "");
    const servingsOverride = parsePlannedServings(formData.get("servings"));
    if (!entryId || servingsOverride === null) throw new Error("Choose 1–100 whole servings.");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    await prisma.mealPlanEntry.updateMany({
      where: { id: entryId, mealPlan: { householdId: activeMembership.householdId } },
      data: { servingsOverride },
    });
    revalidatePath("/planner");
    revalidatePath("/shopping-list");
    revalidatePath("/cook");
  }

  async function copyPreviousWeek(formData: FormData) {
    "use server";
    const targetWeek = parseDateKey(String(formData.get("week") ?? ""));
    if (!targetWeek) throw new Error("Choose a valid week.");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const sourceWeek = addUtcDays(getWeekStartUtc(targetWeek), -7);
    const source = await prisma.mealPlan.findUnique({ where: { householdId_weekStart: { householdId: activeMembership.householdId, weekStart: sourceWeek } }, include: { entries: true } });
    if (!source?.entries.length) throw new Error("There are no meals to copy from the previous week.");
    const target = await prisma.mealPlan.upsert({ where: { householdId_weekStart: { householdId: activeMembership.householdId, weekStart: getWeekStartUtc(targetWeek) } }, update: {}, create: { householdId: activeMembership.householdId, createdById: context.userId, weekStart: getWeekStartUtc(targetWeek) } });
    await prisma.mealPlanEntry.createMany({ data: source.entries.map(entry => ({ mealPlanId: target.id, recipeId: entry.recipeId, recipeRevisionId: entry.recipeRevisionId, date: addUtcDays(entry.date, 7), mealType: entry.mealType, servingsOverride: entry.servingsOverride, kind: entry.kind, note: entry.note })) });
    revalidatePath("/planner");
    revalidatePath("/shopping-list");
  }

  async function moveEntry(formData: FormData) {
    "use server";
    const entryId = String(formData.get("entryId") ?? "");
    const date = parseDateKey(String(formData.get("date") ?? ""));
    if (!entryId || !date) throw new Error("Choose a valid date.");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const weekStart = getWeekStartUtc(date);
    const target = await prisma.mealPlan.upsert({ where: { householdId_weekStart: { householdId: activeMembership.householdId, weekStart } }, update: {}, create: { householdId: activeMembership.householdId, createdById: context.userId, weekStart } });
    await prisma.mealPlanEntry.updateMany({ where: { id: entryId, mealPlan: { householdId: activeMembership.householdId } }, data: { mealPlanId: target.id, date: toUtcDate(date) } });
    revalidatePath("/planner");
    revalidatePath("/shopping-list");
    revalidatePath("/cook");
    redirect(`/planner?week=${getDateKey(weekStart)}&day=${getDateKey(date)}`);
  }

  async function saveTemplate(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const templateWeek = parseDateKey(String(formData.get("week") ?? ""));
    if (!name || !templateWeek) throw new Error("Enter a name for this weekly plan.");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const plan = await prisma.mealPlan.findUnique({ where: { householdId_weekStart: { householdId: activeMembership.householdId, weekStart: getWeekStartUtc(templateWeek) } }, include: { entries: true } });
    if (!plan?.entries.length) throw new Error("Add meals before saving a weekly plan.");
    await prisma.mealPlanTemplate.create({ data: { householdId: activeMembership.householdId, createdById: context.userId, name, entries: { create: plan.entries.map(entry => ({ dayOffset: Math.round((entry.date.getTime() - getWeekStartUtc(templateWeek).getTime()) / 86400000), mealType: entry.mealType, kind: entry.kind, note: entry.note, recipeId: entry.recipeId, recipeRevisionId: entry.recipeRevisionId, servingsOverride: entry.servingsOverride })) } } });
    revalidatePath("/planner");
  }

  async function applyTemplate(formData: FormData) {
    "use server";
    const templateId = String(formData.get("templateId") ?? "");
    const targetWeek = parseDateKey(String(formData.get("week") ?? ""));
    if (!templateId || !targetWeek) throw new Error("Choose a saved weekly plan.");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const template = await prisma.mealPlanTemplate.findFirst({ where: { id: templateId, householdId: activeMembership.householdId }, include: { entries: true } });
    if (!template) throw new Error("Saved weekly plan was not found.");
    const weekStart = getWeekStartUtc(targetWeek);
    const target = await prisma.mealPlan.upsert({ where: { householdId_weekStart: { householdId: activeMembership.householdId, weekStart } }, update: {}, create: { householdId: activeMembership.householdId, createdById: context.userId, weekStart } });
    await prisma.mealPlanEntry.createMany({ data: template.entries.map(entry => ({ mealPlanId: target.id, date: addUtcDays(weekStart, entry.dayOffset), mealType: entry.mealType, kind: entry.kind, note: entry.note, recipeId: entry.recipeId, recipeRevisionId: entry.recipeRevisionId, servingsOverride: entry.servingsOverride })) });
    revalidatePath("/planner");
    revalidatePath("/shopping-list");
  }

  function servingsControl(entry: { id: string; servingsOverride: number | null }, recipe: { servings: number; title: string }) {
    return <form action={updateServings} className="planned-servings" key={`${entry.id}:${entry.servingsOverride ?? recipe.servings}`}>
      <input name="entryId" type="hidden" value={entry.id} />
      <label><span>Serves</span><input aria-label={`Servings for ${recipe.title}`} defaultValue={entry.servingsOverride ?? recipe.servings} min={1} max={MAX_PLANNED_SERVINGS} name="servings" required step={1} type="number" /></label>
      <button type="submit">Save</button>
    </form>;
  }

  async function removeEntry(formData: FormData) {
    "use server";
    const entryId = String(formData.get("entryId") ?? "");
    const returnTo = String(formData.get("returnTo") ?? "/planner");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    await prisma.mealPlanEntry.deleteMany({ where: { id: entryId, mealPlan: { householdId: activeMembership.householdId } } });
    revalidatePath("/planner");
    revalidatePath("/shopping-list");
    redirect(returnTo);
  }

  async function toggleSavedRecipe(formData: FormData) {
    "use server";
    const recipeId = String(formData.get("recipeId") ?? "");
    const returnTo = String(formData.get("returnTo") ?? "/planner");
    const context = await requireAppAuthContext();
    const existing = await prisma.savedRecipe.findUnique({ where: { userId_recipeId: { userId: context.userId, recipeId } } });
    if (existing) {
      await prisma.savedRecipe.delete({ where: { userId_recipeId: { userId: context.userId, recipeId } } });
    } else {
      const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
      if (!activeMembership) throw new Error("No household is connected to this account.");
      const available = await prisma.recipe.findFirst({
        where: { id: recipeId, deletedAt: null, OR: [{ householdId: activeMembership.householdId }, { visibility: RecipeVisibility.PUBLIC }] },
        select: { id: true, createdById: true },
      });
      if (!available) throw new Error("This recipe cannot be saved.");
      const revision = await ensureRecipeRevision(prisma, available.id, available.createdById);
      await prisma.savedRecipe.create({ data: { userId: context.userId, recipeId, lastSeenRevisionId: revision.id } });
    }
    revalidatePath("/planner");
    redirect(returnTo);
  }

  const { maxMinutes, diet, exclude } = readSearchFilters(search);
  const filterParams = { q: query || undefined, maxMinutes, diet, exclude };
  const pickerOpen = search.pick === "1" || (search.pick !== "0" && Boolean(search.meal || query || maxMinutes || diet || exclude));
  const pickerHref = (day: string, meal: MealType, source = view, page?: string) =>
    `/planner?${queryString({ week: weekKey, day, meal, view: source, pick: "1", ...filterParams, page })}`;
  const weekHref = `/planner?${queryString({ week: weekKey, day: selectedDayKey, view, pick: "0", ...filterParams })}`;
  const dateLabel = (date: Date) => date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

  if (pickerOpen) {
    const recipePage = await loadRecipeSearchPage({
      userId, householdId: membership.householdId, view, q: query, maxMinutes, diet, exclude, page: search.page, pageSize: 18,
    });
    const visibleRecipes = recipePage.items;
    return (
      <AppPageShell
        currentPath="/planner"
        title={`Pick a recipe for ${formatMealType(selectedMealType).toLowerCase()}`}
        subtitle={selectedDay.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
        eyebrow={<Link className="planner-back" href={weekHref}><ArrowLeft aria-hidden="true" size={16} /> Back to week</Link>}
      >
        <section className="recipe-tray" aria-label="Recipe choices">
          <RecipeSearchForm query={query} maxMinutes={maxMinutes} diet={diet} exclude={exclude}>
            <input name="pick" type="hidden" value="1" />
            <input name="week" type="hidden" value={weekKey} />
            <input name="day" type="hidden" value={selectedDayKey} />
            <input name="meal" type="hidden" value={selectedMealType} />
            <input name="view" type="hidden" value={view} />
          </RecipeSearchForm>
          <nav className="recipe-tabs" aria-label="Recipe source">
            {RECIPE_VIEWS.map((item) => (
              <Link aria-current={item === view ? "page" : undefined} className={item === view ? "is-active" : undefined} href={pickerHref(selectedDayKey, selectedMealType, item)} key={item}>
                {item === "all" ? "All recipes" : item.charAt(0).toUpperCase() + item.slice(1)}
              </Link>
            ))}
          </nav>
          {visibleRecipes.length === 0 ? (
            <div className="recipe-tray-empty">
              <p>{query || maxMinutes || diet || exclude ? "No recipes match your search." : "No recipes in this view yet."}</p>
              {query || maxMinutes || diet || exclude ? <Link className="recipe-empty-action" href={`/planner?${queryString({ week: weekKey, day: selectedDayKey, meal: selectedMealType, pick: "1", view })}`}>Clear search and filters</Link> : null}
              <Link className="app-theme-primary-button recipe-empty-action px-4 py-2 text-sm" href="/recipes/new">
                <Plus aria-hidden="true" size={16} strokeWidth={2} />
                <span>Add recipe</span>
              </Link>
            </div>
          ) : (
            <div className="recipe-tray-grid">
              {visibleRecipes.map((recipe) => (
                <article className="recipe-tile" key={recipe.id}>
                  <RecipeImage alt="" height={128} recipe={recipe} width={192} />
                  <div>
                    <Link href={`/recipes/${recipe.id}`}>{recipe.title}</Link>
                    <p>{recipe.servings} servings</p>
                  </div>
                  <div className="recipe-tile-actions">
                    <form action={addEntry}>
                      <input name="recipeId" type="hidden" value={recipe.id} />
                      <input name="date" type="hidden" value={selectedDayKey} />
                      <input name="mealType" type="hidden" value={selectedMealType} />
                      <input name="returnTo" type="hidden" value={weekHref} />
                      <button aria-label={`Add ${recipe.title} to ${formatMealType(selectedMealType).toLowerCase()}`} className="app-theme-secondary-button" type="submit">Add</button>
                    </form>
                    <form action={toggleSavedRecipe}>
                      <input name="recipeId" type="hidden" value={recipe.id} />
                      <input name="returnTo" type="hidden" value={pickerHref(selectedDayKey, selectedMealType, view, search.page)} />
                      <button aria-label={recipe.saves.length ? `Unsave ${recipe.title}` : `Save ${recipe.title}`} className={recipe.saves.length ? "is-saved" : undefined} type="submit">
                        <Bookmark fill={recipe.saves.length ? "currentColor" : "none"} size={17} />
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
          {recipePage.pageCount > 1 ? <nav aria-label="Recipe result pages" className="recipe-tabs">
            {recipePage.page > 1 ? <Link href={pickerHref(selectedDayKey, selectedMealType, view, String(recipePage.page - 1))}>Previous recipes</Link> : null}
            <span>Page {recipePage.page} of {recipePage.pageCount} · {recipePage.total} recipes</span>
            {recipePage.page < recipePage.pageCount ? <Link href={pickerHref(selectedDayKey, selectedMealType, view, String(recipePage.page + 1))}>More recipes</Link> : null}
          </nav> : null}
        </section>
      </AppPageShell>
    );
  }

  const [mealPlan, templates, cookLogs] = await Promise.all([
    prisma.mealPlan.findUnique({
      where: { householdId_weekStart: { householdId: membership.householdId, weekStart } },
      include: { entries: { orderBy: [{ date: "asc" }, { mealType: "asc" }], include: { recipe: true, recipeRevision: true } } },
    }),
    prisma.mealPlanTemplate.findMany({
      where: { householdId: membership.householdId }, orderBy: { name: "asc" }, select: { id: true, name: true },
    }),
    prisma.cookLog.findMany({
      where: { householdId: membership.householdId, date: { gte: weekStart, lte: weekEnd } },
      orderBy: [{ createdAt: "asc" }, { recipeId: "asc" }],
      select: { date: true, recipeId: true, recipeRevision: { select: { snapshot: true } } },
    }),
  ]);
  const entriesByDay = new Map<string, NonNullable<typeof mealPlan>["entries"]>();
  for (const entry of mealPlan?.entries ?? []) {
    const key = getDateKey(entry.date);
    entriesByDay.set(key, [...(entriesByDay.get(key) ?? []), entry]);
  }
  const cookLogsByDay = new Map<string, typeof cookLogs>();
  for (const log of cookLogs) {
    const key = getDateKey(log.date);
    cookLogsByDay.set(key, [...(cookLogsByDay.get(key) ?? []), log]);
  }
  const previousWeek = getDateKey(addUtcDays(weekStart, -7));
  const nextWeek = getDateKey(addUtcDays(weekStart, 7));
  const noteLabels = {
    [MealEntryKind.NO_PLAN]: "Open day",
    [MealEntryKind.EATING_OUT]: "Eating out",
    [MealEntryKind.LEFTOVERS]: "Leftovers",
    [MealEntryKind.NOTE]: "Note",
  } as const;

  return (
    <AppPageShell
      currentPath="/planner"
      title="Plan your week"
      subtitle={`${dateLabel(weekStart)} – ${dateLabel(weekEnd)}`}
      headerChildren={<>
        <Link aria-label={`Plan a meal for ${selectedDay.toLocaleDateString("en", { weekday: "long", timeZone: "UTC" })}, ${dateLabel(selectedDay)}`} className="app-theme-primary-button planner-action" href={pickerHref(selectedDayKey, MealType.DINNER)}>
          <Plus aria-hidden="true" size={17} /> Plan a meal
        </Link>
        <Link className="app-theme-secondary-button planner-action" href={`/shopping-list?week=${weekKey}`}>
          <ShoppingBasket aria-hidden="true" size={17} /> Shopping list
        </Link>
      </>}
    >
      <div className="planner-week-toolbar">
        <nav className="planner-week-nav" aria-label="Week">
          <Link aria-label="Previous week" href={`/planner?week=${previousWeek}`}><ChevronLeft aria-hidden="true" size={20} /></Link>
          <Link href="/planner">This week</Link>
          <Link aria-label="Next week" href={`/planner?week=${nextWeek}`}><ChevronRight aria-hidden="true" size={20} /></Link>
        </nav>
        <details className="planner-week-options">
          <summary>Week options</summary>
          <div className="planner-settings-panel">
            <form action={copyPreviousWeek}>
              <input name="week" type="hidden" value={weekKey} />
              <button className="app-theme-secondary-button planner-action" type="submit">Copy last week</button>
            </form>
            <form action={saveTemplate}>
              <input name="week" type="hidden" value={weekKey} />
              <label>Save as a weekly plan<input className="app-theme-input" name="name" required /></label>
              <button className="app-theme-secondary-button planner-action" type="submit">Save</button>
            </form>
            <form action={applyTemplate}>
              <input name="week" type="hidden" value={weekKey} />
              <label>Use a saved plan
                <select className="app-theme-input" name="templateId" required>
                  <option value="">Choose a plan</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              <button className="app-theme-secondary-button planner-action" type="submit">Append plan</button>
            </form>
          </div>
        </details>
      </div>

      <section className="week-table planner-days" aria-label="Weekly meal plan">
        {days.map((day) => {
          const dateKey = getDateKey(day);
          const entries = entriesByDay.get(dateKey) ?? [];
          const cooked = cookLogsByDay.get(dateKey) ?? [];
          const dayName = day.toLocaleDateString("en", { weekday: "long", timeZone: "UTC" });
          const isSelected = Boolean(selectedDate && dateKey === selectedDayKey);
          return (
            <article aria-label={`${dayName}, ${dateLabel(day)}${isSelected ? ", selected" : ""}`} className={`week-day${dateKey === todayKey ? " is-today" : ""}${isSelected ? " is-selected" : ""}`} key={dateKey}>
              <header>
                <span>{day.toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span>
                <strong>{day.getUTCDate()}</strong>
              </header>
              {cooked.length > 0 && (
                <ul className="planner-cooked">
                  {cooked.map((log) => (
                    <li key={log.recipeId}>{`Cooked: ${readRecipeSnapshot(log.recipeRevision.snapshot).title}`}</li>
                  ))}
                </ul>
              )}
              {entries.length === 0 ? <p className="planner-empty-day">No meals planned</p> : (
                <ul className="planner-entries">
                  {entries.map((entry) => {
                    const recipe = entry.recipe ? getPlannedRecipe({ ...entry, recipe: entry.recipe }) : null;
                    const label = formatMealType(entry.mealType);
                    const noteLabel = entry.kind === MealEntryKind.RECIPE ? "Recipe" : noteLabels[entry.kind];
                    return (
                      <li className="planner-entry" key={entry.id}>
                        <p className="planner-entry-label">{label}</p>
                        {recipe ? (
                          <Link className="planner-entry-recipe" href={`/recipes/${recipe.id}`}>
                            <RecipeImage alt="" height={112} recipe={recipe} width={168} />
                            {recipe.title}
                          </Link>
                        ) : <p className="planner-entry-note"><strong>{noteLabel}</strong>{entry.note && <span>{entry.note}</span>}</p>}
                        {recipe && <p className="planner-entry-meta">{entry.servingsOverride ?? recipe.servings} servings</p>}
                        <details className="planner-entry-options">
                          <summary aria-label={`Options for ${recipe?.title ?? noteLabel}, ${dayName} ${label.toLowerCase()}`}>Options</summary>
                          <div className="planner-entry-tools">
                            {recipe && <Link className="planner-back" href={`/cook?date=${dateKey}&entry=${entry.id}`}>Cook this meal</Link>}
                            {recipe && servingsControl(entry, recipe)}
                            <form action={moveEntry} className="planned-servings">
                              <input name="entryId" type="hidden" value={entry.id} />
                              <label>Move to<input name="date" type="date" required /></label>
                              <button type="submit">Move</button>
                            </form>
                            <form action={removeEntry}>
                              <input name="entryId" type="hidden" value={entry.id} />
                              <input name="returnTo" type="hidden" value={weekHref} />
                              <button className="planner-remove" type="submit">Remove from plan</button>
                            </form>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
              <details className="add-meal-menu">
                <summary aria-label={`Add to ${dayName}`}><Plus aria-hidden="true" size={15} /> Add meal</summary>
                <div className="add-meal-options">
                  <p>Pick a recipe for</p>
                  <div className="add-meal-links">
                    {OPTIONAL_MEAL_TYPES.map((type) => (
                      <Link href={pickerHref(dateKey, type)} key={type}>{formatMealType(type)}</Link>
                    ))}
                  </div>
                  <form action={addNote} className="meal-note-editor">
                    <input name="date" type="hidden" value={dateKey} />
                    <label>Plan type<select name="kind" defaultValue="LEFTOVERS"><option value="LEFTOVERS">Leftovers</option><option value="EATING_OUT">Eating out</option><option value="NOTE">Other note</option><option value="NO_PLAN">Leave open</option></select></label>
                    <label>Note (optional)<input name="note" /></label>
                    <button className="app-theme-primary-button" type="submit">Add to day</button>
                  </form>
                </div>
              </details>
            </article>
          );
        })}
      </section>
    </AppPageShell>
  );
}
