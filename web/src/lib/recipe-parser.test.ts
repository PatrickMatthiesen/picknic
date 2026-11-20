import { describe, expect, test } from "bun:test";
import {
  normalizeParsedRecipeDraft,
  parseRecipePhotosWithAi,
  RECIPE_EXTRACTION_INSTRUCTIONS,
  RECIPE_REASONING_EFFORT,
  recipeResponseFormat,
} from "./recipe-parser";

test("photo extraction sends images in order and preserves unreadable quantities and warnings", async () => {
  const config = {
    AI_API_KEY: "fixture",
    AI_BASE_URL: "",
    AI_MODEL: "photo-test-model",
    AI_ALLOWED_MODELS: "",
  };
  const previousConfig = Object.keys(config).map((key) => [key, process.env[key]] as const);
  const requests: unknown[] = [];
  const provider = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/models") {
        return Response.json({ data: [{ id: config.AI_MODEL }] });
      }
      requests.push(await request.json());
      return Response.json({
        choices: [{ message: { content: JSON.stringify({
          recipe: {
            title: "Pear tart",
            servings: null,
            imageUrl: "https://example.com/ignored",
            ingredientComponents: [{ ingredients: [{ name: "flour", quantity: null, unit: "g" }] }],
          },
          warnings: [" The amount of flour is unreadable. "],
        }) } }],
      });
    },
  });
  try {
    Object.assign(process.env, config, { AI_BASE_URL: new URL("/v1", provider.url).href });
    const result = await parseRecipePhotosWithAi([
      { bytes: new Uint8Array([1, 2]), contentType: "image/jpeg" },
      { bytes: new Uint8Array([3, 4]), contentType: "image/png" },
    ]);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: config.AI_MODEL,
      response_format: { type: "json_schema", json_schema: { strict: true } },
      messages: [
        { role: "system" },
        { role: "user", content: [
          { type: "text" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,AQI=" } },
          { type: "image_url", image_url: { url: "data:image/png;base64,AwQ=" } },
        ] },
      ],
    });
    expect(result.draft.title).toBe("Pear tart");
    expect(result.draft.servings).toBeNull();
    expect(result.draft.imageUrl).toBeNull();
    expect(result.draft.ingredientComponents[0]?.ingredients[0]?.quantity).toBeNull();
    expect(result.warnings).toEqual(["The amount of flour is unreadable."]);
  } finally {
    provider.stop(true);
    for (const [key, value] of previousConfig) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

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
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("custom unit string");
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("tiny pinch of sugar");
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("quantity null, unit null");
    expect(RECIPE_REASONING_EFFORT).toBe("low");
    expect(RECIPE_EXTRACTION_INSTRUCTIONS).toContain("Do not invent");
  });
});
