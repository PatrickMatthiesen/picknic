import { describe, expect, test } from "bun:test";
import { MAX_RECIPE_MINUTES, normalizeIngredients, normalizeOptionalMinutes, normalizeSteps, normalizeTags } from "./recipe-input";

describe("recipe input normalization", () => {
  test("drops empty buffers and preserves component metadata", () => {
    expect(normalizeIngredients([
      { name: " Chicken thighs ", quantity: "4", unit: " pieces ", notes: " skin on ", component: " Braise ", componentId: " braise ", componentPosition: 2 },
      { name: "", quantity: null, unit: null },
    ])).toEqual([{
      name: "Chicken thighs",
      quantity: 4,
      unit: "piece",
      unitId: "count-piece",
      notes: "skin on",
      component: "Braise",
      componentId: "braise",
      componentPosition: 2,
      position: 1,
    }]);
  });

  test("accepts structured and legacy instruction payloads", () => {
    expect(normalizeSteps([
      { instruction: " Preheat the oven. ", component: " Braise ", componentId: "braise", componentPosition: 1, durationMinutes: "10", advanceNotice: true },
      "Season the chicken.",
      { instruction: "" },
    ])).toEqual([
      { instruction: "Preheat the oven.", component: "Braise", componentId: "braise", componentPosition: 1, durationMinutes: 10, advanceNotice: true, position: 1 },
      { instruction: "Season the chicken.", component: null, componentId: null, componentPosition: null, durationMinutes: null, advanceNotice: false, position: 2 },
    ]);
  });

  test("does not guess a system for ambiguous legacy units", () => {
    expect(normalizeIngredients([{ name: "Flour", quantity: 2, unit: "cup" }])[0]).toMatchObject({
      unit: "cup",
      unitId: null,
    });
  });

  test("normalizes minutes and caps unique tags", () => {
    expect(normalizeOptionalMinutes("55.9")).toBe(55);
    expect(() => normalizeOptionalMinutes(0)).toThrow();
    expect(() => normalizeOptionalMinutes(MAX_RECIPE_MINUTES + 1)).toThrow();
    expect(normalizeTags([" Dinner ", "Dinner", ...Array.from({ length: 12 }, (_, index) => `tag-${index}`)])).toHaveLength(10);
  });
});
