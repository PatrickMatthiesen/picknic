export type RecipeSearchFilters = { q?: string; maxMinutes?: string; diet?: string; exclude?: string };
type SearchableRecipe = { title: string; tags: string[]; totalTimeMinutes: number | null; ingredients: { name: string }[] };
export function readSearchFilters(search: RecipeSearchFilters): RecipeSearchFilters {
  return { q: search.q?.trim(), maxMinutes: search.maxMinutes, diet: search.diet?.trim(), exclude: search.exclude?.trim() };
}
export function matchesRecipeSearch(recipe: SearchableRecipe, filters: RecipeSearchFilters) {
  const normalize = (value: string) => value.toLocaleLowerCase();
  const text = normalize([recipe.title, ...recipe.tags, ...recipe.ingredients.map(i => i.name)].join(" "));
  if (filters.q && !normalize(filters.q).split(/\s+/).every(word => text.includes(word))) return false;
  const minutes = Number(filters.maxMinutes);
  if (minutes > 0 && (recipe.totalTimeMinutes === null || recipe.totalTimeMinutes > minutes)) return false;
  if (filters.diet && !recipe.tags.some(tag => normalize(tag) === normalize(filters.diet!))) return false;
  const exclusions = filters.exclude?.split(",").map(item => normalize(item.trim())).filter(Boolean) ?? [];
  if (exclusions.some(item => recipe.ingredients.some(ingredient => normalize(ingredient.name).includes(item)))) return false;
  return true;
}
export function recipeSearchPage<T>(recipes: T[], requestedPage: string | number | undefined, size = 24) {
  const pageCount = Math.max(1, Math.ceil(recipes.length / size));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  return { items: recipes.slice((page - 1) * size, page * size), total: recipes.length, page, pageCount };
}
