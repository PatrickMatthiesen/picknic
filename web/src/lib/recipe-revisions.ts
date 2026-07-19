import { Prisma, type RecipeVisibility } from "@prisma/client";

export type RecipeSnapshotIngredient = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unitId: string | null;
  notes: string | null;
  component: string | null;
  componentId: string | null;
  componentPosition: number | null;
  position: number;
};

export type RecipeSnapshotStep = {
  id: string;
  instruction: string;
  component: string | null;
  componentId: string | null;
  componentPosition: number | null;
  durationMinutes: number | null;
  advanceNotice: boolean;
  position: number;
};

export type RecipeSnapshot = {
  recipeId: string;
  title: string;
  description: string | null;
  servings: number;
  totalTimeMinutes: number | null;
  tags: string[];
  imageUrl: string | null;
  visibility: RecipeVisibility;
  authorName: string;
  ingredients: RecipeSnapshotIngredient[];
  steps: RecipeSnapshotStep[];
};

type RevisionClient = Pick<Prisma.TransactionClient, "recipe" | "recipeRevision">;

const recipeSnapshotInclude = {
  createdBy: { select: { id: true, displayName: true, email: true } },
  ingredients: { orderBy: { position: "asc" as const } },
  steps: { orderBy: { position: "asc" as const } },
};

function toSnapshot(recipe: Prisma.RecipeGetPayload<{ include: typeof recipeSnapshotInclude }>): RecipeSnapshot {
  return {
    recipeId: recipe.id,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    totalTimeMinutes: recipe.totalTimeMinutes,
    tags: recipe.tags,
    imageUrl: recipe.imageUrl,
    visibility: recipe.visibility,
    authorName: recipe.createdBy.displayName?.trim() || "Picknic cook",
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      quantity: ingredient.quantity === null ? null : Number(ingredient.quantity),
      unit: ingredient.unit,
      unitId: ingredient.unitId,
      notes: ingredient.notes,
      component: ingredient.component,
      componentId: ingredient.componentId,
      componentPosition: ingredient.componentPosition,
      position: ingredient.position,
    })),
    steps: recipe.steps.map((step) => ({
      id: step.id,
      instruction: step.instruction,
      component: step.component,
      componentId: step.componentId,
      componentPosition: step.componentPosition,
      durationMinutes: step.durationMinutes,
      advanceNotice: step.advanceNotice,
      position: step.position,
    })),
  };
}

export function readRecipeSnapshot(value: Prisma.JsonValue): RecipeSnapshot {
  return value as unknown as RecipeSnapshot;
}

export async function createRecipeRevision(client: RevisionClient, recipeId: string, publishedById: string) {
  const [recipe, latest] = await Promise.all([
    client.recipe.findUniqueOrThrow({ where: { id: recipeId }, include: recipeSnapshotInclude }),
    client.recipeRevision.findFirst({ where: { recipeId }, orderBy: { version: "desc" }, select: { version: true } }),
  ]);

  const revision = await client.recipeRevision.create({
    data: {
      recipeId,
      publishedById,
      version: (latest?.version ?? 0) + 1,
      snapshot: toSnapshot(recipe) as unknown as Prisma.InputJsonValue,
    },
  });
  if (recipe.visibility === "PUBLIC") {
    await client.recipe.update({ where: { id: recipeId }, data: { latestRevisionId: revision.id } });
  }
  return revision;
}

export async function ensureRecipeRevision(client: RevisionClient, recipeId: string, publishedById: string) {
  const recipe = await client.recipe.findUniqueOrThrow({
    where: { id: recipeId },
    select: { latestRevisionId: true, visibility: true },
  });
  if (recipe.visibility === "PUBLIC" && recipe.latestRevisionId) {
    const revision = await client.recipeRevision.findUnique({ where: { id: recipe.latestRevisionId } });
    if (revision) return revision;
  }
  return createRecipeRevision(client, recipeId, publishedById);
}
