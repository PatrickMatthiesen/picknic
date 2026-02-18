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
              { name: "Salt", quantity: 1, unit: "tsp" },
            ],
          },
        },
        {
          servingsOverride: null,
          recipe: {
            servings: 2,
            ingredients: [
              { name: "Rice", quantity: 100, unit: "g" },
              { name: "Salt", quantity: 1, unit: "tsp" },
            ],
          },
        },
      ],
    });

    expect(items).toEqual([
      { ingredientName: "Rice", quantity: 300, source: "AUTO", status: "PENDING", unit: "g" },
      { ingredientName: "Salt", quantity: 3, source: "AUTO", status: "PENDING", unit: "tsp" },
    ]);
  });
});

describe("subtractPantryFromShoppingItems", () => {
  test("subtracts pantry quantities and removes fully covered items", () => {
    const adjusted = subtractPantryFromShoppingItems(
      [
        { ingredientName: "Rice", quantity: 300, source: "AUTO", status: "PENDING", unit: "g" },
        { ingredientName: "Salt", quantity: 3, source: "AUTO", status: "PENDING", unit: "tsp" },
      ],
      [
        { ingredientName: "Rice", quantity: 150, unit: "g" },
        { ingredientName: "Salt", quantity: 5, unit: "tsp" },
      ],
    );

    expect(adjusted).toEqual([{ ingredientName: "Rice", quantity: 150, source: "AUTO", status: "PENDING", unit: "g" }]);
  });
});
