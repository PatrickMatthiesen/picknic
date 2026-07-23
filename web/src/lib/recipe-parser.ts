import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import OpenAI from "openai";
import { selectAvailableAiModel } from "@/lib/ai-model";
import { logAiEvent } from "@/lib/ai-telemetry";

export type ParsedRecipeDraft = {
  title: string;
  description: string;
  servings: number;
  tags: string[];
  measurementSystem: "metric" | "us" | null;
  ingredients: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
  }>;
  steps: string[];
};

export class RecipeParserNotConfiguredError extends Error {
  constructor(message = "AI recipe import is not configured for this environment.") {
    super(message);
    this.name = "RecipeParserNotConfiguredError";
  }
}

const tracer = trace.getTracer("picknic.recipe-parser");

function elapsedMilliseconds(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(resolveBaseUrl(endpoint)).host;
  } catch {
    return "invalid";
  }
}

function recordSpanError(span: Span, error: unknown): void {
  const exception = error instanceof Error ? error : new Error(String(error));
  span.recordException(exception);
  span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
}

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
    measurementSystem: record.measurementSystem === "metric" || record.measurementSystem === "us"
      ? record.measurementSystem
      : null,
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

function resolveBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const chatCompletionsSuffix = "/chat/completions";
  return trimmed.endsWith(chatCompletionsSuffix)
    ? trimmed.slice(0, trimmed.length - chatCompletionsSuffix.length)
    : trimmed;
}

const recipeResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "recipe",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        servings: { type: "number" },
        tags: {
          type: "array",
          items: { type: "string" },
        },
        measurementSystem: {
          anyOf: [
            { type: "string", enum: ["metric", "us"] },
            { type: "null" },
          ],
        },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: {
                anyOf: [{ type: "number" }, { type: "null" }],
              },
              unit: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
            },
            required: ["name", "quantity", "unit"],
            additionalProperties: false,
          },
        },
        steps: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "title",
        "description",
        "servings",
        "tags",
        "measurementSystem",
        "ingredients",
        "steps",
      ],
      additionalProperties: false,
    },
  },
} as const;

async function resolveModel(client: OpenAI, preferredModel: string): Promise<string> {
  return tracer.startActiveSpan("ai.models.list", async (span) => {
    const startedAt = performance.now();
    span.setAttribute("ai.preferred_model", preferredModel);

    try {
      const availableModels = await client.models.list();
      const model = selectAvailableAiModel(
        preferredModel,
        availableModels.data.map((entry) => entry.id),
      );
      if (!model) {
        throw new RecipeParserNotConfiguredError(
          "The AI proxy has no available text models. Complete provider login and try again.",
        );
      }

      const durationMs = elapsedMilliseconds(startedAt);
      span.setAttributes({
        "ai.available_model_count": availableModels.data.length,
        "ai.selected_model": model,
        "ai.duration_ms": durationMs,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      logAiEvent("info", "Model selected", {
        preferredModel,
        selectedModel: model,
        availableModelCount: availableModels.data.length,
        durationMs,
      });

      if (model !== preferredModel) {
        logAiEvent("warn", "Configured AI model unavailable; using fallback", {
          preferredModel,
          selectedModel: model,
        });
      }

      return model;
    } catch (error) {
      recordSpanError(span, error);
      if (error instanceof RecipeParserNotConfiguredError) {
        throw error;
      }

      logAiEvent("warn", "Model discovery failed; using configured preference", {
        preferredModel,
        durationMs: elapsedMilliseconds(startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      return preferredModel;
    } finally {
      span.end();
    }
  });
}

export async function parseRecipeWithAi(rawText: string): Promise<ParsedRecipeDraft> {
  return tracer.startActiveSpan("recipe.parse", async (span) => {
    const startedAt = performance.now();
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      const error = new RecipeParserNotConfiguredError();
      recordSpanError(span, error);
      span.end();
      throw error;
    }

    const endpoint = process.env.AI_BASE_URL ?? "http://localhost:8317/v1";
    const preferredModel = process.env.AI_MODEL ?? "gpt-5.4-mini";
    const host = endpointHost(endpoint);
    span.setAttributes({
      "ai.gateway": host,
      "ai.preferred_model": preferredModel,
      "recipe.input_character_count": rawText.length,
    });

    try {
      const client = new OpenAI({
        apiKey,
        baseURL: resolveBaseUrl(endpoint),
      });
      const model = await resolveModel(client, preferredModel);
      span.setAttribute("ai.selected_model", model);

      const completion = await tracer.startActiveSpan("ai.chat.completion", async (completionSpan) => {
        const completionStartedAt = performance.now();
        completionSpan.setAttributes({
          "ai.gateway": host,
          "ai.model": model,
        });

        try {
          const result = await client.chat.completions.create({
            model,
            response_format: recipeResponseFormat,
            messages: [
              {
                role: "system",
                content:
                  "You extract recipes into strict JSON with keys: title (string), description (string), servings (number), tags (string[]), measurementSystem ('metric' | 'us' | null), ingredients ({name, quantity, unit}[]), steps (string[]). Preserve the recipe's written quantities and units. Return only JSON.",
              },
              {
                role: "user",
                content: rawText,
              },
            ],
          });
          const durationMs = elapsedMilliseconds(completionStartedAt);
          completionSpan.setAttribute("ai.duration_ms", durationMs);
          completionSpan.setStatus({ code: SpanStatusCode.OK });
          logAiEvent("info", "Recipe completion finished", {
            model,
            gateway: host,
            durationMs,
          });
          return result;
        } catch (error) {
          recordSpanError(completionSpan, error);
          throw error;
        } finally {
          completionSpan.end();
        }
      });

      const content = completion.choices[0]?.message?.content ?? "";
      const parsed = normalizeDraft(extractJson(content));
      const durationMs = elapsedMilliseconds(startedAt);
      span.setAttributes({
        "recipe.ingredient_count": parsed.ingredients.length,
        "recipe.step_count": parsed.steps.length,
        "recipe.parse.duration_ms": durationMs,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      logAiEvent("info", "Recipe parsed", {
        model,
        gateway: host,
        durationMs,
        ingredientCount: parsed.ingredients.length,
        stepCount: parsed.steps.length,
      });
      return parsed;
    } catch (error) {
      recordSpanError(span, error);
      logAiEvent("error", "Recipe parsing failed", {
        preferredModel,
        gateway: host,
        durationMs: elapsedMilliseconds(startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
