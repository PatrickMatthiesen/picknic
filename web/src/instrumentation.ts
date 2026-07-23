export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [
    { registerOTel },
    { OTLPTraceExporter },
    { OTLPLogExporter },
    { BatchLogRecordProcessor },
    { logs, SeverityNumber },
  ] = await Promise.all([
    import("@vercel/otel"),
    import("@opentelemetry/exporter-trace-otlp-grpc"),
    import("@opentelemetry/exporter-logs-otlp-grpc"),
    import("@opentelemetry/sdk-logs"),
    import("@opentelemetry/api-logs"),
  ]);
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "web",
    spanProcessors: [],
    traceExporter: new OTLPTraceExporter(),
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
    ],
  });
  logs.getLogger("picknic.instrumentation").emit({
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
    body: "OpenTelemetry initialized",
    attributes: {
      "telemetry.traces": true,
      "telemetry.logs": true,
    },
  });
  console.info("[otel] OpenTelemetry initialized");
}
