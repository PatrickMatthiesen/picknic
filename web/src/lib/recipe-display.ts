const RECIPE_IMAGE_FALLBACKS = [
  "/recipe-images/lemon-herb-chicken-pasta.webp",
  "/recipe-images/sheet-pan-chicken-tacos.webp",
  "/recipe-images/beef-and-broccoli-stir-fry.webp",
  "/recipe-images/garlic-butter-salmon-potatoes-asparagus.webp",
  "/recipe-images/harissa-chickpea-bowls.webp",
  "/recipe-images/miso-glazed-tofu-bowls.webp",
] as const;

type RecipeImageInput = {
  id: string;
  imageUrl?: string | null;
};

export function getRecipeImageUrl(recipe: RecipeImageInput): string {
  if (recipe.imageUrl) {
    return recipe.imageUrl;
  }

  let hash = 0;
  for (const character of recipe.id) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return RECIPE_IMAGE_FALLBACKS[hash % RECIPE_IMAGE_FALLBACKS.length];
}

export function formatMealType(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
