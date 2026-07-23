import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import OpenAI from "openai";
import { selectAvailableAiModel } from "@/lib/ai-model";
import { logAiEvent } from "@/lib/ai-telemetry";

export type ParsedRecipeDraft = {
  title: string;
  description: string;
  notes: string;
  servings: number;
  totalTimeMinutes: number | null;
  tags: string[];
  measurementSystem: "metric" | "us" | null;
  imageUrl: string | null;
  ingredientComponents: Array<{
    name: string | null;
    ingredients: Array<{
      name: string;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
    }>;
  }>;
  instructionComponents: Array<{
    name: string | null;
    steps: Array<{
      instruction: string;
      durationMinutes: number | null;
      advanceNotice: boolean;
    }>;
  }>;
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

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalMinutes(value: unknown): number | null {
  const minutes = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 10_080 ? Math.floor(minutes) : null;
}

export function normalizeParsedRecipeDraft(value: unknown): ParsedRecipeDraft {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const ingredientComponents = Array.isArray(record.ingredientComponents) ? record.ingredientComponents : [];
  const instructionComponents = Array.isArray(record.instructionComponents) ? record.instructionComponents : [];
  const tags = Array.isArray(record.tags) ? record.tags : [];
  const servingsRaw = typeof record.servings === "number" || typeof record.servings === "string" ? Number(record.servings) : 1;

  return {
    title: typeof record.title === "string" ? record.title.trim() : "",
    description: typeof record.description === "string" ? record.description.trim() : "",
    notes: typeof record.notes === "string" ? record.notes.trim() : "",
    servings: Number.isFinite(servingsRaw) && servingsRaw > 0 ? Math.max(1, Math.floor(servingsRaw)) : 1,
    totalTimeMinutes: optionalMinutes(record.totalTimeMinutes),
    tags: tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    measurementSystem: record.measurementSystem === "metric" || record.measurementSystem === "us"
      ? record.measurementSystem
      : null,
    imageUrl: optionalText(record.imageUrl),
    ingredientComponents: ingredientComponents
      .filter((component): component is Record<string, unknown> => typeof component === "object" && component !== null)
      .map((component) => ({
        name: optionalText(component.name),
        ingredients: (Array.isArray(component.ingredients) ? component.ingredients : [])
          .filter((ingredient): ingredient is Record<string, unknown> => typeof ingredient === "object" && ingredient !== null)
          .map((ingredient) => {
            const quantityRaw =
              typeof ingredient.quantity === "number" || typeof ingredient.quantity === "string" ? Number(ingredient.quantity) : null;
            return {
              name: typeof ingredient.name === "string" ? ingredient.name.trim() : "",
              quantity: quantityRaw !== null && Number.isFinite(quantityRaw) ? quantityRaw : null,
              unit: optionalText(ingredient.unit),
              notes: optionalText(ingredient.notes),
            };
          })
          .filter((ingredient) => ingredient.name.length > 0),
      }))
      .filter((component) => component.ingredients.length > 0),
    instructionComponents: instructionComponents
      .filter((component): component is Record<string, unknown> => typeof component === "object" && component !== null)
      .map((component) => ({
        name: optionalText(component.name),
        steps: (Array.isArray(component.steps) ? component.steps : [])
          .filter((step): step is Record<string, unknown> => typeof step === "object" && step !== null)
          .map((step) => ({
            instruction: typeof step.instruction === "string" ? step.instruction.trim() : "",
            durationMinutes: optionalMinutes(step.durationMinutes),
            advanceNotice: step.advanceNotice === true,
          }))
          .filter((step) => step.instruction.length > 0),
      }))
      .filter((component) => component.steps.length > 0),
  };
}

function resolveBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const chatCompletionsSuffix = "/chat/completions";
  return trimmed.endsWith(chatCompletionsSuffix)
    ? trimmed.slice(0, trimmed.length - chatCompletionsSuffix.length)
    : trimmed;
}

export const recipeResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "recipe",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        notes: { type: "string" },
        servings: { type: "integer" },
        totalTimeMinutes: {
          anyOf: [{ type: "integer" }, { type: "null" }],
        },
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
        imageUrl: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
        ingredientComponents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                anyOf: [{ type: "string" }, { type: "null" }],
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
                    notes: {
                      anyOf: [{ type: "string" }, { type: "null" }],
                    },
                  },
                  required: ["name", "quantity", "unit", "notes"],
                  additionalProperties: false,
                },
              },
            },
            required: ["name", "ingredients"],
            additionalProperties: false,
          },
        },
        instructionComponents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    instruction: { type: "string" },
                    durationMinutes: {
                      anyOf: [{ type: "integer" }, { type: "null" }],
                    },
                    advanceNotice: { type: "boolean" },
                  },
                  required: ["instruction", "durationMinutes", "advanceNotice"],
                  additionalProperties: false,
                },
              },
            },
            required: ["name", "steps"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "title",
        "description",
        "notes",
        "servings",
        "totalTimeMinutes",
        "tags",
        "measurementSystem",
        "imageUrl",
        "ingredientComponents",
        "instructionComponents",
      ],
      additionalProperties: false,
    },
  },
} as const;

export const RECIPE_EXTRACTION_INSTRUCTIONS = [
  "Extract the pasted recipe into the supplied strict JSON schema.",
  "Preserve written quantities and units; do not convert measurement systems.",
  "Preserve named ingredient and instruction groups as components instead of prefixing their names into rows.",
  "Put preparation qualifiers that belong to one ingredient (for example finely chopped, divided, or room temperature) in that ingredient's notes.",
  "Put general serving, substitution, storage, or variation notes in the recipe-level notes field, never as an instruction.",
  "Use a step duration only when the source explicitly states timing. Sum sequential timed phases within one step, use the upper bound of a time range, and do not estimate untimed work.",
  "Set advanceNotice true only when a step materially needs to happen ahead of normal active cooking, such as overnight marinating, long chilling, proofing, or advance preparation.",
  "Use the source's explicit total time when present. When total is absent but explicit top-level prep and cook times are both present, add those top-level values. Otherwise use null; never derive total by summing recipe steps because they may overlap.",
  "Only return imageUrl when an image URL is explicitly present in the source; otherwise use null.",
  "Do not invent missing recipe facts. Return only JSON.",
].join(" ");

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
    const preferredModel = process.env.AI_MODEL ?? "gpt-5.6-luna";
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
                content: RECIPE_EXTRACTION_INSTRUCTIONS,
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
      const parsed = normalizeParsedRecipeDraft(extractJson(content));
      const durationMs = elapsedMilliseconds(startedAt);
      span.setAttributes({
        "recipe.ingredient_count": parsed.ingredientComponents.reduce((count, component) => count + component.ingredients.length, 0),
        "recipe.step_count": parsed.instructionComponents.reduce((count, component) => count + component.steps.length, 0),
        "recipe.parse.duration_ms": durationMs,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      logAiEvent("info", "Recipe parsed", {
        model,
        gateway: host,
        durationMs,
        ingredientCount: parsed.ingredientComponents.reduce((count, component) => count + component.ingredients.length, 0),
        stepCount: parsed.instructionComponents.reduce((count, component) => count + component.steps.length, 0),
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
