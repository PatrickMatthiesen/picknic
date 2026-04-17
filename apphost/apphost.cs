#:package Aspire.Hosting.Docker@13.3.0-preview.1.26217.2
#:package Aspire.Hosting.JavaScript@13.3.0-preview.1.26217.2
#:sdk Aspire.AppHost.Sdk@13.3.0-preview.1.26217.2
#:package Aspire.Hosting.PostgreSQL@13.3.0-preview.1.26217.2
#:package CommunityToolkit.Aspire.Hosting.Bun@13.1.2-beta.518

using Microsoft.Extensions.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

var compose = builder.AddDockerComposeEnvironment("picknic")
    .WithDashboard();

var workosClientId = builder.AddParameter("workos-client-id");
var workosApiKey = builder.AddParameter("workos-api-key", secret: true);
var workosCookiePassword = builder.AddParameter("workos-cookie-password", secret: true);
var workosRedirectUri = builder.AddParameter("workos-redirect-uri");
var githubModelsApiKey = builder.AddParameter("github-models-api-key", secret: true);
var githubModelsModel = builder.AddParameter("github-models-model", "openai/gpt-5-mini");
var githubModelsEndpoint = builder.AddParameter("github-models-endpoint");

var postgres = builder.AddPostgres("postgres")
    .WithPgAdmin();
var picknicdb = postgres.AddDatabase("picknicdb");

if (builder.Environment.IsDevelopment())
    postgres.WithContainerName("picknic-postgres");

var web = builder.AddNextJsApp("web", "../web", "dev:aspire")
    .WithHttpEndpoint(env: "PORT")
    .WithBun()
    .WithExternalHttpEndpoints()
    .WithReference(picknicdb)
    .WithEnvironment("WORKOS_CLIENT_ID", workosClientId)
    .WithEnvironment("WORKOS_API_KEY", workosApiKey)
    .WithEnvironment("WORKOS_COOKIE_PASSWORD", workosCookiePassword)
    .WithEnvironment("GITHUB_MODELS_API_KEY", githubModelsApiKey)
    .WithEnvironment("GITHUB_MODELS_MODEL", githubModelsModel)
    .WithEnvironment("GITHUB_MODELS_ENDPOINT", githubModelsEndpoint)
    .WaitFor(picknicdb);

web.WithEnvironment("NEXT_PUBLIC_WORKOS_REDIRECT_URI",
        ReferenceExpression.Create($"{web.GetEndpoint("http")}{workosRedirectUri}")
    );

builder.Build().Run();
