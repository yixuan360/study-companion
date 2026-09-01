import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use an absolute file URL so Prisma Client can find the SQLite file
// regardless of the current working directory at runtime.
const dbPath = join(__dirname, "prisma", "dev.db").replace(/\\/g, "/");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: `file:${dbPath}`,
  },
});
