import { describe, expect, test } from "bun:test";
import { aggregateIngredients, groupIngredientsByComponent } from "@/lib/ingredients";

describe("ingredient presentation", () => {
  test("aggregates compatible ingredients and keeps units separate", () => {
    expect(
      aggregateIngredients([
        { name: "Lemon", quantity: 1, unit: null, component: "Chicken" },
        { name: "Lemon", quantity: 0.5, unit: null, component: "Dressing" },
        { name: "Salt", quantity: 1, unit: "tsp", unitId: "metric-teaspoon", component: "Chicken" },
        { name: "Salt", quantity: 5, unit: "g", component: "Dressing" },
      ]),
    ).toEqual([
      { name: "Lemon", quantity: 1.5, unit: null, unitId: null },
      { name: "Salt", quantity: 5, unit: "g", unitId: "metric-gram" },
      { name: "Salt", quantity: 1, unit: "tsp", unitId: "metric-teaspoon" },
    ]);
  });

  test("aggregates aliases through their canonical unit", () => {
    expect(aggregateIngredients([
      { name: "Oil", quantity: 1, unit: "tbs", unitId: "metric-tablespoon" },
      { name: "Oil", quantity: 2, unit: "tablespoons", unitId: "metric-tablespoon" },
    ])).toEqual([{ name: "Oil", quantity: 3, unit: "tbsp", unitId: "metric-tablespoon" }]);
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

  test("keeps duplicate and unnamed components separate when stable ids are present", () => {
    const groups = groupIngredientsByComponent([
      { name: "Chicken", quantity: 1, unit: null, component: "Filling", componentId: "first", componentPosition: 1 },
      { name: "Beans", quantity: 1, unit: null, component: "Filling", componentId: "second", componentPosition: 2 },
      { name: "Salt", quantity: 1, unit: "tsp", component: null, componentId: "third", componentPosition: 3 },
      { name: "Pepper", quantity: 1, unit: "tsp", component: null, componentId: "fourth", componentPosition: 4 },
    ]);

    expect(groups.map((group) => group.ingredients.map((ingredient) => ingredient.name))).toEqual([
      ["Chicken"],
      ["Beans"],
      ["Salt"],
      ["Pepper"],
    ]);
  });
});
