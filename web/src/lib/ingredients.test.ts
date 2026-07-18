import { describe, expect, test } from "bun:test";
import { aggregateIngredients, groupIngredientsByComponent } from "@/lib/ingredients";

describe("ingredient presentation", () => {
  test("aggregates compatible ingredients and keeps units separate", () => {
    expect(
      aggregateIngredients([
        { name: "Lemon", quantity: 1, unit: null, component: "Chicken" },
        { name: "Lemon", quantity: 0.5, unit: null, component: "Dressing" },
        { name: "Salt", quantity: 1, unit: "tsp", component: "Chicken" },
        { name: "Salt", quantity: 5, unit: "g", component: "Dressing" },
      ]),
    ).toEqual([
      { name: "Lemon", quantity: 1.5, unit: null },
      { name: "Salt", quantity: 5, unit: "g" },
      { name: "Salt", quantity: 1, unit: "tsp" },
    ]);
  });

  test("groups ingredients by recipe component", () => {
    const ingredients = [
      { name: "Chicken", quantity: 1, unit: null, component: "Braised chicken" },
      { name: "Lemon", quantity: 1, unit: null, component: "Dressing" },
      { name: "Salt", quantity: 1, unit: "tsp", component: null },
    ];

    expect(groupIngredientsByComponent(ingredients).map((group) => group.component)).toEqual([
      "Braised chicken",
      "Dressing",
      "Main",
    ]);
  });
});
