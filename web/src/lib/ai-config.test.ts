import { describe, expect, test } from "bun:test";
import { hasUsableAiRecipeModel, resolveAiRecipeImportStatus } from "./ai-config";

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

  test("surfaces the model that selection will actually use", () => {
    expect(resolveAiRecipeImportStatus("gpt-5.6-luna", [
      "gpt-image-2",
      "gpt-5.6-luna",
      "gpt-5.5-mini",
    ])).toEqual({ available: true, model: "gpt-5.6-luna" });

    expect(resolveAiRecipeImportStatus("removed-model", [
      "gpt-5.5-mini",
      "gpt-5.4-mini",
    ])).toEqual({ available: true, model: "gpt-5.5-mini" });
  });
});
