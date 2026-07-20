const RECIPE_IMAGE_FALLBACKS = [
  "/recipe-images/lemon-herb-chicken-pasta.webp",
  "/recipe-images/sheet-pan-chicken-tacos.webp",
  "/recipe-images/beef-and-broccoli-stir-fry.webp",
  "/recipe-images/garlic-butter-salmon-potatoes-asparagus.webp",
  "/recipe-images/harissa-chickpea-bowls.webp",
  "/recipe-images/miso-glazed-tofu-bowls.webp",
] as const;

export type RecipeImageInput = {
  id: string;
  imageUrl?: string | null;
};

export function getRecipeImageFallbackUrl(recipeId: string): string {
  let hash = 0;
  for (const character of recipeId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return RECIPE_IMAGE_FALLBACKS[hash % RECIPE_IMAGE_FALLBACKS.length];
}

export function getRecipeImageUrl(recipe: RecipeImageInput): string {
  return getSupportedRecipeImageUrl(recipe.imageUrl) ?? getRecipeImageFallbackUrl(recipe.id);
}

export function getSupportedRecipeImageUrl(value: string | null | undefined): string | null {
  const imageUrl = value?.trim();
  if (imageUrl?.startsWith("/") && !imageUrl.startsWith("//")) {
    return imageUrl;
  }
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return imageUrl;
    } catch {
      // Invalid and unsupported URLs use the same deterministic fallback as an empty image.
    }
  }

  return null;
}

export function formatMealType(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
