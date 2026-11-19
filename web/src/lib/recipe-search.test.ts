import { expect, test } from "bun:test";
import { matchesRecipeSearch, readSearchFilters, recipeSearchPage } from "./recipe-search";
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

test("native filter submissions use the selected preset, custom value or no filter", () => {
  expect(readSearchFilters({ timeChoice: "30", maxMinutes: "42", dietChoice: "vegan", diet: "dairy-free" }))
    .toMatchObject({ maxMinutes: "30", diet: "vegan" });
  expect(readSearchFilters({ timeChoice: "custom", maxMinutes: "42", dietChoice: "custom", diet: " dairy-free " }))
    .toMatchObject({ maxMinutes: "42", diet: "dairy-free" });
  expect(readSearchFilters({ timeChoice: "", maxMinutes: "42", dietChoice: "", diet: "dairy-free" }))
    .toMatchObject({ maxMinutes: undefined, diet: "" });
  expect(readSearchFilters({ maxMinutes: "60", diet: "vegetarian" })).toMatchObject({ maxMinutes: "60", diet: "vegetarian" });
  expect(readSearchFilters({ filterAction: "clear", q: "soup", timeChoice: "30", dietChoice: "vegan", exclude: "peanuts" })).toEqual({ q: "soup" });
});
