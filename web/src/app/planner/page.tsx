import { MealType, Prisma, RecipeVisibility } from "@prisma/client";
import { Bookmark, CalendarDays, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppPageShell } from "@/app/_components/page-shell";
import { RecipeImage } from "@/app/_components/recipe-image";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { addUtcDays, getDateKey, getWeekStartUtc, parseDateKey, toUtcDate } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { formatMealType } from "@/lib/recipe-display";
import { ensureRecipeRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";

const OPTIONAL_MEAL_TYPES = [MealType.BREAKFAST, MealType.BRUNCH, MealType.LUNCH, MealType.SNACK, MealType.OTHER];
const RECIPE_VIEWS = ["all", "saved", "collections", "discover"] as const;
type RecipeView = (typeof RECIPE_VIEWS)[number];

type PageProps = {
  searchParams: Promise<{ week?: string; day?: string; meal?: string; view?: string; q?: string }>;
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

    const activeWeekStart = getWeekStartUtc(date);
    const plan = await prisma.mealPlan.upsert({
      where: { householdId_weekStart: { householdId: activeMembership.householdId, weekStart: activeWeekStart } },
      update: {},
      create: { householdId: activeMembership.householdId, createdById: context.userId, weekStart: activeWeekStart },
      select: { id: true },
    });
    const revision = recipe.householdId !== activeMembership.householdId
      && (recipe.visibility !== RecipeVisibility.PUBLIC || recipe.deletedAt)
      && recipe.latestRevisionId
      ? await prisma.recipeRevision.findUniqueOrThrow({ where: { id: recipe.latestRevisionId } })
      : await ensureRecipeRevision(prisma, recipe.id, recipe.createdById);
    await prisma.mealPlanEntry.upsert({
      where: { mealPlanId_date_mealType: { mealPlanId: plan.id, date: toUtcDate(date), mealType } },
      update: { recipeId, recipeRevisionId: revision.id },
      create: { mealPlanId: plan.id, recipeId, recipeRevisionId: revision.id, date: toUtcDate(date), mealType },
    });
    revalidatePath("/planner");
    redirect(returnTo);
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

  const [mealPlan, recipes] = await Promise.all([
    prisma.mealPlan.findUnique({
      where: { householdId_weekStart: { householdId: membership.householdId, weekStart } },
      include: { entries: { orderBy: [{ date: "asc" }, { mealType: "asc" }], include: { recipe: true, recipeRevision: true } } },
    }),
    prisma.recipe.findMany({
      where: {
        ...(query && (view === "all" || view === "discover") ? { title: { contains: query, mode: "insensitive" } } : {}),
        ...(view === "saved" ? { saves: { some: { userId } } } : {}),
        ...(view === "collections" ? { collectionItems: { some: { collection: { userId } } } } : {}),
        ...(view === "discover"
          ? { deletedAt: null, visibility: RecipeVisibility.PUBLIC, NOT: { householdId: membership.householdId } }
          : view === "all"
            ? { deletedAt: null, OR: [{ householdId: membership.householdId }, { visibility: RecipeVisibility.PUBLIC }] }
            : {}),
      },
      include: { saves: { where: { userId }, select: { userId: true, lastSeenRevisionId: true } } },
      orderBy: [{ updatedAt: "desc" }],
      take: 18,
    }),
  ]);

  const returnTo = `/planner?${queryString({ week: weekKey, day: selectedDayKey, meal: selectedMealType, view, q: query || undefined })}`;
  const retainedRevisionIds = recipes
    .filter((recipe) => recipe.householdId !== membership.householdId && (recipe.visibility !== RecipeVisibility.PUBLIC || recipe.deletedAt))
    .map((recipe) => recipe.latestRevisionId)
    .filter((id): id is string => id !== null);
  const retainedRevisions = retainedRevisionIds.length
    ? await prisma.recipeRevision.findMany({ where: { id: { in: retainedRevisionIds } } })
    : [];
  const retainedSnapshots = new Map(retainedRevisions.map((revision) => [revision.id, readRecipeSnapshot(revision.snapshot)]));
  const displayRecipes = recipes.map((recipe) => {
    const snapshot = recipe.latestRevisionId ? retainedSnapshots.get(recipe.latestRevisionId) : null;
    return snapshot ? { ...recipe, ...snapshot, id: recipe.id } : recipe;
  });
  const visibleRecipes = query
    ? displayRecipes.filter((recipe) => recipe.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    : displayRecipes;
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
        </div>
      }
    >
      <section className="week-table" aria-label="Weekly meal plan">
        {days.map((day) => {
          const dateKey = getDateKey(day);
          const entries = entriesByDay.get(dateKey) ?? [];
          const dinner = entries.find((entry) => entry.mealType === MealType.DINNER);
          const extras = entries.filter((entry) => entry.mealType !== MealType.DINNER);
          const dinnerRecipe = dinner ? getPlannedRecipe(dinner) : null;
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
                    <Link href={`/recipes/${dinner.recipe.id}`}>{dinnerRecipe.title}</Link>
                    <form action={removeEntry}>
                      <input name="entryId" type="hidden" value={dinner.id} />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <button aria-label={`Remove ${dinnerRecipe.title} from ${dateKey}`} type="submit"><Trash2 size={15} /></button>
                    </form>
                  </div>
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
                    const plannedRecipe = getPlannedRecipe(entry);
                    return <div key={entry.id}>
                      <span>{formatMealType(entry.mealType)}</span>
                      <Link href={`/recipes/${entry.recipe.id}`}>{plannedRecipe.title}</Link>
                      <form action={removeEntry}>
                        <input name="entryId" type="hidden" value={entry.id} />
                        <input name="returnTo" type="hidden" value={returnTo} />
                        <button aria-label={`Remove ${plannedRecipe.title}`} type="submit"><Trash2 size={14} /></button>
                      </form>
                    </div>;
                  })}
                </div>
              ) : null}
              <details className="add-meal-menu">
                <summary><Plus size={15} /> Add another meal</summary>
                <div>
                  {OPTIONAL_MEAL_TYPES.filter((type) => !entries.some((entry) => entry.mealType === type)).map((type) => (
                    <Link href={`/planner?${queryString({ week: weekKey, day: dateKey, meal: type, view })}`} key={type}>{formatMealType(type)}</Link>
                  ))}
                </div>
              </details>
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
          <form className="recipe-search" method="get">
            <input name="week" type="hidden" value={weekKey} />
            <input name="day" type="hidden" value={selectedDayKey} />
            <input name="meal" type="hidden" value={selectedMealType} />
            <input name="view" type="hidden" value={view} />
            <Search aria-hidden="true" size={17} />
            <input defaultValue={query} name="q" placeholder="Search recipes" />
          </form>
        </div>
        <nav className="recipe-tabs" aria-label="Recipe source">
          {RECIPE_VIEWS.map((item) => (
            <Link className={item === view ? "is-active" : undefined} href={`/planner?${queryString({ week: weekKey, day: selectedDayKey, meal: selectedMealType, view: item, q: query || undefined })}`} key={item}>
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
      </section>
    </AppPageShell>
  );
}
