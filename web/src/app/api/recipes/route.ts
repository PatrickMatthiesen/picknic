import { RecipeVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { getSupportedRecipeImageUrl } from "@/lib/recipe-display";
import { normalizeIngredients, normalizeOptionalMinutes, normalizeSteps, normalizeTags, RecipeInputError } from "@/lib/recipe-input";
import { createRecipeRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";

type RecipePayload = {
  title?: unknown;
  description?: unknown;
  notes?: unknown;
  servings?: unknown;
  totalTimeMinutes?: unknown;
  tags?: unknown;
  ingredients?: unknown;
  steps?: unknown;
  imageUrl?: unknown;
  visibility?: unknown;
};

export async function GET(request: Request) {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "mine";
  const query = url.searchParams.get("q")?.trim() ?? "";
  const recipes = await prisma.recipe.findMany({
    where: {
      ...(query && view !== "saved" ? { title: { contains: query, mode: "insensitive" } } : {}),
      ...(view === "discover"
        ? { deletedAt: null, visibility: RecipeVisibility.PUBLIC, NOT: { householdId: membership.householdId } }
        : view === "saved"
          ? { saves: { some: { userId } } }
          : { deletedAt: null, householdId: membership.householdId }),
    },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const retainedRevisionIds = recipes
    .filter((recipe) => recipe.householdId !== membership.householdId && (recipe.visibility !== RecipeVisibility.PUBLIC || recipe.deletedAt))
    .map((recipe) => recipe.latestRevisionId)
    .filter((id): id is string => id !== null);
  const revisions = retainedRevisionIds.length
    ? await prisma.recipeRevision.findMany({ where: { id: { in: retainedRevisionIds } } })
    : [];
  const snapshots = new Map(revisions.map((revision) => [revision.id, readRecipeSnapshot(revision.snapshot)]));
  const projectedRecipes = recipes.map((recipe) => {
    const snapshot = recipe.latestRevisionId ? snapshots.get(recipe.latestRevisionId) : null;
    return snapshot
      ? { ...recipe, ...snapshot, id: recipe.id, deletedAt: recipe.deletedAt }
      : recipe;
  });
  const data = query
    ? projectedRecipes.filter((recipe) => recipe.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    : projectedRecipes;

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as RecipePayload;
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const imageUrlInput = typeof payload.imageUrl === "string" ? payload.imageUrl.trim() : "";
  const imageUrl = getSupportedRecipeImageUrl(imageUrlInput);

  if (!title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }

  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  let ingredients;
  let steps;
  let totalTimeMinutes;
  try {
    ingredients = normalizeIngredients(payload.ingredients);
    steps = normalizeSteps(payload.steps);
    totalTimeMinutes = normalizeOptionalMinutes(payload.totalTimeMinutes);
  } catch (error) {
    if (error instanceof RecipeInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  if (imageUrlInput && !imageUrl) {
    return NextResponse.json({ error: "imageUrl must be a local path or an HTTP(S) URL." }, { status: 400 });
  }

  const recipe = await prisma.$transaction(async (tx) => {
    const created = await tx.recipe.create({
      data: {
        householdId: membership.householdId,
        createdById: userId,
        title,
        description: typeof payload.description === "string" ? payload.description.trim() : null,
        notes: typeof payload.notes === "string" ? payload.notes.trim() || null : null,
        servings: typeof payload.servings === "number" && payload.servings > 0 ? Math.floor(payload.servings) : 1,
        totalTimeMinutes,
        tags: normalizeTags(payload.tags),
        imageUrl,
        visibility: payload.visibility === RecipeVisibility.PUBLIC ? RecipeVisibility.PUBLIC : RecipeVisibility.PRIVATE,
        publishedAt: payload.visibility === RecipeVisibility.PUBLIC ? new Date() : null,
        ingredients: {
          create: ingredients,
        },
        steps: {
          create: steps,
        },
      },
    });
    if (created.visibility === RecipeVisibility.PUBLIC) await createRecipeRevision(tx, created.id, userId);
    return tx.recipe.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        ingredients: { orderBy: { position: "asc" } },
        steps: { orderBy: { position: "asc" } },
      },
    });
  });

  return NextResponse.json({ data: recipe }, { status: 201 });
}
