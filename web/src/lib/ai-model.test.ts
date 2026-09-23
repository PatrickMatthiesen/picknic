import { describe, expect, test } from "bun:test";
import { getAvailableApprovedModels, selectAvailableAiModel } from "./ai-model";

describe("AI model selection", () => {
  test("uses the requested model when it is available", () => {
    expect(selectAvailableAiModel("gpt-5.6-luna", ["gpt-6-astra", "gpt-5.6-luna"])).toBe("gpt-5.6-luna");
  });
  test("never silently falls back to another model", () => {
    expect(selectAvailableAiModel("missing-model", ["gpt-5.4-mini", "gpt-6-astra"])).toBeNull();
  });
  test("offers only approved models present in the provider catalog", () => {
    expect(getAvailableApprovedModels(["gpt-5.6-luna", "gpt-5.4-mini", "missing"], ["gpt-6-astra", "gpt-5.4-mini", "gpt-5.6-luna"])).toEqual(["gpt-5.6-luna", "gpt-5.4-mini"]);
  });
  test("does not offer non-text models or duplicate choices", () => {
    expect(getAvailableApprovedModels(["gpt-image-2", "gpt-5.6-luna", "gpt-5.6-luna"], ["gpt-image-2", "gpt-5.6-luna"])).toEqual(["gpt-5.6-luna"]);
  });
});
