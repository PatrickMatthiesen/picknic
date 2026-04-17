import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
let prismaClient: PrismaClient | undefined;

function getAspireConnectionStringFromParts() {
  const host = process.env.PICKNICDB_HOST;
  const port = process.env.PICKNICDB_PORT;
  const username = process.env.PICKNICDB_USERNAME;
  const password = process.env.PICKNICDB_PASSWORD;
  const database = process.env.PICKNICDB_DATABASENAME;

  if (!host || !port || !username || !password || !database) {
    return undefined;
  }

  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=public`;
}

function getConnectionString() {
  return (
    process.env.PICKNICDB_URI ??
    getAspireConnectionStringFromParts() ??
    process.env.ConnectionStrings__picknicdb ??
    process.env.DATABASE_URL
  );
}

function getPrismaClient() {
  if (prismaClient) {
    return prismaClient;
  }

  const connectionString = getConnectionString();

  if (!connectionString) {
    const envVars = {
      PICKNICDB_URI: process.env.PICKNICDB_URI ?? "",
      PICKNICDB_HOST: process.env.PICKNICDB_HOST ?? "",
      PICKNICDB_PORT: process.env.PICKNICDB_PORT ?? "",
      PICKNICDB_USERNAME: process.env.PICKNICDB_USERNAME ?? "",
      PICKNICDB_PASSWORD: process.env.PICKNICDB_PASSWORD ?? "",
      PICKNICDB_DATABASENAME: process.env.PICKNICDB_DATABASENAME ?? "",
      ConnectionStrings__picknicdb: process.env.ConnectionStrings__picknicdb ?? "",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
    };
    throw new Error(`ConnectionStrings__picknicdb or DATABASE_URL must be set. ${JSON.stringify(envVars, null, 2)}`);
  }

  const adapter = new PrismaPg({ connectionString });
  prismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaClient;
  }

  return prismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
