import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

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

const connectionString =
  process.env.PICKNICDB_URI ??
  getAspireConnectionStringFromParts() ??
  process.env.ConnectionStrings__picknicdb ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or ConnectionStrings__picknicdb must be set.");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
