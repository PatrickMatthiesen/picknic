import { MealType, RecipeVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { getWeekStartUtc, parsePlannedServings, toUtcDate } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { getPlanningRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";

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
        parsePlannedServings(entry.servingsOverride);

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
          recipeRevision: { select: { snapshot: true } },
        },
      },
    },
  });

  const data = mealPlan
    ? {
        ...mealPlan,
        entries: mealPlan.entries.map(({ recipeRevision, ...entry }) => {
          const snapshot = recipeRevision ? readRecipeSnapshot(recipeRevision.snapshot) : null;
          return {
            ...entry,
            recipe: snapshot
              ? { id: entry.recipe.id, title: snapshot.title, servings: snapshot.servings }
              : entry.recipe,
          };
        }),
      }
    : null;
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as MealPlanPayload;
  if (Array.isArray(payload.entries) && payload.entries.some((entry) =>
    entry && typeof entry === "object" && entry.servingsOverride != null
    && parsePlannedServings(entry.servingsOverride) === null,
  )) {
    return NextResponse.json({ error: "Servings must be a whole number between 1 and 100." }, { status: 400 });
  }
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
    where: {
      id: { in: recipeIds },
      OR: [
        { householdId: membership.householdId, deletedAt: null },
        { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
        { saves: { some: { userId } }, latestRevisionId: { not: null } },
      ],
    },
    select: { id: true, householdId: true, createdById: true, latestRevisionId: true },
  });
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  if (recipesById.size !== recipeIds.length) {
    return NextResponse.json({ error: "One or more recipes are not available to the active household." }, { status: 400 });
  }

  const revisions = new Map<string, string>();
  for (const recipe of recipes) {
    const revision = await getPlanningRevision(prisma, recipe, membership.householdId);
    if (!revision) {
      return NextResponse.json({ error: "A shared recipe has no available published revision." }, { status: 400 });
    }
    revisions.set(recipe.id, revision.id);
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
          recipeRevisionId: revisions.get(entry.recipeId),
          servingsOverride: entry.servingsOverride,
        },
        update: {
          recipeId: entry.recipeId,
          recipeRevisionId: revisions.get(entry.recipeId),
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
          recipeRevision: { select: { snapshot: true } },
        },
      },
    },
  });

  const data = updatedMealPlan
    ? {
        ...updatedMealPlan,
        entries: updatedMealPlan.entries.map(({ recipeRevision, ...entry }) => {
          const snapshot = recipeRevision ? readRecipeSnapshot(recipeRevision.snapshot) : null;
          return {
            ...entry,
            recipe: snapshot
              ? { id: entry.recipe.id, title: snapshot.title, servings: snapshot.servings }
              : entry.recipe,
          };
        }),
      }
    : null;
  return NextResponse.json({ data }, { status: 201 });
}
