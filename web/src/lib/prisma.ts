import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
const connectionString =
  process.env.ConnectionStrings__picknicdb ?? process.env.PICKNICDB_URI ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or ConnectionStrings__picknicdb must be set.");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
