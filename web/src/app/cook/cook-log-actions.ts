"use server";

import { MealEntryKind, Prisma, RecipeVisibility } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { addUtcDays, getDateKey, getWeekStartUtc, parseTodayDateKey } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { ensureRecipeRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";

type CookLogInput = {
  recipeId: string;
  recipeRevisionId: string;
  dateKey: string;
};

type SwapCookedMealInput = CookLogInput & {
  plannedEntryId: string;
  todayEntryId: string;
  plannedDateKey: string;
};

async function requireCookContext(input: CookLogInput) {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) throw new Error("No household is connected to this account.");
  if (typeof input?.recipeId !== "string" || !input.recipeId ||
      typeof input.recipeRevisionId !== "string" || !input.recipeRevisionId) {
    throw new Error("Choose a valid recipe to log.");
  }
  const date = typeof input.dateKey === "string" ? parseTodayDateKey(input.dateKey) : null;
  if (!date) throw new Error("Choose today's date to log a meal.");
  return { userId, householdId: membership.householdId, date };
}

async function runCookTransaction(operation: (tx: Prisma.TransactionClient) => Promise<void>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // Concurrent logs can also contend for the same newly created revision version.
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002");
      if (!retryable || attempt >= 2) throw error;
    }
  }
}

export async function logCookedToday(input: CookLogInput): Promise<void> {
  const { userId, householdId, date } = await requireCookContext(input);
  const { recipeId, recipeRevisionId } = input;
  const key = { householdId, date, recipeId };
  await runCookTransaction(async (tx) => {
    const plannedIn = { mealPlan: { householdId }, kind: MealEntryKind.RECIPE };
    const recipe = await tx.recipe.findFirst({
      where: {
        id: recipeId,
        OR: [
          { householdId, deletedAt: null },
          { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
          { saves: { some: { userId } } },
          { plannedIn: { some: plannedIn } },
        ],
      },
      select: {
        householdId: true,
        createdById: true,
        deletedAt: true,
        visibility: true,
        latestRevisionId: true,
        saves: { where: { userId }, select: { lastSeenRevisionId: true } },
        plannedIn: {
          where: { ...plannedIn, recipeRevisionId: recipeRevisionId === recipeId ? null : recipeRevisionId },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!recipe) throw new Error("This recipe is not available to your household.");

    const planned = recipe.plannedIn.length > 0;
    const ownLiveRecipe = recipe.householdId === householdId && recipe.deletedAt === null;
    if (recipeRevisionId === recipeId) {
      if (!ownLiveRecipe && !(recipe.householdId === householdId && planned)) {
        throw new Error("This recipe needs an available revision.");
      }
    } else {
      const revision = await tx.recipeRevision.findFirst({ where: { id: recipeRevisionId, recipeId } });
      const save = recipe.saves[0];
      const publicRecipe = recipe.visibility === RecipeVisibility.PUBLIC && recipe.deletedAt === null;
      const sharedRevision = revision && readRecipeSnapshot(revision.snapshot).visibility === RecipeVisibility.PUBLIC &&
        ((recipe.latestRevisionId === revision.id && (publicRecipe || save)) || save?.lastSeenRevisionId === revision.id);
      if (!revision || !(ownLiveRecipe || planned || sharedRevision)) {
        throw new Error("This recipe revision is not available to your household.");
      }
    }

    const where = { householdId_date_recipeId: key };
    if (await tx.cookLog.findUnique({ where, select: { recipeId: true } })) return;

    const pinnedRevisionId = recipeRevisionId === recipeId
      ? (await ensureRecipeRevision(tx, recipeId, recipe.createdById)).id
      : recipeRevisionId;
    await tx.cookLog.create({ data: { ...key, recipeRevisionId: pinnedRevisionId } });
  });

  revalidatePath("/planner");
}

export async function swapCookedMeal(input: SwapCookedMealInput): Promise<void> {
  const { householdId, date } = await requireCookContext(input);
  const { plannedEntryId, todayEntryId, recipeId, recipeRevisionId, plannedDateKey } = input;
  if (typeof plannedEntryId !== "string" || !plannedEntryId || typeof todayEntryId !== "string" ||
      typeof plannedDateKey !== "string" || !plannedDateKey) {
    throw new Error("Choose a valid meal to move.");
  }

  const weekStart = getWeekStartUtc(date);
  const tomorrow = addUtcDays(date, 1);
  await runCookTransaction(async (tx) => {
    const logWhere = { householdId_date_recipeId: { householdId, date, recipeId } };
    const log = await tx.cookLog.findUnique({ where: logWhere, select: { swappedAt: true } });
    if (!log) throw new Error("Log the cooked meal before moving it in the plan.");
    if (log.swappedAt) throw new Error("This cooked meal has already moved in the plan.");
    if (recipeRevisionId !== recipeId && !await tx.recipeRevision.findFirst({
      where: { id: recipeRevisionId, recipeId },
      select: { id: true },
    })) {
      throw new Error("This recipe revision is not available to your household.");
    }

    const planned = await tx.mealPlanEntry.findFirst({
      where: {
        id: plannedEntryId,
        recipeId,
        kind: MealEntryKind.RECIPE,
        mealPlan: { householdId, weekStart },
        date: { gte: weekStart, lt: addUtcDays(weekStart, 7) },
        OR: [{ date: { lt: date } }, { date: { gte: tomorrow } }],
      },
      select: { id: true, mealPlanId: true, mealType: true, date: true },
    });
    if (!planned || getDateKey(planned.date) !== plannedDateKey) {
      throw new Error("The planned meal changed. Refresh the plan and choose it again.");
    }

    const todayEntries = await tx.mealPlanEntry.findMany({
      where: {
        ...(todayEntryId ? { OR: [{ id: todayEntryId }, { recipeId, kind: MealEntryKind.RECIPE }] } : {}),
        mealPlanId: planned.mealPlanId,
        mealType: planned.mealType,
        date: { gte: date, lt: tomorrow },
      },
      select: { id: true, date: true, recipeId: true, kind: true },
      take: 2,
    });
    if (todayEntries.some((entry) => entry.kind === MealEntryKind.RECIPE && entry.recipeId === recipeId)) {
      throw new Error("This recipe is already planned in today's meal slot.");
    }
    const today = todayEntries.find((entry) => entry.id === todayEntryId);
    if (todayEntryId ? !today : todayEntries.length > 0) {
      throw new Error("Today's meal plan changed. Refresh the plan and choose a meal again.");
    }

    await tx.mealPlanEntry.update({ where: { id: planned.id }, data: { date: today?.date ?? date } });
    if (today) await tx.mealPlanEntry.update({ where: { id: today.id }, data: { date: planned.date } });
    await tx.cookLog.update({ where: logWhere, data: { swappedAt: new Date() } });
  });

  revalidatePath("/planner");
  revalidatePath("/shopping-list");
}
