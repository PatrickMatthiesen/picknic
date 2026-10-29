import { expect, test } from "bun:test";
import { matchesRecipeSearch, recipeSearchPage } from "./recipe-search";
const recipe = { title: "Weeknight pasta", tags: ["Vegetarian"], ingredients: [{ name: "tomato" }, { name: "wheat pasta" }], totalTimeMinutes: 25 };
test("search matches title, ingredients and explicit tags together", () => {
  expect(matchesRecipeSearch(recipe, { q: "tomato vegetarian", maxMinutes: "30", diet: "vegetarian" })).toBe(true);
  expect(matchesRecipeSearch(recipe, { maxMinutes: "15" })).toBe(false);
  expect(matchesRecipeSearch(recipe, { exclude: "peanut, wheat" })).toBe(false);
  expect(matchesRecipeSearch({ ...recipe, totalTimeMinutes: null }, { maxMinutes: "30" })).toBe(false);
});
test("filtering before pagination retains older matches", () => {
  const all = Array.from({ length: 80 }, (_, i) => ({ ...recipe, title: i === 79 ? "Older tofu" : "Other", ingredients: [] }));
  const found = recipeSearchPage(all.filter(item => matchesRecipeSearch(item, { q: "tofu" })), "1", 18);
  expect(found.total).toBe(1);
  expect(found.items[0].title).toBe("Older tofu");
  expect(recipeSearchPage(all, "2", 48).items.length).toBe(32);
  expect(recipeSearchPage(all, "999", 48).page).toBe(2);
});
