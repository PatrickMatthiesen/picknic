import { MembershipRole, RecipeVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { getSupportedRecipeImageUrl } from "@/lib/recipe-display";
import { normalizeIngredients, normalizeOptionalMinutes, normalizeSteps, normalizeTags, RecipeInputError } from "@/lib/recipe-input";
import { createRecipeRevision, ensureRecipeRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";

type RouteContext = { params: Promise<{ recipeId: string }> };

type RecipeUpdatePayload = {
  title?: unknown;
  description?: unknown;
  servings?: unknown;
  totalTimeMinutes?: unknown;
  tags?: unknown;
  ingredients?: unknown;
  steps?: unknown;
  imageUrl?: unknown;
  visibility?: unknown;
};

export async function GET(_request: Request, context: RouteContext) {
  const { recipeId } = await context.params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      OR: [
        { householdId: membership.householdId, deletedAt: null },
        { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
        { saves: { some: { userId } } },
        { plannedIn: { some: { mealPlan: { householdId: membership.householdId } } } },
      ],
    },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
      saves: { where: { userId }, select: { userId: true } },
      plannedIn: {
        where: { mealPlan: { householdId: membership.householdId } },
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: { recipeRevision: true },
      },
    },
  });

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  const canReadLive = recipe.householdId === membership.householdId
    || (recipe.visibility === RecipeVisibility.PUBLIC && recipe.deletedAt === null);
  const retainedRevision = !canReadLive
    ? recipe.saves.length && recipe.latestRevisionId
      ? await prisma.recipeRevision.findUnique({ where: { id: recipe.latestRevisionId } })
      : recipe.plannedIn[0]?.recipeRevision ?? null
    : null;
  if (!canReadLive && !retainedRevision) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }
  const snapshot = retainedRevision ? readRecipeSnapshot(retainedRevision.snapshot) : null;
  const liveRecipe = Object.fromEntries(Object.entries(recipe).filter(([key]) => key !== "plannedIn" && key !== "saves"));
  const data = snapshot
    ? { ...liveRecipe, ...snapshot, id: recipe.id, deletedAt: recipe.deletedAt }
    : liveRecipe;

  return NextResponse.json({ data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { recipeId } = await context.params;
  const payload = (await request.json()) as RecipeUpdatePayload;
  const imageUrlInput = typeof payload.imageUrl === "string" ? payload.imageUrl.trim() : null;
  const imageUrl = imageUrlInput === null || imageUrlInput === "" ? null : getSupportedRecipeImageUrl(imageUrlInput);
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const existingRecipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId: membership.householdId, deletedAt: null },
    select: { id: true, visibility: true, publishedAt: true, deletedAt: true },
  });

  if (!existingRecipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }
  if (imageUrlInput && !imageUrl) {
    return NextResponse.json({ error: "imageUrl must be a local path or an HTTP(S) URL." }, { status: 400 });
  }
  if (existingRecipe.deletedAt) return NextResponse.json({ error: "Deleted recipes cannot be edited." }, { status: 409 });

  let ingredients;
  let steps;
  let totalTimeMinutes: number | null | undefined;
  try {
    ingredients = Array.isArray(payload.ingredients) ? normalizeIngredients(payload.ingredients) : undefined;
    steps = Array.isArray(payload.steps) ? normalizeSteps(payload.steps) : undefined;
    totalTimeMinutes = payload.totalTimeMinutes === undefined
      ? undefined
      : normalizeOptionalMinutes(payload.totalTimeMinutes);
  } catch (error) {
    if (error instanceof RecipeInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({
      where: { id: recipeId },
      data: {
        title: typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : undefined,
        description: typeof payload.description === "string" ? payload.description.trim() : undefined,
        servings: typeof payload.servings === "number" && payload.servings > 0 ? Math.floor(payload.servings) : undefined,
        totalTimeMinutes,
        tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : undefined,
        imageUrl: imageUrlInput === null ? undefined : imageUrl,
        visibility:
          payload.visibility === RecipeVisibility.PUBLIC || payload.visibility === RecipeVisibility.PRIVATE
            ? payload.visibility
            : undefined,
        publishedAt: payload.visibility === RecipeVisibility.PUBLIC && existingRecipe.visibility !== RecipeVisibility.PUBLIC
          ? existingRecipe.publishedAt ?? new Date()
          : undefined,
      },
    });

    if (Array.isArray(payload.ingredients)) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId } });
      if (ingredients && ingredients.length > 0) {
        await tx.recipeIngredient.createMany({
          data: ingredients.map((ingredient) => ({ ...ingredient, recipeId })),
        });
      }
    }

    if (Array.isArray(payload.steps)) {
      await tx.recipeStep.deleteMany({ where: { recipeId } });
      if (steps && steps.length > 0) {
        await tx.recipeStep.createMany({
          data: steps.map((step) => ({ ...step, recipeId })),
        });
      }
    }

    const updated = await tx.recipe.findUniqueOrThrow({ where: { id: recipeId }, select: { visibility: true } });
    if (updated.visibility === RecipeVisibility.PUBLIC) await createRecipeRevision(tx, recipeId, userId);
  });

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
    },
  });

  return NextResponse.json({ data: recipe });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { recipeId } = await context.params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }
  if (membership.role !== MembershipRole.OWNER) {
    return NextResponse.json({ error: "Only household owners can delete recipes." }, { status: 403 });
  }

  const existingRecipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId: membership.householdId, deletedAt: null },
    select: { id: true },
  });

  if (!existingRecipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await ensureRecipeRevision(tx, recipeId, userId);
    await tx.recipe.update({
      where: { id: recipeId },
      data: { deletedAt: new Date(), visibility: RecipeVisibility.PRIVATE },
    });
  });

  return new NextResponse(null, { status: 204 });
}
