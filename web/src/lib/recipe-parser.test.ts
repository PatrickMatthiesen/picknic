import { describe, expect, test } from "bun:test";
import {
  normalizeParsedRecipeDraft,
  RECIPE_EXTRACTION_INSTRUCTIONS,
  recipeResponseFormat,
} from "./recipe-parser";

describe("AI recipe import contract", () => {
  test("preserves the complete importable recipe shape", () => {
    const parsed = normalizeParsedRecipeDraft({
      title: "Overnight focaccia sandwiches",
      description: "A make-ahead sandwich platter.",
      notes: "Roasted peppers can replace the tomatoes.",
      servings: 6,
      totalTimeMinutes: 780,
      tags: ["sandwiches", "make ahead"],
      measurementSystem: "metric",
      imageUrl: "https://example.com/focaccia.jpg",
      ingredientComponents: [
        {
          name: "Focaccia",
          ingredients: [
            { name: "bread flour", quantity: 500, unit: "g", notes: null },
            { name: "instant yeast", quantity: 7, unit: "g", notes: "one packet" },
          ],
        },
        {
          name: "Filling",
          ingredients: [
            { name: "tomatoes", quantity: 2, unit: null, notes: "thinly sliced" },
          ],
        },
      ],
      instructionComponents: [
        {
          name: "The night before",
          steps: [
            {
              instruction: "Mix the dough and refrigerate overnight.",
              durationMinutes: 720,
              advanceNotice: true,
            },
          ],
        },
        {
          name: "Bake and assemble",
          steps: [
            {
              instruction: "Bake until golden.",
              durationMinutes: 25,
              advanceNotice: false,
            },
            {
              instruction: "Fill and slice the sandwiches.",
              durationMinutes: null,
              advanceNotice: false,
            },
          ],
        },
      ],
    });

    expect(parsed).toEqual({
      title: "Overnight focaccia sandwiches",
      description: "A make-ahead sandwich platter.",
      notes: "Roasted peppers can replace the tomatoes.",
      servings: 6,
      totalTimeMinutes: 780,
      tags: ["sandwiches", "make ahead"],
      measurementSystem: "metric",
      imageUrl: "https://example.com/focaccia.jpg",
      ingredientComponents: [
        {
          name: "Focaccia",
          ingredients: [
            { name: "bread flour", quantity: 500, unit: "g", notes: null },
            { name: "instant yeast", quantity: 7, unit: "g", notes: "one packet" },
          ],
        },
        {
          name: "Filling",
          ingredients: [
            { name: "tomatoes", quantity: 2, unit: null, notes: "thinly sliced" },
          ],
        },
      ],
      instructionComponents: [
        {
          name: "The night before",
          steps: [
            {
              instruction: "Mix the dough and refrigerate overnight.",
              durationMinutes: 720,
              advanceNotice: true,
            },
          ],
        },
        {
          name: "Bake and assemble",
          steps: [
            {
              instruction: "Bake until golden.",
              durationMinutes: 25,
              advanceNotice: false,
            },
            {
              instruction: "Fill and slice the sandwiches.",
              durationMinutes: null,
              advanceNotice: false,
            },
          ],
        },
      ],
    });
  });

  test("normalizes unsafe or empty optional model values", () => {
    const parsed = normalizeParsedRecipeDraft({
      title: "  Toast  ",
      description: null,
      notes: null,
      servings: "2.9",
      totalTimeMinutes: -5,
      tags: [" quick ", "", 4],
      measurementSystem: "other",
      imageUrl: " ",
      ingredientComponents: [
        { name: "", ingredients: [{ name: " bread ", quantity: "2", unit: " slices ", notes: " " }] },
        { name: "Empty", ingredients: [] },
      ],
      instructionComponents: [
        {
          name: "",
          steps: [
            { instruction: " Toast it. ", durationMinutes: 20_000, advanceNotice: "yes" },
            { instruction: " ", durationMinutes: 2, advanceNotice: true },
          ],
        },
      ],
    });

    expect(parsed).toEqual({
      title: "Toast",
      description: "",
      notes: "",
      servings: 2,
      totalTimeMinutes: null,
      tags: ["quick"],
      measurementSystem: null,
      imageUrl: null,
      ingredientComponents: [{
        name: null,
        ingredients: [{ name: "bread", quantity: 2, unit: "slices", notes: null }],
      }],
      instructionComponents: [{
        name: null,
        steps: [{ instruction: "Toast it.", durationMinutes: null, advanceNotice: false }],
      }],
    });
  });

  test("keeps every editable AI field in the strict schema and prompt", () => {
    const schema = recipeResponseFormat.json_schema.schema;
    expect(schema.required).toEqual([
      "title",
      "description",
      "notes",
      "servings",
      "totalTimeMinutes",
      "tags",
      "measurementSystem",
      "imageUrl",
      "ingredientComponents",
      "instructionComponents",
    ]);
    expect(schema.additionalProperties).toBe(false);
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("recipe-level notes");
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("advanceNotice true");
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("upper bound of a time range");
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("top-level prep and cook times");
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("Do not invent");
  });
});
