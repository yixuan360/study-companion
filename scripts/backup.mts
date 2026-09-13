import { mkdir, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prisma } from "../src/lib/db";
import { pickBackupsToDelete } from "./backup-lib.mts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = join(ROOT, "backups");

/**
 * 用 SQLite 原生 VACUUM INTO 做在线备份（WAL 下安全），
 * 输出 backups/dev-YYYYMMDD-HHmm.db，只保留最近 14 份。
 * 返回备份文件绝对路径。
 */
export async function runBackup(now = new Date()): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;
  const target = join(BACKUP_DIR, `dev-${stamp}.db`).replace(/\\/g, "/");

  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  for (const old of pickBackupsToDelete(await readdir(BACKUP_DIR))) {
    await unlink(join(BACKUP_DIR, old));
  }
  return target;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runBackup()
    .then((p) => {
      console.log(`[backup] 已备份到 ${p}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[backup] 失败:", err);
      process.exit(1);
    });
}
