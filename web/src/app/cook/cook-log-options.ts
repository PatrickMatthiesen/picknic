"use server";

import { MealEntryKind } from "@prisma/client";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { addUtcDays, getDateKey, getWeekStartUtc, parseTodayDateKey } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { formatMealType } from "@/lib/recipe-display";
import { readRecipeSnapshot } from "@/lib/recipe-revisions";

type CookLogOption = {
  plannedEntryId: string;
  plannedDateKey: string;
  todayEntryId: string;
  label: string;
};

export async function getCookLogOptions(input: { recipeId: string; dateKey: string }): Promise<{
  logged: boolean;
  options: CookLogOption[];
}> {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) throw new Error("No household is connected to this account.");

  if (typeof input?.recipeId !== "string" || !input.recipeId.trim() || typeof input.dateKey !== "string") {
    throw new Error("Choose a recipe and a valid cooking date.");
  }
  const { recipeId, dateKey } = input;
  const date = parseTodayDateKey(dateKey);
  if (!date) throw new Error("Choose a valid date for today.");

  const { householdId } = membership;
  const log = await prisma.cookLog.findUnique({
    where: { householdId_date_recipeId: { householdId, date, recipeId } },
    select: { swappedAt: true },
  });
  if (!log || log.swappedAt) return { logged: Boolean(log), options: [] };

  const weekStart = getWeekStartUtc(date);
  const plan = await prisma.mealPlan.findUnique({
    where: { householdId_weekStart: { householdId, weekStart } },
    select: {
      entries: {
        where: { date: { gte: weekStart, lt: addUtcDays(weekStart, 7) } },
        orderBy: [{ date: "asc" }, { mealType: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          date: true,
          mealType: true,
          kind: true,
          recipeId: true,
          note: true,
          recipe: { select: { title: true } },
          recipeRevision: { select: { snapshot: true } },
        },
      },
    },
  });

  const entries = plan?.entries ?? [];
  const todayEntries = entries.filter((entry) => getDateKey(entry.date) === dateKey);
  const options = entries.flatMap((entry): CookLogOption[] => {
    const plannedDateKey = getDateKey(entry.date);
    if (entry.kind !== MealEntryKind.RECIPE || entry.recipeId !== recipeId || plannedDateKey === dateKey) return [];

    const sameMeal = todayEntries.filter((today) => today.mealType === entry.mealType);
    if (sameMeal.some((today) => today.kind === MealEntryKind.RECIPE && today.recipeId === recipeId)) return [];

    const weekday = entry.date.toLocaleDateString("en", { weekday: "long", timeZone: "UTC" });
    const meal = formatMealType(entry.mealType).toLowerCase();
    const source = { plannedEntryId: entry.id, plannedDateKey };
    if (sameMeal.length === 0) {
      return [{ ...source, todayEntryId: "", label: `Move ${weekday}'s ${meal} to today` }];
    }
    return sameMeal.map((today) => {
      const dish = today.recipeRevision ? readRecipeSnapshot(today.recipeRevision.snapshot).title : today.recipe?.title;
      const target = dish || today.note || formatMealType(today.kind.replaceAll("_", " "));
      return { ...source, todayEntryId: today.id, label: `Swap ${weekday}'s ${meal} with ${target} today` };
    });
  });

  return { logged: true, options };
}
