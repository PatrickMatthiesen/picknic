import { selectAvailableAiModel } from "@/lib/ai-model";

type ModelCatalog = {
  data?: Array<{ id?: unknown }>;
};

type AvailabilityCache = {
  expiresAt: number;
  signature: string;
  value: AiRecipeImportStatus;
};

export type AiRecipeImportStatus = {
  available: boolean;
  model: string | null;
};

const availabilityCacheDurationMs = 30_000;
let availabilityCache: AvailabilityCache | null = null;

function resolveBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const chatCompletionsSuffix = "/chat/completions";
  return trimmed.endsWith(chatCompletionsSuffix)
    ? trimmed.slice(0, trimmed.length - chatCompletionsSuffix.length)
    : trimmed;
}

export function hasUsableAiRecipeModel(
  preferredModel: string,
  modelIds: string[],
): boolean {
  return resolveAiRecipeImportStatus(preferredModel, modelIds).available;
}

export function resolveAiRecipeImportStatus(
  preferredModel: string,
  modelIds: string[],
): AiRecipeImportStatus {
  const model = selectAvailableAiModel(preferredModel, modelIds);
  return { available: model !== null, model };
}

export async function getAiRecipeImportStatus(): Promise<AiRecipeImportStatus> {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) return { available: false, model: null };

  const endpoint = resolveBaseUrl(process.env.AI_BASE_URL ?? "http://localhost:8317/v1");
  const preferredModel = process.env.AI_MODEL ?? "gpt-5.6-luna";
  const signature = `${endpoint}|${preferredModel}`;
  const now = Date.now();
  if (
    availabilityCache
    && availabilityCache.signature === signature
    && availabilityCache.expiresAt > now
  ) {
    return availabilityCache.value;
  }

  let model: string | null = null;
  try {
    const response = await fetch(`${endpoint}/models`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(2_000),
    });
    if (response.ok) {
      const catalog = (await response.json()) as ModelCatalog;
      const modelIds = (catalog.data ?? [])
        .map((model) => model.id)
        .filter((id): id is string => typeof id === "string");
      model = resolveAiRecipeImportStatus(preferredModel, modelIds).model;
    }
  } catch {
    model = null;
  }

  const value = { available: model !== null, model };
  availabilityCache = {
    expiresAt: now + availabilityCacheDurationMs,
    signature,
    value,
  };
  return value;
}

export async function isAiRecipeImportAvailable(): Promise<boolean> {
  return (await getAiRecipeImportStatus()).available;
}
