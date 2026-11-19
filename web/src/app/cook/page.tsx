import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, CalendarDays, ChefHat } from "lucide-react";
import { RecipeVisibility } from "@prisma/client";
import { RecipeImage } from "@/app/_components/recipe-image";
import { CookSessionClient } from "@/app/cook/cook-session-client";
import { cookPlannerHref } from "./cook-links";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { getDateKey, parseDateKey } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { readRecipeSnapshot, type RecipeSnapshotIngredient, type RecipeSnapshotStep } from "@/lib/recipe-revisions";

type PageProps = { searchParams: Promise<{ date?: string; entry?: string; recipe?: string }> };

type CookRecipeSource = {
  id: string;
  imageUrl: string | null;
  ingredients: Array<Omit<RecipeSnapshotIngredient, "quantity"> & { quantity: Prisma.Decimal | number | null }>;
  servings: number;
  steps: RecipeSnapshotStep[];
  title: string;
};

function getCookRecipe(entry: {
  recipe: CookRecipeSource;
  recipeRevision: { snapshot: Prisma.JsonValue } | null;
}) {
  if (!entry.recipeRevision) return entry.recipe;
  const snapshot = readRecipeSnapshot(entry.recipeRevision.snapshot);
  return { ...snapshot, id: entry.recipe.id };
}

function toCookRecipe(id: string, recipe: Omit<CookRecipeSource, "id">) {
  return {
    id,
    title: recipe.title,
    servings: recipe.servings,
    ingredients: recipe.ingredients.map(({ id, name, notes, quantity, unit, unitId, component, componentId, componentPosition }) => ({
      id, name, notes, quantity: quantity == null ? null : Number(quantity), unit, unitId, component, componentId, componentPosition,
    })),
    steps: recipe.steps.map(({ id, position, instruction, component, componentId, componentPosition, durationMinutes, advanceNotice }) => ({
      id, position, instruction, component, componentId, componentPosition, durationMinutes, advanceNotice,
    })),
  };
}

export default async function CookPage({ searchParams }: PageProps) {
  const search = await searchParams;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) return <section className="cook-empty">No household is connected to this account.</section>;

  const date = parseDateKey(search.date) ?? new Date();
  const dateKey = getDateKey(date);
  const plannerHref = cookPlannerHref(dateKey);
  if (search.recipe) {
    const recipe = await prisma.recipe.findFirst({
      where: { id: search.recipe, OR: [
        { householdId: membership.householdId, deletedAt: null },
        { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
        { saves: { some: { userId } } },
        { plannedIn: { some: { mealPlan: { householdId: membership.householdId } } } },
      ] },
      include: { ingredients: { orderBy: { position: "asc" } }, steps: { orderBy: { position: "asc" } }, saves: { where: { userId }, select: { lastSeenRevisionId: true } }, plannedIn: { where: { mealPlan: { householdId: membership.householdId }, recipeRevisionId: { not: null } }, orderBy: { updatedAt: "desc" }, take: 1, select: { recipeRevisionId: true } } },
    });
    if (recipe) {
      const revisionId = recipe.householdId === membership.householdId && !recipe.deletedAt ? null : recipe.saves[0]?.lastSeenRevisionId ?? recipe.plannedIn[0]?.recipeRevisionId ?? recipe.latestRevisionId;
      const revision = revisionId ? await prisma.recipeRevision.findFirst({ where: { id: revisionId, recipeId: recipe.id } }) : null;
      if ((recipe.householdId === membership.householdId && !recipe.deletedAt) || revision) {
        const display = revision ? readRecipeSnapshot(revision.snapshot) : recipe;
        return <CookSessionClient key={`standalone:${recipe.id}:${revision?.id ?? "live"}`} dateKey={dateKey} entryId={`standalone:${recipe.id}:${revision?.id ?? "live"}`} imageUrl={display.imageUrl} mealType="COOK NOW" recipe={toCookRecipe(recipe.id, display)} recipeRevisionId={revision?.id ?? recipe.id} servingsOverride={null} />;
      }
    }
  }
  const plannedEntries = await prisma.mealPlanEntry.findMany({
    where: { date: { gte: new Date(`${dateKey}T00:00:00.000Z`), lt: new Date(`${dateKey}T23:59:59.999Z`) }, mealPlan: { householdId: membership.householdId } },
    include: {
      recipeRevision: true,
      recipe: { include: { ingredients: { orderBy: { position: "asc" } }, steps: { orderBy: { position: "asc" } } } },
    },
    orderBy: { mealType: "asc" },
  });
  const entries = plannedEntries.filter((entry): entry is typeof entry & { recipe: NonNullable<typeof entry.recipe> } => entry.recipeId !== null && entry.recipe !== null && (entry.recipeRevision !== null || entry.recipe.householdId === membership.householdId));

  const selected = entries.length === 1 ? entries[0] : entries.find((entry) => entry.id === search.entry);
  if (selected) {
    const recipe = getCookRecipe(selected);
    return (
      <CookSessionClient
        dateKey={dateKey}
        entryId={selected.id}
        imageUrl={recipe.imageUrl}
        key={`${selected.id}:${selected.recipeRevisionId ?? selected.recipe.id}`}
        mealType={selected.mealType}
        recipe={toCookRecipe(recipe.id, recipe)}
        recipeRevisionId={selected.recipeRevisionId ?? selected.recipe.id}
        servingsOverride={selected.servingsOverride}
      />
    );
  }

  if (entries.length > 1) {
    return (
      <section className="cook-picker">
        <div className="cook-picker-header"><Link href={plannerHref}><ArrowLeft size={18} /> Back to meal plan</Link><div><h1>What are you cooking?</h1><p>{date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</p></div></div>
        <section>{entries.map((entry) => {
          const recipe = getCookRecipe(entry);
          return <Link href={`/cook?date=${dateKey}&entry=${entry.id}`} key={entry.id}><RecipeImage alt="" height={220} recipe={{ id: recipe.id, imageUrl: recipe.imageUrl }} width={330} /><span>{entry.mealType.toLowerCase()}</span><strong className="recipe-title">{recipe.title}</strong><small>Serves {entry.servingsOverride ?? recipe.servings}</small></Link>;
        })}</section>
      </section>
    );
  }

  return (
    <section className="cook-empty">
      <ChefHat aria-hidden="true" size={32} />
      <h1>No meals to cook</h1>
      <p>Choose a recipe for {date.toLocaleDateString("en", { weekday: "long", timeZone: "UTC" })}, or keep the day open.</p>
      <div><Link className="app-theme-primary-button" href={`${plannerHref}&meal=DINNER&pick=1`}><CalendarDays size={17} /> Plan a meal</Link><Link className="app-theme-secondary-button" href={plannerHref}><ArrowLeft size={17} /> Back to meal plan</Link></div>
    </section>
  );
}
