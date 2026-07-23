import { RecipeVisibility } from "@prisma/client";
import { notFound } from "next/navigation";
import { AppNav } from "@/app/_components/app-nav";
import { RecipeEditorClient, type RecipeDraft } from "@/app/recipes/new/recipe-editor-client";
import { isAiRecipeImportAvailable } from "@/lib/ai-config";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ recipeId: string }> };

export default async function EditRecipePage({ params }: PageProps) {
  const { recipeId } = await params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) notFound();
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, householdId: membership.householdId, deletedAt: null }, include: { ingredients: { orderBy: { position: "asc" } }, steps: { orderBy: { position: "asc" } } } });
  if (!recipe) notFound();
  const ingredientComponents: RecipeDraft["ingredientComponents"] = [];
  for (const ingredient of recipe.ingredients) {
    const name = ingredient.component ?? "";
    const componentId = ingredient.componentId ?? `legacy-ingredient:${name}`;
    let component = ingredientComponents.find((item) => item.id === componentId);
    if (!component) {
      component = { id: componentId, name, ingredients: [] };
      ingredientComponents.push(component);
    }
    component.ingredients.push({
      id: ingredient.id,
      name: ingredient.name,
      quantity: ingredient.quantity == null ? null : Number(ingredient.quantity),
      unit: ingredient.unit,
      unitId: ingredient.unitId,
      notes: ingredient.notes ?? "",
    });
  }

  const instructionComponents: RecipeDraft["instructionComponents"] = [];
  for (const step of recipe.steps) {
    const name = step.component ?? "";
    const componentId = step.componentId ?? `legacy-instruction:${name}`;
    let component = instructionComponents.find((item) => item.id === componentId);
    if (!component) {
      component = { id: componentId, name, steps: [] };
      instructionComponents.push(component);
    }
    component.steps.push({ id: step.id, instruction: step.instruction, durationMinutes: step.durationMinutes, advanceNotice: step.advanceNotice });
  }

  const draft: RecipeDraft = {
    title: recipe.title,
    description: recipe.description ?? "",
    servings: recipe.servings,
    totalTimeMinutes: recipe.totalTimeMinutes,
    tags: recipe.tags,
    imageUrl: recipe.imageUrl ?? "",
    visibility: recipe.visibility ?? RecipeVisibility.PRIVATE,
    ingredientComponents: ingredientComponents.length ? ingredientComponents : [{ id: "ingredient-component-initial", name: "", ingredients: [] }],
    instructionComponents: instructionComponents.length ? instructionComponents : [{ id: "instruction-component-initial", name: "", steps: [] }],
  };
  return <main className="app-theme-page app-shell recipe-authoring-shell"><AppNav currentPath="/recipes" /><RecipeEditorClient aiRecipeImportEnabled={await isAiRecipeImportAvailable()} initialDraft={draft} recipeId={recipeId} /></main>;
}
