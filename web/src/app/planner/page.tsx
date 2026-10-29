import { MealEntryKind, MealType, Prisma, RecipeVisibility } from "@prisma/client";
import { Bookmark, CalendarDays, ChevronLeft, ChevronRight, Plus, Search, ShoppingBasket, Trash2 } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppPageShell } from "@/app/_components/page-shell";
import { RecipeImage } from "@/app/_components/recipe-image";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { addUtcDays, getDateKey, getWeekStartUtc, MAX_PLANNED_SERVINGS, parseDateKey, parsePlannedServings, toUtcDate } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { formatMealType } from "@/lib/recipe-display";
import { ensureRecipeRevision, getPlanningRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";
import { loadRecipeSearchPage } from "@/lib/recipe-search-service";

const OPTIONAL_MEAL_TYPES = [MealType.DINNER, MealType.BREAKFAST, MealType.BRUNCH, MealType.LUNCH, MealType.SNACK, MealType.OTHER];
const RECIPE_VIEWS = ["all", "saved", "collections", "discover"] as const;
type RecipeView = (typeof RECIPE_VIEWS)[number];

type PageProps = {
  searchParams: Promise<{ week?: string; day?: string; meal?: string; view?: string; q?: string; page?: string; maxMinutes?: string; diet?: string; exclude?: string }>;
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

  const requestedWeek = parseDateKey(search.week);
  const weekStart = getWeekStartUtc(requestedWeek ?? new Date());
  const weekEnd = addUtcDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, index) => addUtcDays(weekStart, index));
  const todayKey = getDateKey(new Date());
  const selectedDate = parseDateKey(search.day);
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

  const maxMinutes = search.maxMinutes;
  const diet = search.diet;
  const exclude = search.exclude;
  const [mealPlan, recipePage, templates] = await Promise.all([
    prisma.mealPlan.findUnique({
      where: { householdId_weekStart: { householdId: membership.householdId, weekStart } },
      include: { entries: { orderBy: [{ date: "asc" }, { mealType: "asc" }], include: { recipe: true, recipeRevision: true } } },
    }),
    loadRecipeSearchPage({ userId, householdId: membership.householdId, view, q: query, maxMinutes, diet, exclude, page: search.page, pageSize: 18 }),
    prisma.mealPlanTemplate.findMany({ where: { householdId: membership.householdId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const returnTo = `/planner?${queryString({ week: weekKey, day: selectedDayKey, meal: selectedMealType, view, q: query || undefined, maxMinutes, diet, exclude })}`;
  const visibleRecipes = recipePage.items;
  const entriesByDay = new Map<string, NonNullable<typeof mealPlan>["entries"]>();
  for (const entry of mealPlan?.entries ?? []) {
    const key = getDateKey(entry.date);
    entriesByDay.set(key, [...(entriesByDay.get(key) ?? []), entry]);
  }
  const previousWeek = getDateKey(addUtcDays(weekStart, -7));
  const nextWeek = getDateKey(addUtcDays(weekStart, 7));

  return (
    <AppPageShell
      currentPath="/planner"
      title="This week"
      subtitle={`${weekStart.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })} – ${weekEnd.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}`}
      headerChildren={
        <div className="week-controls">
          <Link aria-label="Previous week" href={`/planner?week=${previousWeek}`}><ChevronLeft size={18} /></Link>
          <Link className="today-link" href="/planner"><CalendarDays size={17} /> Today</Link>
          <Link aria-label="Next week" href={`/planner?week=${nextWeek}`}><ChevronRight size={18} /></Link>
          <Link className="today-link" href={`/shopping-list?week=${weekKey}`}><ShoppingBasket size={17} /> Shop this week</Link>
          <form action={copyPreviousWeek}><input name="week" type="hidden" value={weekKey} /><button className="today-link" type="submit">Copy last week</button></form>
          <details className="weekly-plan-menu"><summary>Weekly plans</summary><form action={saveTemplate}><input name="week" type="hidden" value={weekKey} /><input aria-label="Weekly plan name" name="name" placeholder="Name this week" required /><button type="submit">Save</button></form><form action={applyTemplate}><input name="week" type="hidden" value={weekKey} /><select aria-label="Saved weekly plan" name="templateId" required><option value="">Choose saved plan</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select><button type="submit">Append plan</button></form></details>
        </div>
      }
    >
      <section className="week-table" aria-label="Weekly meal plan">
        {days.map((day) => {
          const dateKey = getDateKey(day);
          const entries = entriesByDay.get(dateKey) ?? [];
          const dinner = entries.find((entry) => entry.mealType === MealType.DINNER && entry.recipeId) ?? entries.find((entry) => entry.mealType === MealType.DINNER);
          const extras = entries.filter((entry) => entry.id !== dinner?.id);
          const dinnerRecipe = dinner?.recipe ? getPlannedRecipe({ ...dinner, recipe: dinner.recipe }) : null;
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDayKey;

          return (
            <article className={`week-day ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`} key={dateKey}>
              <header>
                <span>{day.toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span>
                <strong>{day.getUTCDate()}</strong>
              </header>
              <div className="dinner-slot">
                <span className="meal-label">Dinner</span>
                {dinner && dinnerRecipe ? (
                  <div className="planned-meal">
                    <RecipeImage alt="" height={112} loading="eager" recipe={dinnerRecipe} width={168} />
                    <span className="planned-badge">Planned</span>
                    {dinner.recipe ? <Link href={`/recipes/${dinner.recipe.id}`}>{dinnerRecipe.title}</Link> : <span>{dinner.note ?? "No plan"}</span>}
                    {dinner.recipe ? servingsControl(dinner, dinnerRecipe) : null}
                    <details className="reschedule-meal"><summary>Reschedule</summary><form action={moveEntry} className="planned-servings"><input name="entryId" type="hidden" value={dinner.id} /><label>Move to<input aria-label={`Move ${dinnerRecipe.title} to date`} name="date" type="date" required /></label><button type="submit">Move</button></form></details>
                    <form action={removeEntry} className="remove-planned-meal">
                      <input name="entryId" type="hidden" value={dinner.id} />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <button aria-label={`Remove ${dinnerRecipe.title} from ${dateKey}`} type="submit"><Trash2 size={15} /></button>
                    </form>
                  </div>
                ) : dinner ? (
                  <div className="planned-meal planned-note"><span className="meal-label">{dinner.kind === MealEntryKind.NO_PLAN ? "Open day" : dinner.kind === MealEntryKind.EATING_OUT ? "Eating out" : dinner.kind === MealEntryKind.LEFTOVERS ? "Leftovers" : "Note"}</span><span>{dinner.note}</span><details className="reschedule-meal"><summary>Reschedule</summary><form action={moveEntry} className="planned-servings"><input name="entryId" type="hidden" value={dinner.id} /><label>Move to<input aria-label={`Move meal note for ${dateKey}`} name="date" type="date" required /></label><button type="submit">Move</button></form></details><form action={removeEntry} className="remove-planned-meal"><input name="entryId" type="hidden" value={dinner.id} /><input name="returnTo" type="hidden" value={returnTo} /><button aria-label="Remove meal note" type="submit"><Trash2 size={15} /></button></form></div>
                ) : (
                  <Link className="empty-meal" href={`/planner?${queryString({ week: weekKey, day: dateKey, meal: MealType.DINNER, view })}`}>
                    <Plus size={18} />
                    <span>Not planning</span>
                    <small>Pick a recipe</small>
                  </Link>
                )}
              </div>
              {extras.length > 0 ? (
                <div className="extra-meals">
                  {extras.map((entry) => {
                    const plannedRecipe = entry.recipe ? getPlannedRecipe({ ...entry, recipe: entry.recipe }) : null;
                    return <div key={entry.id}>
                      <span>{formatMealType(entry.mealType)}</span>
                      {plannedRecipe && entry.recipe ? <Link href={`/recipes/${entry.recipe.id}`}>{plannedRecipe.title}</Link> : <span>{entry.note ?? "No plan"}</span>}
                      {plannedRecipe ? servingsControl(entry, plannedRecipe) : null}
                      {<details className="reschedule-meal"><summary>Reschedule</summary><form action={moveEntry} className="planned-servings"><input name="entryId" type="hidden" value={entry.id} /><label>Move to<input aria-label={`Move ${plannedRecipe?.title ?? entry.note ?? "meal"} to date`} name="date" type="date" required /></label><button type="submit">Move</button></form></details>}
                      <form action={removeEntry} className="remove-planned-meal">
                        <input name="entryId" type="hidden" value={entry.id} />
                        <input name="returnTo" type="hidden" value={returnTo} />
                        <button aria-label={`Remove ${plannedRecipe?.title ?? entry.note ?? "meal"}`} type="submit"><Trash2 size={14} /></button>
                      </form>
                    </div>;
                  })}
                </div>
              ) : null}
              <details className="add-meal-menu">
                <summary><Plus size={15} /> Add another meal</summary>
                <div>
                  {OPTIONAL_MEAL_TYPES.map((type) => (
                    <Link href={`/planner?${queryString({ week: weekKey, day: dateKey, meal: type, view })}`} key={type}>{formatMealType(type)}</Link>
                  ))}
                </div>
              </details>
              <details className="meal-note-editor"><summary>Leftovers, eating out or note</summary><form action={addNote}>
                <input name="date" type="hidden" value={dateKey} />
                <select aria-label="Plan type" name="kind" defaultValue="LEFTOVERS"><option value="LEFTOVERS">Leftovers</option><option value="EATING_OUT">Eating out</option><option value="NOTE">Other note</option><option value="NO_PLAN">Leave open</option></select>
                <input aria-label={`Meal note for ${dateKey}`} name="note" placeholder="Note (optional)" />
                <button type="submit">Add</button>
              </form></details>
            </article>
          );
        })}
      </section>

      <section className="recipe-tray" aria-labelledby="recipe-tray-title">
        <div className="recipe-tray-toolbar">
          <div>
            <p className="app-theme-muted text-xs">Planning {formatMealType(selectedMealType).toLowerCase()} for {selectedDay.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</p>
            <h2 id="recipe-tray-title">Find a recipe</h2>
          </div>
          <form className="recipe-search planner-search" method="get">
            <input name="week" type="hidden" value={weekKey} />
            <input name="day" type="hidden" value={selectedDayKey} />
            <input name="meal" type="hidden" value={selectedMealType} />
            <input name="view" type="hidden" value={view} />
            <Search aria-hidden="true" size={17} />
            <input defaultValue={query} name="q" placeholder="Title, ingredient or tag" aria-label="Search recipes, ingredients and tags" />
            <input aria-label="Maximum cooking time in minutes" defaultValue={maxMinutes} name="maxMinutes" placeholder="Max min" type="number" min={1} />
            <input aria-label="Diet tag" defaultValue={diet} name="diet" placeholder="Diet tag" />
            <input aria-label="Exclude ingredients" defaultValue={exclude} name="exclude" placeholder="Exclude ingredients" /><button type="submit">Search</button>
          </form>
        </div>
        <nav className="recipe-tabs" aria-label="Recipe source">
          {RECIPE_VIEWS.map((item) => (
            <Link className={item === view ? "is-active" : undefined} href={`/planner?${queryString({ week: weekKey, day: selectedDayKey, meal: selectedMealType, view: item, q: query || undefined, maxMinutes, diet, exclude })}`} key={item}>
              {item === "all" ? "All recipes" : item.charAt(0).toUpperCase() + item.slice(1)}
            </Link>
          ))}
        </nav>
        {visibleRecipes.length === 0 ? (
          <div className="recipe-tray-empty">
            <p>No recipes match this view.</p>
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
                    <input name="returnTo" type="hidden" value={returnTo} />
                    <button className="app-theme-primary-button" type="submit">Plan</button>
                  </form>
                  <form action={toggleSavedRecipe}>
                    <input name="recipeId" type="hidden" value={recipe.id} />
                    <input name="returnTo" type="hidden" value={returnTo} />
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
          {recipePage.page > 1 ? <Link href={`/planner?${queryString({ week: weekKey, day: selectedDayKey, meal: selectedMealType, view, q: query || undefined, maxMinutes, diet, exclude, page: String(recipePage.page - 1) })}`}>Previous recipes</Link> : null}
          <span>Page {recipePage.page} of {recipePage.pageCount} · {recipePage.total} recipes</span>
          {recipePage.page < recipePage.pageCount ? <Link href={`/planner?${queryString({ week: weekKey, day: selectedDayKey, meal: selectedMealType, view, q: query || undefined, maxMinutes, diet, exclude, page: String(recipePage.page + 1) })}`}>More recipes</Link> : null}
        </nav> : null}
      </section>
    </AppPageShell>
  );
}
