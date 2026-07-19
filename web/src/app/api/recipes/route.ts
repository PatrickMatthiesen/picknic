import { RecipeVisibility } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { normalizeIngredients, normalizeOptionalMinutes, normalizeSteps, normalizeTags } from "@/lib/recipe-input";

type RecipePayload = {
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
      ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
      ...(view === "discover"
        ? { visibility: RecipeVisibility.PUBLIC, NOT: { householdId: membership.householdId } }
        : view === "saved"
          ? { saves: { some: { userId } } }
          : { householdId: membership.householdId }),
    },
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
      totalTimeMinutes: normalizeOptionalMinutes(payload.totalTimeMinutes),
      tags: normalizeTags(payload.tags),
      imageUrl: typeof payload.imageUrl === "string" && payload.imageUrl.trim() ? payload.imageUrl.trim() : null,
      visibility: payload.visibility === RecipeVisibility.PUBLIC ? RecipeVisibility.PUBLIC : RecipeVisibility.PRIVATE,
      publishedAt: payload.visibility === RecipeVisibility.PUBLIC ? new Date() : null,
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
