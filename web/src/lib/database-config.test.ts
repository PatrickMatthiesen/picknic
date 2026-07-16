import { afterEach, describe, expect, test } from "bun:test";
import { getConnectionString } from "@/lib/database-config";

const databaseVariables = [
  "PICKNICDB_URI",
  "PICKNICDB_HOST",
  "PICKNICDB_PORT",
  "PICKNICDB_USERNAME",
  "PICKNICDB_PASSWORD",
  "PICKNICDB_DATABASENAME",
  "ConnectionStrings__picknicdb",
  "DATABASE_URL",
] as const;

const originalValues = new Map(databaseVariables.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of databaseVariables) {
    const value = originalValues.get(name);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

function clearDatabaseEnvironment() {
  for (const name of databaseVariables) {
    delete process.env[name];
  }
}

describe("database connection configuration", () => {
  test("prefers the Aspire URI over fallback connection strings", () => {
    clearDatabaseEnvironment();
    process.env.PICKNICDB_URI = "postgresql://aspire.example/picknic";
    process.env.ConnectionStrings__picknicdb = "postgresql://connection-string/picknic";
    process.env.DATABASE_URL = "postgresql://fallback/picknic";

    expect(getConnectionString()).toBe("postgresql://aspire.example/picknic");
  });

  test("uses IPv4 for local Aspire database URLs", () => {
    clearDatabaseEnvironment();
    process.env.PICKNICDB_URI = "postgresql://postgres:secret@localhost:5432/picknic";

    expect(getConnectionString()).toBe(
      "postgresql://postgres:secret@127.0.0.1:5432/picknic",
    );
  });

  test("builds and escapes a connection string from Aspire resource variables", () => {
    clearDatabaseEnvironment();
    process.env.PICKNICDB_HOST = "localhost";
    process.env.PICKNICDB_PORT = "5432";
    process.env.PICKNICDB_USERNAME = "pick nic";
    process.env.PICKNICDB_PASSWORD = "secret/value";
    process.env.PICKNICDB_DATABASENAME = "picknic";

    expect(getConnectionString()).toBe(
      "postgresql://pick%20nic:secret%2Fvalue@127.0.0.1:5432/picknic?schema=public",
    );
  });

  test("returns undefined when no complete database configuration exists", () => {
    clearDatabaseEnvironment();
    process.env.PICKNICDB_HOST = "localhost";

    expect(getConnectionString()).toBeUndefined();
  });
});
