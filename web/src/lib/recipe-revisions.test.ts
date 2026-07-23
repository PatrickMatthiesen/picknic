import { describe, expect, test } from "bun:test";
import { readRecipeSnapshot } from "./recipe-revisions";

describe("recipe revision compatibility", () => {
  test("normalizes notes missing from snapshots created before recipe notes existed", () => {
    const snapshot = readRecipeSnapshot({
      recipeId: "recipe-1",
      title: "Archived recipe",
      description: null,
      servings: 4,
      totalTimeMinutes: null,
      tags: [],
      imageUrl: null,
      visibility: "PRIVATE",
      authorName: "Picknic cook",
      ingredients: [],
      steps: [],
    });

    expect(snapshot.notes).toBeNull();
    expect(Object.assign({ notes: "live private note" }, snapshot).notes).toBeNull();
  });
});
