#:package Aspire.Hosting.Docker@13.5.0-preview.1.26365.1
#:package Aspire.Hosting.JavaScript@13.5.0-preview.1.26365.1
#:sdk Aspire.AppHost.Sdk@13.5.0-preview.1.26365.1
#:package Aspire.Hosting.PostgreSQL@13.5.0-preview.1.26365.1
#:package CommunityToolkit.Aspire.Hosting.Bun@13.1.2-beta.518
#:package Npgsql@10.0.3
// Npgsql@10.0.3 fixes a bug that prevents aspire from reading health of the postgres container.

var builder = DistributedApplication.CreateBuilder(args);

var compose = builder.AddDockerComposeEnvironment("picknic")
    .WithDashboard(enabled: false);

var aiModel = builder.AddParameter("ai-model", "gpt-5.6-luna", publishValueAsDefault: true);
var aiApiKey = builder.AddParameter("ai-api-key", "picknic-local-ai", publishValueAsDefault: true);

var aiProxy = builder.AddDockerfile("ai-proxy", "cliproxyapi")
    .WithHttpEndpoint(targetPort: 8317, name: "http")
    .WithHttpHealthCheck("/healthz", endpointName: "http")
    .WithVolume("picknic-cliproxy-auth", "/root/.cli-proxy-api")
    .PublishAsDockerComposeService((_, service) => service.Restart = "unless-stopped");

var aiBaseUrl = ReferenceExpression.Create($"{aiProxy.GetEndpoint("http")}/v1");

var workosClientId = builder.AddParameter("workos-client-id");
var workosApiKey = builder.AddParameter("workos-api-key", secret: true);
var workosCookiePassword = builder.AddParameter("workos-cookie-password", secret: true);
var workosRedirectUri = builder.AddParameter("workos-redirect-uri");

var postgres = builder.AddPostgres("postgres")
    .WithLifetime(ContainerLifetime.Persistent)
    .WithDataVolume("picknic-postgres")
    .PublishAsDockerComposeService((_, service) => service.Restart = "unless-stopped");
if (builder.ExecutionContext.IsRunMode) {
    postgres.WithContainerName("picknic-postgres");
}
// Optionally, add pgAdmin for database management (runs in a separate container)
// var pgAdmin = postgres.WithPgAdmin();

var picknicdb = postgres.AddDatabase("picknicdb");

#pragma warning disable ASPIREJAVASCRIPT001
var migrations = builder.AddJavaScriptApp("migrations", "../web", "prisma:migrate:deploy")
    .WithBun()
    .WithReference(picknicdb)
    .WaitFor(picknicdb)
    .PublishAsDockerFile(container =>
    {
        container.WithBuildArg("FINAL_STAGE", "migrations")
            .WithEntrypoint("bun")
            .WithArgs("run", "prisma:migrate:deploy");
    });

var web = builder.AddNextJsApp("web", "../web")
    .WithHttpEndpoint(port: 5333, env: "PORT")
    .WithHttpHealthCheck("/", endpointName: "http")
    .WithOtlpExporter()
    .WithBun(install: false)
    .WithExternalHttpEndpoints()
    .PublishAsDockerComposeService((_, service) => service.Restart = "unless-stopped")
    .WithReference(picknicdb)
    .WithEnvironment("AI_BASE_URL", aiBaseUrl)
    .WithEnvironment("AI_API_KEY", aiApiKey)
    .WithEnvironment("AI_MODEL", aiModel)
    .WithEnvironment("WORKOS_CLIENT_ID", workosClientId)
    .WithEnvironment("WORKOS_API_KEY", workosApiKey)
    .WithEnvironment("WORKOS_COOKIE_PASSWORD", workosCookiePassword)
    .WithEnvironment("NEXT_PUBLIC_WORKOS_REDIRECT_URI", workosRedirectUri)
    .WaitFor(aiProxy)
    .WaitForCompletion(migrations);

#pragma warning restore ASPIREJAVASCRIPT001

if (builder.ExecutionContext.IsPublishMode &&
    builder.TryCreateResourceBuilder<ContainerResource>("web", out var webContainer))
{
    webContainer.WithBuildArg("NEXT_PUBLIC_WORKOS_REDIRECT_URI", workosRedirectUri);
}

builder.Build().Run();
