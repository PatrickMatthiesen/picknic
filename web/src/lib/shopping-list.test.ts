import { describe, expect, test } from "bun:test";
import { buildAutoShoppingItems, subtractPantryFromShoppingItems } from "@/lib/shopping-list";

describe("buildAutoShoppingItems", () => {
  test("aggregates quantities across meal plan entries and servings overrides", () => {
    const items = buildAutoShoppingItems({
      entries: [
        {
          servingsOverride: 4,
          recipe: {
            servings: 2,
            ingredients: [
              { name: "Rice", quantity: 100, unit: "g" },
              { name: "Salt", quantity: 1, unit: "tsp", unitId: "metric-teaspoon" },
            ],
          },
        },
        {
          servingsOverride: null,
          recipe: {
            servings: 2,
            ingredients: [
              { name: "Rice", quantity: 100, unit: "g" },
              { name: "Salt", quantity: 1, unit: "tsp", unitId: "metric-teaspoon" },
            ],
          },
        },
      ],
    });

    expect(items).toEqual([
      { ingredientName: "Rice", quantity: 300, source: "AUTO", status: "PENDING", unit: "g", unitId: "metric-gram" },
      { ingredientName: "Salt", quantity: 3, source: "AUTO", status: "PENDING", unit: "tsp", unitId: "metric-teaspoon" },
    ]);
  });

  test("combines common unit aliases", () => {
    expect(buildAutoShoppingItems({
      entries: [{
        servingsOverride: null,
        recipe: {
          servings: 1,
          ingredients: [
            { name: "Oil", quantity: 1, unit: "tbs", unitId: "metric-tablespoon" },
            { name: "Oil", quantity: 2, unit: "tablespoons", unitId: "metric-tablespoon" },
          ],
        },
      }],
    })).toEqual([{
      ingredientName: "Oil",
      quantity: 3,
      source: "AUTO",
      status: "PENDING",
      unit: "tbsp",
      unitId: "metric-tablespoon",
    }]);
  });

  test("keeps ambiguous units separate by canonical id", () => {
    expect(buildAutoShoppingItems({
      entries: [{
        servingsOverride: null,
        recipe: {
          servings: 1,
          ingredients: [
            { name: "Flour", quantity: 1, unit: "cup", unitId: "metric-cup" },
            { name: "Flour", quantity: 1, unit: "cup", unitId: "us-cup" },
          ],
        },
      }],
    })).toEqual([
      {
        ingredientName: "Flour",
        quantity: 1,
        source: "AUTO",
        status: "PENDING",
        unit: "cup",
        unitId: "metric-cup",
      },
      {
        ingredientName: "Flour",
        quantity: 1,
        source: "AUTO",
        status: "PENDING",
        unit: "cup",
        unitId: "us-cup",
      },
    ]);
  });

  test("rounds only after all scaled quantities are aggregated", () => {
    const entry = {
      servingsOverride: 1,
      recipe: { servings: 3, ingredients: [{ name: "Yeast", quantity: 0.01, unit: "g", unitId: "metric-gram" }] },
    };
    expect(buildAutoShoppingItems({ entries: [entry, entry, entry] })[0]?.quantity).toBe(0.01);
  });
});

describe("subtractPantryFromShoppingItems", () => {
  test("subtracts pantry quantities and removes fully covered items", () => {
    const adjusted = subtractPantryFromShoppingItems(
      [
        { ingredientName: "Rice", quantity: 300, source: "AUTO", status: "PENDING", unit: "g", unitId: "metric-gram" },
        { ingredientName: "Salt", quantity: 3, source: "AUTO", status: "PENDING", unit: "tsp", unitId: "metric-teaspoon" },
      ],
      [
        { ingredientName: "Rice", quantity: 150, unit: "g" },
        { ingredientName: "Salt", quantity: 5, unit: "tsp", unitId: "metric-teaspoon" },
      ],
    );

    expect(adjusted).toEqual([{
      ingredientName: "Rice",
      quantity: 150,
      source: "AUTO",
      status: "PENDING",
      unit: "g",
      unitId: "metric-gram",
    }]);
  });

  test("does not guess a system for ambiguous legacy pantry stock", () => {
    const adjusted = subtractPantryFromShoppingItems(
      [
        {
          ingredientName: "Flour",
          quantity: 2,
          source: "AUTO",
          status: "PENDING",
          unit: "cup",
          unitId: "metric-cup",
        },
        {
          ingredientName: "Flour",
          quantity: 2,
          source: "AUTO",
          status: "PENDING",
          unit: "cup",
          unitId: "us-cup",
        },
      ],
      [{ ingredientName: "Flour", quantity: 1, unit: "cup" }],
    );

    expect(adjusted).toEqual([
      {
        ingredientName: "Flour",
        quantity: 2,
        source: "AUTO",
        status: "PENDING",
        unit: "cup",
        unitId: "metric-cup",
      },
      {
        ingredientName: "Flour",
        quantity: 2,
        source: "AUTO",
        status: "PENDING",
        unit: "cup",
        unitId: "us-cup",
      },
    ]);
  });

  test("subtracts explicitly Metric pantry stock only from Metric quantities", () => {
    const adjusted = subtractPantryFromShoppingItems(
      [
        { ingredientName: "Flour", quantity: 2, source: "AUTO", status: "PENDING", unit: "cup", unitId: "metric-cup" },
        { ingredientName: "Flour", quantity: 2, source: "AUTO", status: "PENDING", unit: "cup", unitId: "us-cup" },
      ],
      [{ ingredientName: "Flour", quantity: 1, unit: "cup", unitId: "metric-cup" }],
    );

    expect(adjusted.map((item) => [item.unitId, item.quantity])).toEqual([
      ["metric-cup", 1],
      ["us-cup", 2],
    ]);
  });
});
