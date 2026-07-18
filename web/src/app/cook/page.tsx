import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ChefHat } from "lucide-react";
import { CookSessionClient } from "@/app/cook/cook-session-client";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { getDateKey, parseDateKey } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { getRecipeImageUrl } from "@/lib/recipe-display";

type PageProps = { searchParams: Promise<{ date?: string; entry?: string }> };

export default async function CookPage({ searchParams }: PageProps) {
  const search = await searchParams;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) return <main className="cook-empty">No household is connected to this account.</main>;

  const date = parseDateKey(search.date) ?? new Date();
  const dateKey = getDateKey(date);
  const entries = await prisma.mealPlanEntry.findMany({
    where: { date: { gte: new Date(`${dateKey}T00:00:00.000Z`), lt: new Date(`${dateKey}T23:59:59.999Z`) }, mealPlan: { householdId: membership.householdId } },
    include: { recipe: { include: { ingredients: { orderBy: { position: "asc" } }, steps: { orderBy: { position: "asc" } } } } },
    orderBy: { mealType: "asc" },
  });

  const selected = entries.length === 1 ? entries[0] : entries.find((entry) => entry.id === search.entry);
  if (selected) {
    return (
      <CookSessionClient
        dateKey={dateKey}
        entryId={selected.id}
        imageUrl={getRecipeImageUrl(selected.recipe)}
        mealType={selected.mealType}
        recipe={{
          id: selected.recipe.id,
          title: selected.recipe.title,
          servings: selected.recipe.servings,
          ingredients: selected.recipe.ingredients.map((ingredient) => ({ id: ingredient.id, name: ingredient.name, quantity: ingredient.quantity == null ? null : Number(ingredient.quantity), unit: ingredient.unit, component: ingredient.component })),
          steps: selected.recipe.steps.map((step) => ({ id: step.id, position: step.position, instruction: step.instruction })),
        }}
        servingsOverride={selected.servingsOverride}
      />
    );
  }

  if (entries.length > 1) {
    return (
      <main className="cook-picker">
        <div className="cook-picker-header"><Link href={`/planner?day=${dateKey}`}><ArrowLeft size={18} /> Back to this week</Link><div><ChefHat size={22} /><h1>What are you cooking?</h1><p>{date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</p></div></div>
        <section>{entries.map((entry) => <Link href={`/cook?date=${dateKey}&entry=${entry.id}`} key={entry.id}><Image alt="" height={220} src={getRecipeImageUrl(entry.recipe)} width={330} /><span>{entry.mealType.toLowerCase()}</span><strong className="recipe-title">{entry.recipe.title}</strong><small>Serves {entry.servingsOverride ?? entry.recipe.servings}</small></Link>)}</section>
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
