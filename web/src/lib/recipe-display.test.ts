import { describe, expect, test } from "bun:test";
import { getRecipeImageFallbackUrl, getRecipeImageUrl, getSupportedRecipeImageUrl } from "@/lib/recipe-display";

describe("recipe images", () => {
  test("keeps browser-renderable recipe image URLs", () => {
    expect(getRecipeImageUrl({ id: "recipe-1", imageUrl: " https://images.example.com/dinner.jpg " }))
      .toBe("https://images.example.com/dinner.jpg");
    expect(getRecipeImageUrl({ id: "recipe-1", imageUrl: "/uploads/dinner.jpg" }))
      .toBe("/uploads/dinner.jpg");
  });

  test("uses the deterministic fallback for unsafe or invalid URLs", () => {
    const fallback = getRecipeImageFallbackUrl("recipe-1");
    expect(getRecipeImageUrl({ id: "recipe-1", imageUrl: "javascript:alert(1)" })).toBe(fallback);
    expect(getRecipeImageUrl({ id: "recipe-1", imageUrl: "not a URL" })).toBe(fallback);
    expect(getRecipeImageUrl({ id: "recipe-1", imageUrl: "//images.example.com/dinner.jpg" })).toBe(fallback);
  });

  test("uses the same URL policy for authoring and display", () => {
    expect(getSupportedRecipeImageUrl("https://images.example.com/dinner.jpg")).toBe("https://images.example.com/dinner.jpg");
    expect(getSupportedRecipeImageUrl("/uploads/dinner.jpg")).toBe("/uploads/dinner.jpg");
    expect(getSupportedRecipeImageUrl("data:image/png;base64,abc")).toBeNull();
    expect(getSupportedRecipeImageUrl("//images.example.com/dinner.jpg")).toBeNull();
  });
});
