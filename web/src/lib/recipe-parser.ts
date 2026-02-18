export type ParsedRecipeDraft = {
  title: string;
  description: string;
  servings: number;
  tags: string[];
  ingredients: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
  }>;
  steps: string[];
};

type GitHubModelsResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Parser returned empty content.");
  }

  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    return JSON.parse(withoutFence);
  }

  return JSON.parse(trimmed);
}

function normalizeDraft(value: unknown): ParsedRecipeDraft {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const ingredients = Array.isArray(record.ingredients) ? record.ingredients : [];
  const steps = Array.isArray(record.steps) ? record.steps : [];
  const tags = Array.isArray(record.tags) ? record.tags : [];
  const servingsRaw = typeof record.servings === "number" || typeof record.servings === "string" ? Number(record.servings) : 1;

  return {
    title: typeof record.title === "string" ? record.title.trim() : "",
    description: typeof record.description === "string" ? record.description.trim() : "",
    servings: Number.isFinite(servingsRaw) && servingsRaw > 0 ? Math.max(1, Math.floor(servingsRaw)) : 1,
    tags: tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    ingredients: ingredients
      .filter((ingredient): ingredient is Record<string, unknown> => typeof ingredient === "object" && ingredient !== null)
      .map((ingredient) => {
        const quantityRaw =
          typeof ingredient.quantity === "number" || typeof ingredient.quantity === "string" ? Number(ingredient.quantity) : null;

        return {
          name: typeof ingredient.name === "string" ? ingredient.name.trim() : "",
          quantity: quantityRaw !== null && Number.isFinite(quantityRaw) ? quantityRaw : null,
          unit: typeof ingredient.unit === "string" && ingredient.unit.trim() ? ingredient.unit.trim() : null,
        };
      })
      .filter((ingredient) => ingredient.name.length > 0),
    steps: steps
      .filter((step): step is string => typeof step === "string")
      .map((step) => step.trim())
      .filter((step) => step.length > 0),
  };
}

export async function parseRecipeWithGitHubModels(rawText: string): Promise<ParsedRecipeDraft> {
  const apiKey = process.env.GITHUB_MODELS_API_KEY ?? process.env.GITHUB_TOKEN;
  if (!apiKey) {
    throw new Error("GITHUB_MODELS_API_KEY (or GITHUB_TOKEN) is required to use recipe parsing.");
  }

  const endpoint = process.env.GITHUB_MODELS_ENDPOINT ?? "https://models.inference.ai.azure.com/chat/completions";
  const model = process.env.GITHUB_MODELS_MODEL ?? "openai/gpt-4.1-mini";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract recipes into strict JSON with keys: title (string), description (string), servings (number), tags (string[]), ingredients ({name, quantity, unit}[]), steps (string[]). Return only JSON.",
        },
        {
          role: "user",
          content: rawText,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub Models request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as GitHubModelsResponse;
  const content = payload.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  return normalizeDraft(parsed);
}
