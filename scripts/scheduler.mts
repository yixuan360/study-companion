import "dotenv/config";
import { pathToFileURL } from "node:url";
import { matchesSchedule, type ScheduleEntry } from "./schedule-lib.mts";
import { runBackup } from "./backup.mts";

/**
 * 本地调度器：替代系统 cron，常驻运行，按时刻表触发 cron 端点与本地备份。
 *   npx tsx scripts/scheduler.mts         常驻循环
 *   npx tsx scripts/scheduler.mts --now   所有任务立即各跑一次（调试）
 * 目标地址用 SCHEDULER_BASE_URL 覆盖（默认 http://localhost:3000）。
 * 上云服务器后可弃用本脚本，改用系统 crontab（见 AGENTS.md）。
 */

const BASE_URL = process.env.SCHEDULER_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET ?? "";

interface Task extends ScheduleEntry {
  name: string;
  /** cron 端点路径（不含 secret）；与 backup 二选一 */
  url?: string;
  /** true = 本地执行备份，不走 HTTP */
  backup?: boolean;
}

const TASKS: Task[] = [
  { name: "班级早推送", hour: 8, minute: 0, url: "/api/cron/classroom-push?mode=morning" },
  { name: "班级晚推送", hour: 20, minute: 0, url: "/api/cron/classroom-push?mode=evening" },
  { name: "背诵复习提醒", hour: 20, minute: 30, url: "/api/cron/daily-reminder" },
  { name: "周报自动生成", hour: 21, minute: 0, weekday: 0, url: "/api/cron/weekly-review" },
  { name: "数据库备份", hour: 3, minute: 30, backup: true },
];

async function runTask(task: Task): Promise<void> {
  const started = new Date().toLocaleString("zh-CN");
  try {
    if (task.backup) {
      const path = await runBackup();
      console.log(`[scheduler] ${started} ${task.name} ✓ ${path}`);
      return;
    }
    const sep = task.url!.includes("?") ? "&" : "?";
    const res = await fetch(`${BASE_URL}${task.url}${sep}secret=${encodeURIComponent(SECRET)}`);
    const body = (await res.json()) as { code: number; msg: string };
    const mark = body.code === 0 ? "✓" : "✗";
    console.log(`[scheduler] ${started} ${task.name} ${mark} code=${body.code} ${body.msg}`);
  } catch (err) {
    console.error(`[scheduler] ${started} ${task.name} ✗`, err instanceof Error ? err.message : err);
  }
}

function minuteKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
}

async function main(): Promise<void> {
  if (process.argv.includes("--now")) {
    console.log("[scheduler] --now：立即执行全部任务");
    for (const task of TASKS) {
      await runTask(task);
    }
    return;
  }

  if (!SECRET) {
    console.warn("[scheduler] 警告：CRON_SECRET 未配置，HTTP 任务会 401");
  }
  console.log(`[scheduler] 已启动，目标 ${BASE_URL}，任务 ${TASKS.length} 项`);
  for (const t of TASKS) {
    const day = t.weekday === undefined ? "每天" : `周${"日一二三四五六"[t.weekday]}`;
    console.log(`  - ${day} ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")} ${t.name}`);
  }

  let lastFired = "";
  setInterval(() => {
    const now = new Date();
    const key = minuteKey(now);
    if (key === lastFired) return;
    const due = TASKS.filter((t) => matchesSchedule(t, now));
    if (due.length === 0) return;
    lastFired = key;
    for (const task of due) {
      void runTask(task);
    }
  }, 15_000);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  void main();
}
