#:sdk Aspire.AppHost.Sdk@13.3.0-preview.1.26118.1
#:package Aspire.Hosting.PostgreSQL@13.3.0-preview.1.26118.1
#:package CommunityToolkit.Aspire.Hosting.Bun@13.1.2-beta.518

using Aspire.Hosting.ApplicationModel;

var builder = DistributedApplication.CreateBuilder(args);

var workosClientId = builder.AddParameter("workos-client-id");
var workosApiKey = builder.AddParameter("workos-api-key", secret: true);
var workosCookiePassword = builder.AddParameter("workos-cookie-password", secret: true);
var workosRedirectUri = builder.AddParameter("workos-redirect-uri");
var githubModelsApiKey = builder.AddParameter("github-models-api-key", secret: true);
var githubModelsModel = builder.AddParameter("github-models-model");
var githubModelsEndpoint = builder.AddParameter("github-models-endpoint");
const int webPort = 57334;

var postgres = builder.AddPostgres("postgres")
    .WithPgAdmin();
var picknicdb = postgres.AddDatabase("picknicdb");

var web = builder.AddBunApp("web", "../web", "dev:aspire")
    .WithHttpEndpoint(port: webPort, targetPort: webPort, isProxied: false, env: "PORT")
    .WithReference(picknicdb)
    .WithEnvironment("WORKOS_CLIENT_ID", workosClientId)
    .WithEnvironment("WORKOS_API_KEY", workosApiKey)
    .WithEnvironment("WORKOS_COOKIE_PASSWORD", workosCookiePassword);

web.WithEnvironment(
        "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
        ReferenceExpression.Create($"http://localhost:57334{workosRedirectUri}"))
    .WithEnvironment("GITHUB_MODELS_API_KEY", githubModelsApiKey)
    .WithEnvironment("GITHUB_MODELS_MODEL", githubModelsModel)
    .WithEnvironment("GITHUB_MODELS_ENDPOINT", githubModelsEndpoint)
    .WaitFor(picknicdb);

builder.Build().Run();
