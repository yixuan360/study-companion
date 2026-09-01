import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@/generated/prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Normalize to an absolute file URL so Prisma Client can locate the SQLite
// file regardless of the runtime working directory.
const dbPath = join(__dirname, "..", "..", "prisma", "dev.db").replace(
  /\\/g,
  "/"
);
process.env.DATABASE_URL = `file:${dbPath}`;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
