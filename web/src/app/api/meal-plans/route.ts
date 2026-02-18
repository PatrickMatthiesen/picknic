import { MealType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { getWeekStartUtc, toUtcDate } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";

type MealPlanEntryPayload = {
  date?: unknown;
  mealType?: unknown;
  recipeId?: unknown;
  servingsOverride?: unknown;
};

type MealPlanPayload = {
  weekStart?: unknown;
  entries?: unknown;
};

function parseMealType(value: unknown): MealType | null {
  if (typeof value !== "string") {
    return null;
  }

  return (Object.values(MealType) as string[]).includes(value) ? (value as MealType) : null;
}

function parseEntries(input: unknown): Array<{
  date: Date;
  mealType: MealType;
  recipeId: string;
  servingsOverride: number | null;
}> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is MealPlanEntryPayload => typeof value === "object" && value !== null)
    .map((entry) => {
      const mealType = parseMealType(entry.mealType);
      const date = typeof entry.date === "string" ? toUtcDate(new Date(entry.date)) : null;
      const servingsOverride =
        typeof entry.servingsOverride === "number" && entry.servingsOverride > 0
          ? Math.floor(entry.servingsOverride)
          : null;

      return {
        date,
        mealType,
        recipeId: typeof entry.recipeId === "string" ? entry.recipeId : "",
        servingsOverride,
      };
    })
    .filter(
      (entry): entry is { date: Date; mealType: MealType; recipeId: string; servingsOverride: number | null } =>
        entry.date instanceof Date && !Number.isNaN(entry.date.valueOf()) && !!entry.mealType && entry.recipeId.length > 0,
    );
}

export async function GET(request: Request) {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  const weekStart = weekStartParam ? getWeekStartUtc(new Date(weekStartParam)) : getWeekStartUtc(new Date());

  const mealPlan = await prisma.mealPlan.findUnique({
    where: {
      householdId_weekStart: {
        householdId: membership.householdId,
        weekStart,
      },
    },
    include: {
      entries: {
        orderBy: [{ date: "asc" }, { mealType: "asc" }],
        include: {
          recipe: {
            select: { id: true, title: true, servings: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ data: mealPlan });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as MealPlanPayload;
  const entries = parseEntries(payload.entries);

  if (entries.length === 0) {
    return NextResponse.json({ error: "At least one valid meal plan entry is required." }, { status: 400 });
  }

  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const weekStartSource = typeof payload.weekStart === "string" ? new Date(payload.weekStart) : entries[0].date;
  const weekStart = getWeekStartUtc(weekStartSource);

  const recipeIds = Array.from(new Set(entries.map((entry) => entry.recipeId)));
  const recipes = await prisma.recipe.findMany({
    where: { id: { in: recipeIds }, householdId: membership.householdId },
    select: { id: true },
  });
  const validRecipeIds = new Set(recipes.map((recipe) => recipe.id));

  if (validRecipeIds.size !== recipeIds.length) {
    return NextResponse.json({ error: "One or more recipes do not belong to the active household." }, { status: 400 });
  }

  const mealPlan = await prisma.mealPlan.upsert({
    where: {
      householdId_weekStart: {
        householdId: membership.householdId,
        weekStart,
      },
    },
    create: {
      householdId: membership.householdId,
      createdById: userId,
      weekStart,
    },
    update: {},
    select: { id: true },
  });

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.mealPlanEntry.upsert({
        where: {
          mealPlanId_date_mealType: {
            mealPlanId: mealPlan.id,
            date: entry.date,
            mealType: entry.mealType,
          },
        },
        create: {
          mealPlanId: mealPlan.id,
          date: entry.date,
          mealType: entry.mealType,
          recipeId: entry.recipeId,
          servingsOverride: entry.servingsOverride,
        },
        update: {
          recipeId: entry.recipeId,
          servingsOverride: entry.servingsOverride,
        },
      }),
    ),
  );

  const updatedMealPlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlan.id },
    include: {
      entries: {
        orderBy: [{ date: "asc" }, { mealType: "asc" }],
        include: {
          recipe: { select: { id: true, title: true, servings: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: updatedMealPlan }, { status: 201 });
}
