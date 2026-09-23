import { describe, expect, test } from "bun:test";
import { getShoppingPlanFingerprint } from "./shopping-list-state";

const entry = { id: "a", recipeId: "recipe", recipeRevisionId: "revision", date: new Date("2030-04-03"), mealType: "DINNER", servingsOverride: 2 };
describe("shopping plan fingerprint", () => {
  test("is stable across query order", () => {
    const other = { ...entry, id: "b" };
    expect(getShoppingPlanFingerprint([entry, other])).toBe(getShoppingPlanFingerprint([other, entry]));
  });
  test("detects added, removed, rescheduled and changed meals", () => {
    const original = getShoppingPlanFingerprint([entry]);
    for (const entries of [[], [entry, { ...entry, id: "b" }], [{ ...entry, servingsOverride: 4 }], [{ ...entry, date: new Date("2030-04-04") }], [{ ...entry, recipeRevisionId: "new-revision" }]]) {
      expect(getShoppingPlanFingerprint(entries)).not.toBe(original);
    }
  });
});
