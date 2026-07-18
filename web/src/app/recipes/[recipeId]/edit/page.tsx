import { RecipeVisibility } from "@prisma/client";
import { notFound } from "next/navigation";
import { AppPageShell } from "@/app/_components/page-shell";
import { RecipeEditorClient, type RecipeDraft } from "@/app/recipes/new/recipe-editor-client";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ recipeId: string }> };

export default async function EditRecipePage({ params }: PageProps) {
  const { recipeId } = await params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) notFound();
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, householdId: membership.householdId }, include: { ingredients: { orderBy: { position: "asc" } }, steps: { orderBy: { position: "asc" } } } });
  if (!recipe) notFound();
  const draft: RecipeDraft = {
    title: recipe.title,
    description: recipe.description ?? "",
    servings: recipe.servings,
    tags: recipe.tags,
    imageUrl: recipe.imageUrl ?? "",
    visibility: recipe.visibility ?? RecipeVisibility.PRIVATE,
    ingredients: recipe.ingredients.map((ingredient) => ({ name: ingredient.name, quantity: ingredient.quantity == null ? null : Number(ingredient.quantity), unit: ingredient.unit, component: ingredient.component })),
    steps: recipe.steps.map((step) => step.instruction),
  };
  return <AppPageShell currentPath="/recipes" title="Edit recipe" subtitle="Keep the version your household actually cooks." maxWidthClassName="max-w-5xl"><RecipeEditorClient initialDraft={draft} recipeId={recipeId} /></AppPageShell>;
}
