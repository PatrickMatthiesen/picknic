function getTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeLocalDatabaseHost(connectionString: string) {
  try {
    const url = new URL(connectionString);

    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
    }

    return url.toString();
  } catch {
    return connectionString;
  }
}

export function getAspireConnectionStringFromParts() {
  const host = getTrimmedEnv("PICKNICDB_HOST");
  const port = getTrimmedEnv("PICKNICDB_PORT");
  const username = getTrimmedEnv("PICKNICDB_USERNAME");
  const password = getTrimmedEnv("PICKNICDB_PASSWORD");
  const database = getTrimmedEnv("PICKNICDB_DATABASENAME");

  if (!host || !port || !username || !password || !database) {
    return undefined;
  }

  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=public`;
}

export function getConnectionString() {
  const connectionString =
    getTrimmedEnv("PICKNICDB_URI") ??
    getAspireConnectionStringFromParts() ??
    getTrimmedEnv("ConnectionStrings__picknicdb") ??
    getTrimmedEnv("DATABASE_URL");

  return connectionString ? normalizeLocalDatabaseHost(connectionString) : undefined;
}
