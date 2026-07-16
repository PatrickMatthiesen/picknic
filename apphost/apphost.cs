#:package Aspire.Hosting.Docker@13.5.0-preview.1.26365.1
#:package Aspire.Hosting.JavaScript@13.5.0-preview.1.26365.1
#:sdk Aspire.AppHost.Sdk@13.5.0-preview.1.26365.1
#:package Aspire.Hosting.PostgreSQL@13.5.0-preview.1.26365.1
#:package CommunityToolkit.Aspire.Hosting.Bun@13.1.2-beta.518
#:package Npgsql@10.0.3
// Npgsql@10.0.3 fixes a bug that prevents aspire from reading health of the postgres container.

using Microsoft.Extensions.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

var compose = builder.AddDockerComposeEnvironment("picknic");

var githubModelsModel = builder.AddParameter("github-models-model", "openai/gpt-5-mini");
var githubModelsEndpoint = builder.AddParameter("github-models-endpoint");

var postgres = builder.AddPostgres("postgres")
    .WithLifetime(ContainerLifetime.Persistent)
    .WithDataVolume("picknic-postgres");
if (builder.ExecutionContext.IsRunMode) {
    postgres.WithContainerName("picknic-postgres");
}
// Optionally, add pgAdmin for database management (runs in a separate container)
// var pgAdmin = postgres.WithPgAdmin();

var picknicdb = postgres.AddDatabase("picknicdb");

#pragma warning disable ASPIREJAVASCRIPT001
var web = builder.AddNextJsApp("web", "../web", "dev:aspire")
    .WithHttpEndpoint(port: 5333, env: "PORT")
    .WithHttpHealthCheck("/", endpointName: "http")
    .WithBun()
    .WithExternalHttpEndpoints()
    .WithReference(picknicdb)
    .WithEnvironment("GITHUB_MODELS_MODEL", githubModelsModel)
    .WithEnvironment("GITHUB_MODELS_ENDPOINT", githubModelsEndpoint)
    .WaitFor(picknicdb);
#pragma warning restore ASPIREJAVASCRIPT001

if (!builder.Environment.IsDevelopment())
{
    var workosClientId = builder.AddParameter("workos-client-id");
    var workosApiKey = builder.AddParameter("workos-api-key", secret: true);
    var workosCookiePassword = builder.AddParameter("workos-cookie-password", secret: true);
    var workosRedirectUri = builder.AddParameter("workos-redirect-uri", "/callback");
    var githubModelsApiKey = builder.AddParameter("github-models-api-key", secret: true);

    web.WithEnvironment("WORKOS_CLIENT_ID", workosClientId)
        .WithEnvironment("WORKOS_API_KEY", workosApiKey)
        .WithEnvironment("WORKOS_COOKIE_PASSWORD", workosCookiePassword)
        .WithEnvironment("GITHUB_MODELS_API_KEY", githubModelsApiKey)
        .WithEnvironment("NEXT_PUBLIC_WORKOS_REDIRECT_URI",
            ReferenceExpression.Create($"{web.GetEndpoint("http")}{workosRedirectUri}"));
}

builder.Build().Run();
