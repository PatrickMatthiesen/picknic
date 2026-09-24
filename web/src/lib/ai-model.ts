const nonTextModelPattern = /(?:image|audio|realtime|transcrib|speech|tts|embedding|moderation|computer-use)/i;

export const DEFAULT_AI_MODEL = "gpt-5.6-luna";
export const MAX_RECIPE_IMPORT_CHARACTERS = 50_000;
export const MAX_RECIPE_IMPORT_OUTPUT_TOKENS = 8_192;

export function getAiModelPolicy() {
  const defaultModel = process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
  // The explicitly configured default is always approved. Extra choices must
  // be deliberately enabled by the deployment owner, never inferred by name.
  const allowedModels = [...new Set([defaultModel, ...(process.env.AI_ALLOWED_MODELS ?? "").split(",")]
    .map((model) => model.trim()).filter(Boolean))];
  return { defaultModel, allowedModels };
}

export function getAvailableApprovedModels(allowedModels: string[], modelIds: string[]): string[] {
  const available = new Set(modelIds);
  return [...new Set(allowedModels.map((model) => model.trim()).filter(Boolean))]
    .filter((model) => available.has(model) && !nonTextModelPattern.test(model));
}

export function selectAvailableAiModel(preferredModel: string, modelIds: string[]): string | null {
  // Never silently fall back: availability does not imply permission or price.
  return getAvailableApprovedModels([preferredModel], modelIds)[0] ?? null;
}
