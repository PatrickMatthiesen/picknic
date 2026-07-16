import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getConnectionString } from "@/lib/database-config";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
let prismaClient: PrismaClient | undefined;

function getPrismaClient() {
  if (prismaClient) {
    return prismaClient;
  }

  const connectionString = getConnectionString();

  if (!connectionString) {
    throw new Error(
      "A database connection is required. Configure the Aspire picknicdb reference or set DATABASE_URL.",
    );
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
