import { describe, expect, test } from "bun:test";
import { groupRecipeSteps } from "@/lib/recipe-steps";

describe("recipe step presentation", () => {
  test("groups steps in first-seen order and adds their duration", () => {
    const groups = groupRecipeSteps([
      { instruction: "Brown the chicken", component: "Braise", durationMinutes: 8 },
      { instruction: "Simmer", component: "Braise", durationMinutes: 30 },
      { instruction: "Mix the herbs", component: "Dressing", durationMinutes: 5 },
    ]);

    expect(groups.map((group) => ({ component: group.component, durationMinutes: group.durationMinutes }))).toEqual([
      { component: "Braise", durationMinutes: 38 },
      { component: "Dressing", durationMinutes: 5 },
    ]);
  });
});
