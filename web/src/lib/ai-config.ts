import { selectAvailableAiModel } from "@/lib/ai-model";

type ModelCatalog = {
  data?: Array<{ id?: unknown }>;
};

type AvailabilityCache = {
  expiresAt: number;
  signature: string;
  value: boolean;
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
  return selectAvailableAiModel(preferredModel, modelIds) !== null;
}

export async function isAiRecipeImportAvailable(): Promise<boolean> {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) return false;

  const endpoint = resolveBaseUrl(process.env.AI_BASE_URL ?? "http://localhost:8317/v1");
  const preferredModel = process.env.AI_MODEL ?? "gpt-5.4-mini";
  const signature = `${endpoint}|${preferredModel}`;
  const now = Date.now();
  if (
    availabilityCache
    && availabilityCache.signature === signature
    && availabilityCache.expiresAt > now
  ) {
    return availabilityCache.value;
  }

  let available = false;
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
      available = hasUsableAiRecipeModel(preferredModel, modelIds);
    }
  } catch {
    available = false;
  }

  availabilityCache = {
    expiresAt: now + availabilityCacheDurationMs,
    signature,
    value: available,
  };
  return available;
}
