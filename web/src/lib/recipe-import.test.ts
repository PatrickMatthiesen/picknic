import { describe, expect, test } from "bun:test";
import { extractRecipeJsonLd, extractStructuredRecipeJsonLd, isPrivateImportAddress, safeRecipeUrl, validatePicknicRecipeFile } from "./recipe-import";

describe("safe recipe URL import", () => {
  test("accepts only credential-free HTTPS hostnames, not local or literal IP targets", () => {
    expect(safeRecipeUrl("https://recipes.example/cake")?.hostname).toBe("recipes.example");
    for (const value of ["https://recipes.example:8443/x", "http://recipes.example/x", "https://user:pass@recipes.example/x", "https://localhost/x", "https://192.168.1.4/x", "https://[::1]/x", `https://${"a".repeat(2050)}.com/`]) expect(safeRecipeUrl(value)).toBeNull();
  });
  test("rejects private, reserved, and IPv4-mapped private DNS answers", () => {
    for (const ip of ["0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.10.1", "172.31.2.4", "192.168.1.3", "198.19.0.1", "ff02::1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1"]) expect(isPrivateImportAddress(ip)).toBe(true);
    expect(isPrivateImportAddress("8.8.8.8")).toBe(false);
    expect(isPrivateImportAddress("2606:4700:4700::1111")).toBe(false);
  });
  test("extracts Recipe metadata inside a JSON-LD graph and ignores malformed blocks", () => {
    const html = `<script type="application/ld+json">{bad}</script><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Recipe", name: "Apple cake", description: "Soft cake", recipeYield: "8 slices", recipeIngredient: ["2 apples", "200 g flour"], recipeInstructions: [{ "@type": "HowToStep", text: "Mix the batter." }, "Bake until golden."] }] })}</script>`;
    const text = extractRecipeJsonLd(html)!;
    expect(text).toContain("Apple cake");
    expect(text).toContain("2 apples");
    expect(text).toContain("Mix the batter.");
    expect(extractRecipeJsonLd("<html>no recipe data</html>")).toBeNull();
  });
  test("creates an editable structured draft without AI and keeps nested instruction sections", () => {
    const recipe = { "@type": "Recipe", name: "Soup", description: "Warm soup", recipeYield: "6 bowls", totalTime: "PT1H15M", recipeIngredient: ["1 bunch kale", "Salt to taste"], recipeInstructions: [{ "@type": "HowToSection", name: "Prepare", itemListElement: [{ "@type": "HowToStep", text: "Wash the kale." }, { "@type": "HowToStep", text: "Chop it." }] }, { "@type": "HowToSection", name: "Cook", itemListElement: [{ "@type": "HowToStep", text: "Simmer until tender." }] }] };
    const html = `<script type="application/ld+json">${JSON.stringify(recipe)}</script>`;
    const draft = extractStructuredRecipeJsonLd(html)!;
    expect(draft.recipe.title).toBe("Soup");
    expect(draft.recipe.servings).toBe(6);
    expect(draft.recipe.totalTimeMinutes).toBe(75);
    expect(draft.recipe.ingredientComponents[0]!.ingredients.map((item) => item.name)).toEqual(["1 bunch kale", "Salt to taste"]);
    expect(draft.recipe.instructionComponents.map((component) => component.name)).toEqual(["Prepare", "Cook"]);
    expect(draft.recipe.instructionComponents[0]!.steps.map((step) => step.instruction)).toEqual(["Wash the kale.", "Chop it."]);
    expect(validatePicknicRecipeFile(draft)).toBe(true);
  });
});

describe("Picknic recipe file validation", () => {
  const valid = { format: "picknic-recipe-v1", recipe: { title: "Cake", description: "", notes: "", servings: 4, totalTimeMinutes: 35, tags: ["dessert"], imageUrl: "", visibility: "PRIVATE", ingredientComponents: [{ name: "", ingredients: [{ name: "flour", quantity: 200, unit: "g", unitId: null, notes: "" }] }], instructionComponents: [{ name: "", steps: [{ instruction: "Bake", durationMinutes: 30, advanceNotice: false }] }] } };
  test("accepts the documented recipe shape", () => expect(validatePicknicRecipeFile(valid)).toBe(true));
  test("rejects incompatible version and malformed nested fields before editor use", () => {
    expect(validatePicknicRecipeFile({ ...valid, format: "paprika" })).toBe(false);
    expect(validatePicknicRecipeFile({ ...valid, recipe: { ...valid.recipe, servings: 0 } })).toBe(false);
    expect(validatePicknicRecipeFile({ ...valid, recipe: { ...valid.recipe, tags: [2] } })).toBe(false);
    expect(validatePicknicRecipeFile({ ...valid, recipe: { ...valid.recipe, ingredientComponents: [{ name: "", ingredients: [{ name: "flour", quantity: "a lot" }] }] } })).toBe(false);
    expect(validatePicknicRecipeFile({ ...valid, recipe: { ...valid.recipe, instructionComponents: [{ name: "", steps: [{ instruction: "Bake", advanceNotice: "no" }] }] } })).toBe(false);
  });
});
