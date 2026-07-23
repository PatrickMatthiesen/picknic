import { describe, expect, test } from "bun:test";
import { selectAvailableAiModel } from "./ai-model";

describe("AI model selection", () => {
  test("keeps the configured model when it is available", () => {
    expect(
      selectAvailableAiModel("gpt-5.4-mini", ["gpt-5.5-mini", "gpt-5.4-mini"]),
    ).toBe("gpt-5.4-mini");
  });

  test("selects the newest small GPT model when the configured model disappears", () => {
    expect(
      selectAvailableAiModel("gpt-5.4-mini", [
        "gpt-5.3-mini",
        "gpt-5.5",
        "gpt-5.5-mini",
        "gpt-image-2",
      ]),
    ).toBe("gpt-5.5-mini");
  });

  test("falls back to the newest text GPT model when no small model exists", () => {
    expect(
      selectAvailableAiModel("retired-model", ["gpt-5.4", "gpt-5.6", "gpt-5.5"]),
    ).toBe("gpt-5.6");
  });

  test("uses a deterministic non-media fallback for other providers", () => {
    expect(
      selectAvailableAiModel("retired-model", ["zeta-chat", "audio-preview", "alpha-chat"]),
    ).toBe("alpha-chat");
  });

  test("returns null when the proxy exposes no usable models", () => {
    expect(selectAvailableAiModel("gpt-5.4-mini", ["gpt-image-2", "audio-preview"])).toBeNull();
  });
});
