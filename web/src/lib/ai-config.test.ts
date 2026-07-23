import { describe, expect, test } from "bun:test";
import { hasUsableAiRecipeModel } from "./ai-config";

describe("AI recipe import configuration", () => {
  test("is available when the proxy exposes a usable text model", () => {
    expect(hasUsableAiRecipeModel("gpt-5.6-luna", [
      "gpt-image-2",
      "gpt-5.6-luna",
    ])).toBe(true);
  });

  test("is unavailable when the proxy exposes no usable text models", () => {
    expect(hasUsableAiRecipeModel("gpt-5.6-luna", [
      "gpt-image-2",
      "tts-1",
    ])).toBe(false);
  });
});
