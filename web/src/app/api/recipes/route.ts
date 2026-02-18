import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";

type RecipePayload = {
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

export async function GET() {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const recipes = await prisma.recipe.findMany({
    where: { householdId: membership.householdId },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: recipes });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as RecipePayload;
  const title = typeof payload.title === "string" ? payload.title.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }

  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);

  if (!membership) {
    return NextResponse.json({ error: "No household found for this user." }, { status: 400 });
  }

  const recipe = await prisma.recipe.create({
    data: {
      householdId: membership.householdId,
      createdById: userId,
      title,
      description: typeof payload.description === "string" ? payload.description.trim() : null,
      servings: typeof payload.servings === "number" && payload.servings > 0 ? Math.floor(payload.servings) : 1,
      tags: normalizeTags(payload.tags),
      ingredients: {
        create: normalizeIngredients(payload.ingredients),
      },
      steps: {
        create: normalizeSteps(payload.steps),
      },
    },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
    },
  });

  return NextResponse.json({ data: recipe }, { status: 201 });
}
