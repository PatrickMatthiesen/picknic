import { logs, SeverityNumber } from "@opentelemetry/api-logs";

type AiLogLevel = "info" | "warn" | "error";
type AiLogAttributes = Record<string, string | number | boolean>;

const severity = {
  info: { number: SeverityNumber.INFO, text: "INFO" },
  warn: { number: SeverityNumber.WARN, text: "WARN" },
  error: { number: SeverityNumber.ERROR, text: "ERROR" },
} as const;

export function logAiEvent(
  level: AiLogLevel,
  body: string,
  attributes: AiLogAttributes,
): void {
  const selectedSeverity = severity[level];
  logs.getLogger("picknic.recipe-parser").emit({
    severityNumber: selectedSeverity.number,
    severityText: selectedSeverity.text,
    body,
    attributes,
  });
  console[level](`[ai] ${body}`, attributes);
}
