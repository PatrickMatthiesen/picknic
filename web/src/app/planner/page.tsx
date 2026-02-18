import { MealType } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAppAuthContext, resolveActiveHouseholdId } from "@/lib/auth-context";
import { formatDateInputValue, getWeekStartUtc, toUtcDate } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";

const MEAL_TYPES = Object.values(MealType);

export default async function PlannerPage() {
  const { userId, organizationId } = await requireAppAuthContext();
  const householdId = await resolveActiveHouseholdId(userId, organizationId);

  if (!householdId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Meal planner</h1>
        <p className="text-zinc-600">
          Your account is authenticated, but no household was found yet. Complete organization setup in WorkOS and sign
          in again.
        </p>
        <Link className="text-sm font-medium underline" href="/">
          Back home
        </Link>
      </main>
    );
  }

  async function addEntry(formData: FormData) {
    "use server";

    const recipeId = formData.get("recipeId");
    const dateValue = formData.get("date");
    const mealTypeValue = formData.get("mealType");
    const servingsOverrideValue = formData.get("servingsOverride");

    if (typeof recipeId !== "string" || recipeId.length === 0) {
      throw new Error("Recipe is required.");
    }
    if (typeof dateValue !== "string" || dateValue.length === 0) {
      throw new Error("Date is required.");
    }
    if (typeof mealTypeValue !== "string" || !MEAL_TYPES.includes(mealTypeValue as MealType)) {
      throw new Error("Valid meal type is required.");
    }

    const context = await requireAppAuthContext();
    const activeHouseholdId = await resolveActiveHouseholdId(context.userId, context.organizationId);

    if (!activeHouseholdId) {
      throw new Error("No household found for this user.");
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, householdId: activeHouseholdId },
      select: { id: true },
    });
    if (!recipe) {
      throw new Error("Recipe does not belong to this household.");
    }

    const date = toUtcDate(new Date(dateValue));
    if (Number.isNaN(date.valueOf())) {
      throw new Error("Date is invalid.");
    }

    const weekStart = getWeekStartUtc(date);
    const mealPlan = await prisma.mealPlan.upsert({
      where: {
        householdId_weekStart: {
          householdId: activeHouseholdId,
          weekStart,
        },
      },
      create: {
        householdId: activeHouseholdId,
        createdById: context.userId,
        weekStart,
      },
      update: {},
      select: { id: true },
    });

    const parsedServingsOverride =
      typeof servingsOverrideValue === "string" && servingsOverrideValue.trim().length > 0
        ? Number(servingsOverrideValue)
        : null;

    await prisma.mealPlanEntry.upsert({
      where: {
        mealPlanId_date_mealType: {
          mealPlanId: mealPlan.id,
          date,
          mealType: mealTypeValue as MealType,
        },
      },
      create: {
        mealPlanId: mealPlan.id,
        date,
        mealType: mealTypeValue as MealType,
        recipeId,
        servingsOverride:
          parsedServingsOverride !== null && Number.isFinite(parsedServingsOverride) && parsedServingsOverride > 0
            ? Math.floor(parsedServingsOverride)
            : null,
      },
      update: {
        recipeId,
        servingsOverride:
          parsedServingsOverride !== null && Number.isFinite(parsedServingsOverride) && parsedServingsOverride > 0
            ? Math.floor(parsedServingsOverride)
            : null,
      },
    });

    revalidatePath("/planner");
  }

  async function removeEntry(formData: FormData) {
    "use server";

    const entryId = formData.get("entryId");
    if (typeof entryId !== "string" || entryId.length === 0) {
      throw new Error("Entry id is required.");
    }

    const context = await requireAppAuthContext();
    const activeHouseholdId = await resolveActiveHouseholdId(context.userId, context.organizationId);
    if (!activeHouseholdId) {
      throw new Error("No household found for this user.");
    }

    await prisma.mealPlanEntry.deleteMany({
      where: {
        id: entryId,
        mealPlan: { householdId: activeHouseholdId },
      },
    });

    revalidatePath("/planner");
  }

  const weekStart = getWeekStartUtc(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  const [recipes, mealPlan] = await Promise.all([
    prisma.recipe.findMany({
      where: { householdId },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.mealPlan.findUnique({
      where: {
        householdId_weekStart: {
          householdId,
          weekStart,
        },
      },
      include: {
        entries: {
          orderBy: [{ date: "asc" }, { mealType: "asc" }],
          include: {
            recipe: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Meal planner</h1>
        <p className="text-zinc-600">
          Week of {weekStart.toISOString().slice(0, 10)} to {weekEnd.toISOString().slice(0, 10)}.
        </p>
        <div className="flex gap-4 text-sm">
          <Link className="underline" href="/recipes">
            Recipes
          </Link>
          <Link className="underline" href="/shopping-list">
            Shopping list
          </Link>
          <Link className="underline" href="/pantry">
            Pantry
          </Link>
          <Link className="underline" href="/">
            Home
          </Link>
        </div>
      </header>

      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">Add or update meal slot</h2>
        {recipes.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Create recipes first to start planning meals.</p>
        ) : (
          <form action={addEntry} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>Date</span>
              <input
                className="rounded-md border border-zinc-300 px-3 py-2"
                defaultValue={formatDateInputValue(new Date())}
                name="date"
                type="date"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Meal type</span>
              <select className="rounded-md border border-zinc-300 px-3 py-2" name="mealType">
                {MEAL_TYPES.map((mealType) => (
                  <option key={mealType} value={mealType}>
                    {mealType}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Recipe</span>
              <select className="rounded-md border border-zinc-300 px-3 py-2" name="recipeId">
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Servings override (optional)</span>
              <input
                className="rounded-md border border-zinc-300 px-3 py-2"
                min={1}
                name="servingsOverride"
                type="number"
              />
            </label>

            <button className="w-fit rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
              Save meal slot
            </button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Current week plan</h2>
        {!mealPlan || mealPlan.entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-zinc-600">No meals planned yet.</p>
        ) : (
          mealPlan.entries.map((entry) => (
            <article className="rounded-xl border border-zinc-200 p-5" key={entry.id}>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {entry.date.toISOString().slice(0, 10)} • {entry.mealType}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{entry.recipe.title}</h3>
              {entry.servingsOverride ? <p className="text-sm text-zinc-600">Servings override: {entry.servingsOverride}</p> : null}
              <form action={removeEntry} className="mt-3">
                <input name="entryId" type="hidden" value={entry.id} />
                <button className="text-sm font-medium underline" type="submit">
                  Remove
                </button>
              </form>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
