import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, CalendarDays, ChefHat } from "lucide-react";
import { RecipeImage } from "@/app/_components/recipe-image";
import { CookSessionClient } from "@/app/cook/cook-session-client";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { getDateKey, parseDateKey } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { readRecipeSnapshot } from "@/lib/recipe-revisions";

type PageProps = { searchParams: Promise<{ date?: string; entry?: string }> };

function getCookRecipe(entry: {
  recipe: {
    id: string;
    imageUrl: string | null;
    ingredients: Array<{ id: string; name: string; notes: string | null; quantity: Prisma.Decimal | null; unit: string | null; unitId: string | null; component: string | null }>;
    servings: number;
    steps: Array<{ id: string; position: number; instruction: string; component: string | null; durationMinutes: number | null; advanceNotice: boolean }>;
    title: string;
  };
  recipeRevision: { snapshot: Prisma.JsonValue } | null;
}) {
  if (!entry.recipeRevision) return entry.recipe;
  const snapshot = readRecipeSnapshot(entry.recipeRevision.snapshot);
  return { ...snapshot, id: entry.recipe.id };
}

export default async function CookPage({ searchParams }: PageProps) {
  const search = await searchParams;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) return <main className="cook-empty">No household is connected to this account.</main>;

  const date = parseDateKey(search.date) ?? new Date();
  const dateKey = getDateKey(date);
  const plannedEntries = await prisma.mealPlanEntry.findMany({
    where: { date: { gte: new Date(`${dateKey}T00:00:00.000Z`), lt: new Date(`${dateKey}T23:59:59.999Z`) }, mealPlan: { householdId: membership.householdId } },
    include: {
      recipeRevision: true,
      recipe: { include: { ingredients: { orderBy: { position: "asc" } }, steps: { orderBy: { position: "asc" } } } },
    },
    orderBy: { mealType: "asc" },
  });
  const entries = plannedEntries.filter((entry) => entry.recipeRevision || entry.recipe.householdId === membership.householdId);

  const selected = entries.length === 1 ? entries[0] : entries.find((entry) => entry.id === search.entry);
  if (selected) {
    const recipe = getCookRecipe(selected);
    return (
      <CookSessionClient
        dateKey={dateKey}
        entryId={selected.id}
        imageUrl={recipe.imageUrl}
        mealType={selected.mealType}
        recipe={{
          id: recipe.id,
          title: recipe.title,
          servings: recipe.servings,
          ingredients: recipe.ingredients.map((ingredient) => ({ id: ingredient.id, name: ingredient.name, notes: ingredient.notes, quantity: ingredient.quantity == null ? null : Number(ingredient.quantity), unit: ingredient.unit, unitId: ingredient.unitId, component: ingredient.component })),
          steps: recipe.steps.map((step) => ({ id: step.id, position: step.position, instruction: step.instruction, component: step.component, durationMinutes: step.durationMinutes, advanceNotice: step.advanceNotice })),
        }}
        recipeRevisionId={selected.recipeRevisionId ?? selected.recipe.id}
        servingsOverride={selected.servingsOverride}
      />
    );
  }

  if (entries.length > 1) {
    return (
      <main className="cook-picker">
        <div className="cook-picker-header"><Link href={`/planner?day=${dateKey}`}><ArrowLeft size={18} /> Back to this week</Link><div><ChefHat size={22} /><h1>What are you cooking?</h1><p>{date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</p></div></div>
        <section>{entries.map((entry) => {
          const recipe = getCookRecipe(entry);
          return <Link href={`/cook?date=${dateKey}&entry=${entry.id}`} key={entry.id}><RecipeImage alt="" height={220} recipe={recipe} width={330} /><span>{entry.mealType.toLowerCase()}</span><strong className="recipe-title">{recipe.title}</strong><small>Serves {entry.servingsOverride ?? recipe.servings}</small></Link>;
        })}</section>
      </main>
    );
  }

  return (
    <main className="cook-empty">
      <ChefHat aria-hidden="true" size={32} />
      <h1>Nothing planned for today</h1>
      <p>Choose a recipe for {date.toLocaleDateString("en", { weekday: "long" })}, or keep the day open.</p>
      <div><Link className="app-theme-primary-button" href={`/planner?day=${dateKey}`}><CalendarDays size={17} /> Plan a meal</Link><Link className="app-theme-secondary-button" href="/planner"><ArrowLeft size={17} /> Back to this week</Link></div>
    </main>
  );
}
