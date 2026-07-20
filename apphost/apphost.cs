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

var githubModelsModel = builder.AddParameter("github-models-model", "openai/gpt-5-mini", publishValueAsDefault: true);
var githubModelsEndpoint = builder.AddParameter(
    "github-models-endpoint",
    "https://models.github.ai/inference",
    publishValueAsDefault: true
);

var workosClientId = builder.AddParameter("workos-client-id");
var workosApiKey = builder.AddParameter("workos-api-key", secret: true);
var workosCookiePassword = builder.AddParameter("workos-cookie-password", secret: true);
var workosRedirectUri = builder.AddParameter(
    "workos-redirect-uri",
    "http://localhost:5333/callback"
);

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
    .WithBun(install: false)
    .WithExternalHttpEndpoints()
    .PublishAsDockerComposeService((_, service) => service.Restart = "unless-stopped")
    .WithReference(picknicdb)
    .WithEnvironment("GITHUB_MODELS_MODEL", githubModelsModel)
    .WithEnvironment("GITHUB_MODELS_ENDPOINT", githubModelsEndpoint)
    .WithEnvironment("WORKOS_CLIENT_ID", workosClientId)
    .WithEnvironment("WORKOS_API_KEY", workosApiKey)
    .WithEnvironment("WORKOS_COOKIE_PASSWORD", workosCookiePassword)
    .WithEnvironment("NEXT_PUBLIC_WORKOS_REDIRECT_URI", workosRedirectUri)
    .WaitForCompletion(migrations);

if (!string.IsNullOrWhiteSpace(builder.Configuration["Parameters:github-models-api-key"]))
{
    var githubModelsApiKey = builder.AddParameter("github-models-api-key", secret: true);
    web.WithEnvironment("GITHUB_MODELS_API_KEY", githubModelsApiKey);
}
#pragma warning restore ASPIREJAVASCRIPT001

if (builder.ExecutionContext.IsPublishMode &&
    builder.TryCreateResourceBuilder<ContainerResource>("web", out var webContainer))
{
    webContainer.WithBuildArg("NEXT_PUBLIC_WORKOS_REDIRECT_URI", workosRedirectUri);
}

builder.Build().Run();
