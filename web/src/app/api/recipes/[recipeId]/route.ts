import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";

type RouteContext = { params: Promise<{ recipeId: string }> };

type RecipeUpdatePayload = {
  title?: unknown;
  description?: unknown;
  servings?: unknown;
  tags?: unknown;
  ingredients?: unknown;
  steps?: unknown;
};

type IngredientPayload = {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
};

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function normalizeIngredients(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is IngredientPayload => typeof value === "object" && value !== null)
    .map((ingredient, index) => {
      const quantity =
        typeof ingredient.quantity === "number" || typeof ingredient.quantity === "string"
          ? Number(ingredient.quantity)
          : null;

      return {
        name: typeof ingredient.name === "string" ? ingredient.name.trim() : "",
        quantity: Number.isFinite(quantity) ? quantity : null,
        unit: typeof ingredient.unit === "string" && ingredient.unit.trim().length > 0 ? ingredient.unit.trim() : null,
        position: index + 1,
      };
    })
    .filter((ingredient) => ingredient.name.length > 0);
}

function normalizeSteps(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === "string")
    .map((instruction, index) => ({
      instruction: instruction.trim(),
      position: index + 1,
    }))
    .filter((step) => step.instruction.length > 0);
}

export async function GET(_request: Request, context: RouteContext) {
  const { recipeId } = await context.params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId: membership.householdId },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
    },
  });

  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  return NextResponse.json({ data: recipe });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { recipeId } = await context.params;
  const payload = (await request.json()) as RecipeUpdatePayload;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const existingRecipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId: membership.householdId },
    select: { id: true },
  });

  if (!existingRecipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({
      where: { id: recipeId },
      data: {
        title: typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : undefined,
        description: typeof payload.description === "string" ? payload.description.trim() : undefined,
        servings: typeof payload.servings === "number" && payload.servings > 0 ? Math.floor(payload.servings) : undefined,
        tags: Array.isArray(payload.tags) ? normalizeTags(payload.tags) : undefined,
      },
    });

    if (Array.isArray(payload.ingredients)) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId } });
      const ingredients = normalizeIngredients(payload.ingredients);
      if (ingredients.length > 0) {
        await tx.recipeIngredient.createMany({
          data: ingredients.map((ingredient) => ({ ...ingredient, recipeId })),
        });
      }
    }

    if (Array.isArray(payload.steps)) {
      await tx.recipeStep.deleteMany({ where: { recipeId } });
      const steps = normalizeSteps(payload.steps);
      if (steps.length > 0) {
        await tx.recipeStep.createMany({
          data: steps.map((step) => ({ ...step, recipeId })),
        });
      }
    }
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
    where: { id: recipeId, householdId: membership.householdId },
    select: { id: true },
  });

  if (!existingRecipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  await prisma.recipe.delete({ where: { id: recipeId } });

  return new NextResponse(null, { status: 204 });
}
