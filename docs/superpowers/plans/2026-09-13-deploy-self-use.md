# 子项目 1「部署自用包」实施计划

> **For agentic workers:** implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 app 以本地生产模式常驻本机，手机经局域网访问，定时推送/周报/备份全自动，打卡体验流畅，开始真实自用。

**Architecture:** 不改 app 部署形态（仍 `next build && next start`），新增独立调度器脚本（tsx 运行，按时刻表请求现有/新增 cron 端点 + 本地备份）；周报生成逻辑从 API route 抽为模块函数供 route 与 cron 复用；PWA 用手写最小 service worker；打卡用 React 19 `useOptimistic` 做乐观更新。

**Tech Stack:** Next.js 16.3.4 App Router · React 19 · TypeScript · Prisma 6 (SQLite) · tsx · vitest。

**Spec:** `docs/superpowers/specs/2026-09-13-deploy-self-use-design.md`

## Global Constraints

- API 响应统一 `{ code, data, msg }`，成功 `code=0`；错误非 0 + 可读 `msg`。
- AI 调用必须走 `src/lib/ai` 网关并传 `module` 标注。
- 产品底线：AI 生成内容须用户预览确认后才入库——cron 只自动生成**周报总结**，下周任务仍手动确认。
- 组件体禁止直接调 `Date.now()`/`Math.random()`（react-hooks purity 规则）。
- vitest 无 `@/` 别名配置，测试文件与被测文件一律用相对路径互相 import。
- 脚本文件用 `.mts` 后缀（与 `scripts/graph-*.mts` 一致），tsx 运行。
- commit 信息用中文简述，格式 `type: 描述`（参考 `git log` 现有风格）。
- 每个 Task 完成后按步骤 commit，不要跨 Task 攒 commit。

---

### Task 1: 抽取周报生成核心逻辑为模块函数

把 `src/app/api/companion/weekly-review/route.ts` 里的生成逻辑抽成 `generateWeeklyReport(goalId)`，route 变成薄壳。供 Task 2 的 cron 端点复用。

**Files:**
- Create: `src/modules/companion/weekly-report.ts`
- Modify: `src/app/api/companion/weekly-review/route.ts`

**Interfaces:**
- Produces: `generateWeeklyReport(goalId: string): Promise<WeeklyReportOutcome>`，其中

```ts
export type WeeklyReportOutcome =
  | { status: "created"; reportId: string; riskLevel: RiskLevel; summary: string; adjustments: string; completionRate: number; nextWeekTasks: GeneratedTask[] }
  | { status: "goal-not-found" }
  | { status: "already-exists" }
  | { status: "no-tasks" };
```

Task 2 依赖此签名。route 保持现有响应结构与文案不变（404「目标不存在」/ 409「本周周报已生成，可直接在周计划页查看与确认下周任务」/ 400「本周没有安排任务，无需生成周报」）。

- [ ] **Step 1: 创建 `src/modules/companion/weekly-report.ts`**

完整内容（逻辑从现有 route 原样搬移，仅把 bad() 提前返回改为 outcome 判别联合）：

```ts
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import { startOfToday, type GeneratedTask } from "./plan";
import { assembleContext, MEMORY_PACK_HEADER } from "./memory";
import {
  daysUntil,
  getCheckInStreak,
  getWeekTasks,
  startOfWeek,
  toISODate,
  weekdayLabel,
} from "./stats";
import { parseWeeklyReview, type RiskLevel } from "./weekly";

export type WeeklyReportOutcome =
  | {
      status: "created";
      reportId: string;
      riskLevel: RiskLevel;
      summary: string;
      adjustments: string;
      completionRate: number;
      nextWeekTasks: GeneratedTask[];
    }
  | { status: "goal-not-found" }
  | { status: "already-exists" }
  | { status: "no-tasks" };

const statusLabels: Record<string, string> = {
  done: "已完成",
  skipped: "已跳过",
  pending: "未完成",
};

function buildPlannedTasksText(
  weekStart: Date,
  tasks: Awaited<ReturnType<typeof getWeekTasks>>
): string {
  return tasks
    .map((t) => {
      const date = toISODate(t.dueDate);
      return `- ${weekdayLabel(t.dueDate)}(${date.slice(5)})「${t.title}」预计 ${t.estMinutes} 分钟｜状态：${
        statusLabels[t.status] ?? t.status
      }`;
    })
    .join("\n");
}

function buildExecutionText(
  tasks: Awaited<ReturnType<typeof getWeekTasks>>,
  streak: number
): string {
  const done = tasks.filter((t) => t.status === "done");
  const skipped = tasks.filter((t) => t.status === "skipped");
  const missed = tasks.filter((t) => t.status === "pending");
  const rate = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  const lines: string[] = [`完成率：${done.length}/${tasks.length}（${rate}%）`];
  const streakText = streak > 0 ? `${streak} 天` : "尚未开始";
  lines.push(`连续打卡：${streakText}`);

  if (done.length > 0) {
    lines.push("已完成（含用户备注）：");
    for (const t of done) {
      lines.push(`- 「${t.title}」${t.resultNote ? `备注：${t.resultNote}` : "无备注"}`);
    }
  }
  if (skipped.length > 0) {
    lines.push("已跳过：");
    for (const t of skipped) {
      lines.push(`- 「${t.title}」${t.resultNote ? `原因：${t.resultNote}` : "未填原因"}`);
    }
  }
  if (missed.length > 0) {
    lines.push("落后未完成：");
    for (const t of missed) {
      lines.push(`- ${weekdayLabel(t.dueDate)}「${t.title}」`);
    }
  }
  return lines.join("\n");
}

/**
 * 为单个目标生成周报（AI 总结 + 下周任务建议）。
 * 下周任务只写进 WeeklyReport.metadata，是否入库由用户在周计划页确认。
 */
export async function generateWeeklyReport(goalId: string): Promise<WeeklyReportOutcome> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) {
    return { status: "goal-not-found" };
  }

  const weekStart = startOfWeek(startOfToday());
  const existing = await prisma.weeklyReport.findFirst({
    where: { goalId, weekStart },
  });
  if (existing) {
    return { status: "already-exists" };
  }

  const weekTasks = await getWeekTasks(goalId, weekStart);
  if (weekTasks.length === 0) {
    return { status: "no-tasks" };
  }

  const [memory, streak] = await Promise.all([
    assembleContext(goalId),
    getCheckInStreak(goalId),
  ]);

  const daysLeft = Math.max(0, daysUntil(goal.deadline));
  const deadlineISO = toISODate(goal.deadline);
  const plannedTasksText = buildPlannedTasksText(weekStart, weekTasks);
  const executionText = buildExecutionText(weekTasks, streak);

  const result = await chat({
    messages: [
      { role: "system", content: `${MEMORY_PACK_HEADER}\n\n${memory}` },
      {
        role: "user",
        content: `目标：${goal.title}（剩余${daysLeft}天，截止${deadlineISO}）
原计划本周任务：
${plannedTasksText}

实际执行：
${executionText}

请输出严格 JSON：
{
  "riskLevel": "low|medium|high",
  "summary": "100字内周报：先肯定进步，再指出短板",
  "adjustments": "若为中高风险，给出调整方案（加量/砍项/延期）；低风险则给优化建议",
  "nextWeekTasks": [{"day":1,"title":"...","detail":"...","minutes":30}]
}
要求：
1. day 为 1-7，对应下周一到下周日
2. 任务必须具体可执行，任务量匹配每日可投入 ${goal.dailyMinutes} 分钟（同一天 minutes 总和不超过它）
3. 下周任务要考虑本周执行情况：落后的内容优先补，中高风险时适当减量`,
      },
    ],
    taskType: "complex",
    module: "备考周报",
    responseFormat: "json",
  });

  const review = parseWeeklyReview(JSON.parse(result.content));

  const report = await prisma.weeklyReport.create({
    data: {
      goalId,
      weekStart,
      completionRate: weekTasks.length
        ? (weekTasks.filter((t) => t.status === "done").length / weekTasks.length) * 100
        : 0,
      aiSummary: review.summary,
      adjustments: review.adjustments,
      metadata: {
        riskLevel: review.riskLevel,
        nextWeekTasks: review.nextWeekTasks.map((t) => ({
          day: t.day,
          title: t.title,
          detail: t.detail,
          minutes: t.minutes,
        })),
        streakDays: streak,
        generatedAt: new Date().toISOString(),
      },
    },
  });

  return {
    status: "created",
    reportId: report.id,
    riskLevel: review.riskLevel,
    summary: review.summary,
    adjustments: review.adjustments,
    completionRate: report.completionRate,
    nextWeekTasks: review.nextWeekTasks,
  };
}
```

- [ ] **Step 2: 重写 `src/app/api/companion/weekly-review/route.ts` 为薄壳**

完整替换为：

```ts
import { NextResponse } from "next/server";
import { generateWeeklyReport } from "@/modules/companion/weekly-report";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const goalId = url.searchParams.get("goalId")?.trim();
  if (!goalId) {
    return bad("缺少 goalId 参数");
  }

  try {
    const outcome = await generateWeeklyReport(goalId);
    switch (outcome.status) {
      case "goal-not-found":
        return bad("目标不存在", 404);
      case "already-exists":
        return bad("本周周报已生成，可直接在周计划页查看与确认下周任务", 409);
      case "no-tasks":
        return bad("本周没有安排任务，无需生成周报");
      case "created":
        return NextResponse.json({
          code: 0,
          data: {
            reportId: outcome.reportId,
            riskLevel: outcome.riskLevel,
            summary: outcome.summary,
            adjustments: outcome.adjustments,
            completionRate: outcome.completionRate,
            nextWeekTasks: outcome.nextWeekTasks,
          },
          msg: "",
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[companion/weekly-review] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: 类型检查 + 构建验证**

Run: `npx tsc --noEmit`
Expected: 无错误。

Run: `npm run build`
Expected: 构建成功，无类型/lint 错误。

- [ ] **Step 4: 手动冒烟（dev server 下）**

Run: `npm run dev`（后台），然后：
```bash
curl -s -X POST "http://localhost:3000/api/companion/weekly-review?goalId=不存在的id"
```
Expected: `{"code":404,"data":null,"msg":"目标不存在"}`。

若本地有本周已生成周报的目标，用其 goalId 再调一次。
Expected: `{"code":409,...,"msg":"本周周报已生成，可直接在周计划页查看与确认下周任务"}`（证明重构未改变行为）。验证完停掉 dev server。

- [ ] **Step 5: Commit**

```bash
git add src/modules/companion/weekly-report.ts src/app/api/companion/weekly-review/route.ts
git commit -m "refactor: 周报生成逻辑抽为 generateWeeklyReport 模块函数"
```

---

### Task 2: 新增 cron 端点 `/api/cron/weekly-review`

遍历所有 active 目标自动生成周报，供调度器每周日调用。

**Files:**
- Create: `src/app/api/cron/weekly-review/route.ts`

**Interfaces:**
- Consumes: Task 1 的 `generateWeeklyReport(goalId)` 与 `WeeklyReportOutcome`。
- Produces: `GET/POST /api/cron/weekly-review?secret=xxx` → `{ code: 0, data: { generated: number, skipped: number, failed: number, details: { goalId: string, title: string, status: string }[] }, msg: "" }`。Task 4 调度器请求此 URL。

- [ ] **Step 1: 创建 `src/app/api/cron/weekly-review/route.ts`**

secret 校验模式与 `src/app/api/cron/classroom-push/route.ts` 完全一致：

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateWeeklyReport } from "@/modules/companion/weekly-report";

/**
 * 周报自动生成入口，供调度器/cron 每周日调用：
 * GET /api/cron/weekly-review?secret=xxx
 * 遍历所有 active 目标生成周报；本周已生成或无任务的跳过；单目标失败不阻塞其他目标。
 */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { code: 500, data: null, msg: "CRON_SECRET 未配置" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided !== secret) {
    return NextResponse.json({ code: 401, data: null, msg: "未授权" }, { status: 401 });
  }

  const goals = await prisma.goal.findMany({
    where: { status: "active" },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });

  const details: { goalId: string; title: string; status: string }[] = [];
  for (const goal of goals) {
    try {
      const outcome = await generateWeeklyReport(goal.id);
      details.push({ goalId: goal.id, title: goal.title, status: outcome.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/weekly-review] goal ${goal.id} failed:`, message);
      details.push({ goalId: goal.id, title: goal.title, status: "failed" });
    }
  }

  return NextResponse.json({
    code: 0,
    data: {
      generated: details.filter((d) => d.status === "created").length,
      skipped: details.filter((d) => d.status === "already-exists" || d.status === "no-tasks").length,
      failed: details.filter((d) => d.status === "failed").length,
      details,
    },
    msg: "",
  });
}
```

- [ ] **Step 2: 验证 401 与空跑**

dev server 下：
```bash
curl -s "http://localhost:3000/api/cron/weekly-review?secret=wrong"
```
Expected: `{"code":401,"data":null,"msg":"未授权"}`

```bash
curl -s "http://localhost:3000/api/cron/weekly-review?secret=dev-local-secret-2026"
```
Expected: `code:0`，`generated=0`（本周已有周报或无 active 目标时 skipped 对应增加），`details` 逐目标列出状态。若本地有本周未生成周报且有任务的 active 目标，会真实调 AI 生成（耗时约几十秒，属正常）。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/weekly-review/route.ts
git commit -m "feat: cron 端点自动生成所有 active 目标周报"
```

---

### Task 3: SQLite 备份脚本

**Files:**
- Create: `scripts/backup-lib.mts`（纯函数，可单测）
- Create: `scripts/backup.mts`（执行体）
- Test: `scripts/backup-lib.test.mts`
- Modify: `.gitignore`（加 `/backups`）

**Interfaces:**
- Produces: `pickBackupsToDelete(files: string[], keep?: number): string[]`（纯函数）；`runBackup(now?: Date): Promise<string>`（返回备份文件绝对路径）。Task 4 调度器 import `runBackup`。

- [ ] **Step 1: 写失败的测试 `scripts/backup-lib.test.mts`**

```ts
import { describe, expect, it } from "vitest";
import { pickBackupsToDelete } from "./backup-lib.mts";

describe("pickBackupsToDelete", () => {
  it("份数不超过 keep 时不删", () => {
    const files = ["dev-20260901-0330.db", "dev-20260902-0330.db"];
    expect(pickBackupsToDelete(files, 14)).toEqual([]);
  });

  it("超过 keep 时删除最旧的，保留最新 keep 份", () => {
    const files = [
      "dev-20260903-0330.db",
      "dev-20260901-0330.db",
      "dev-20260902-0330.db",
    ];
    expect(pickBackupsToDelete(files, 2)).toEqual(["dev-20260901-0330.db"]);
  });

  it("忽略非备份命名的文件", () => {
    const files = ["dev-20260901-0330.db", "notes.txt", ".gitkeep", "dev-20260902-0330.db"];
    expect(pickBackupsToDelete(files, 1)).toEqual(["dev-20260901-0330.db"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run scripts/backup-lib.test.mts`
Expected: FAIL，`Cannot find module './backup-lib.mts'`

- [ ] **Step 3: 实现 `scripts/backup-lib.mts`**

```ts
/** 备份文件命名：dev-YYYYMMDD-HHmm.db */
const BACKUP_NAME = /^dev-\d{8}-\d{4}\.db$/;

/** 从目录文件名列表中挑出应删除的备份（只保留最新 keep 份）。纯函数。 */
export function pickBackupsToDelete(files: string[], keep = 14): string[] {
  const backups = files.filter((f) => BACKUP_NAME.test(f)).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run scripts/backup-lib.test.mts`
Expected: 3 passed。

- [ ] **Step 5: 实现 `scripts/backup.mts`**

```ts
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
```

注意：`src/lib/db.ts` 自己把 `DATABASE_URL` 归一为绝对路径，脚本在任何 cwd 下跑都能找到库，无需 dotenv。

- [ ] **Step 6: 手动跑一次验证**

Run: `npx tsx scripts/backup.mts`
Expected: 输出 `[backup] 已备份到 .../backups/dev-20260913-xxxx.db`；`ls backups/` 能看到文件；文件大小与 `prisma/dev.db` 同量级（几百 KB 起）。

- [ ] **Step 7: `.gitignore` 加备份目录**

在 `.gitignore` 末尾追加：

```
# sqlite backups
/backups
```

- [ ] **Step 8: Commit**

```bash
git add scripts/backup-lib.mts scripts/backup-lib.test.mts scripts/backup.mts .gitignore
git commit -m "feat: SQLite 每日备份脚本（VACUUM INTO，保留14份）"
```

---

### Task 4: 调度器 `scripts/scheduler.mts`

**Files:**
- Create: `scripts/schedule-lib.mts`（纯函数，可单测）
- Create: `scripts/scheduler.mts`（执行体）
- Test: `scripts/schedule-lib.test.mts`

**Interfaces:**
- Consumes: Task 3 的 `runBackup()`；Task 2 的 `/api/cron/weekly-review`；既有 `/api/cron/classroom-push`、`/api/cron/daily-reminder`。
- Produces: `matchesSchedule(entry: ScheduleEntry, date: Date): boolean`；命令 `npx tsx scripts/scheduler.mts`（常驻循环）与 `npx tsx scripts/scheduler.mts --now`（全部任务立即各跑一次，调试用）。Task 8 启动脚本以后者调试、前者常驻。

- [ ] **Step 1: 写失败的测试 `scripts/schedule-lib.test.mts`**

```ts
import { describe, expect, it } from "vitest";
import { matchesSchedule } from "./schedule-lib.mts";

describe("matchesSchedule", () => {
  // 2026-09-13 是周日
  const sunday0830 = new Date(2026, 8, 13, 8, 30, 0);
  const sunday0800 = new Date(2026, 8, 13, 8, 0, 0);
  const monday0800 = new Date(2026, 8, 14, 8, 0, 0);

  it("时分匹配且无星期限制时命中", () => {
    expect(matchesSchedule({ hour: 8, minute: 0 }, sunday0800)).toBe(true);
  });

  it("分钟不匹配时不命中", () => {
    expect(matchesSchedule({ hour: 8, minute: 0 }, sunday0830)).toBe(false);
  });

  it("weekday 限制：周日任务周日命中、周一不命中", () => {
    const entry = { hour: 21, minute: 0, weekday: 0 };
    expect(matchesSchedule(entry, new Date(2026, 8, 13, 21, 0, 0))).toBe(true);
    expect(matchesSchedule(entry, new Date(2026, 8, 14, 21, 0, 0))).toBe(false);
  });

  it("weekday 用本地时间 getDay()", () => {
    expect(monday0800.getDay()).toBe(1);
    expect(matchesSchedule({ hour: 8, minute: 0, weekday: 1 }, monday0800)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run scripts/schedule-lib.test.mts`
Expected: FAIL，`Cannot find module './schedule-lib.mts'`

- [ ] **Step 3: 实现 `scripts/schedule-lib.mts`**

```ts
export interface ScheduleEntry {
  hour: number;
  minute: number;
  /** 0=周日 … 6=周六；缺省表示每天 */
  weekday?: number;
}

/** 判断某本地时刻是否命中时刻表项。纯函数。 */
export function matchesSchedule(entry: ScheduleEntry, date: Date): boolean {
  return (
    date.getHours() === entry.hour &&
    date.getMinutes() === entry.minute &&
    (entry.weekday === undefined || date.getDay() === entry.weekday)
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run scripts/schedule-lib.test.mts`
Expected: 4 passed。顺手 `npm test` 确认全部（含背诵调度器 16 例）通过。

- [ ] **Step 5: 实现 `scripts/scheduler.mts`**

```ts
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
```

- [ ] **Step 6: `--now` 调试模式端到端验证**

先 `npm run dev`（后台），再：

Run: `npx tsx scripts/scheduler.mts --now`
Expected 输出 5 行任务结果：
- 班级早/晚推送 ✓（若未绑 SendKey 或无待办，code=0 但推送数为 0，正常）
- 背诵复习提醒 ✓
- 周报自动生成 ✓ code=0（本周已生成则 skipped）
- 数据库备份 ✓ 输出路径

任一项 ✗ 则按日志排错（最常见：dev server 没起、CRON_SECRET 不一致）。

- [ ] **Step 7: Commit**

```bash
git add scripts/schedule-lib.mts scripts/schedule-lib.test.mts scripts/scheduler.mts
git commit -m "feat: 本地调度器（定时推送/周报/备份，--now 调试）"
```

---

### Task 5: PWA（最小 service worker）

**Files:**
- Create: `public/sw.js`
- Create: `src/app/_components/ServiceWorkerRegister.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: 生产环境下 `/sw.js` 注册成功（DevTools → Application → Service Workers 可见）。无下游依赖。

- [ ] **Step 1: 创建 `public/sw.js`**

```js
// 最小 service worker：只为满足 PWA 安装条件，network-only 不做离线缓存，
// 避免自用阶段缓存旧页面。HTTPS 部署后自动激活完整安装能力。
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // 透传：不调用 respondWith，浏览器走默认网络请求
});
```

- [ ] **Step 2: 创建 `src/app/_components/ServiceWorkerRegister.tsx`**

```tsx
"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 注册失败不影响使用（如 HTTP 局域网下被拒绝）
    });
  }, []);
  return null;
}
```

- [ ] **Step 3: 挂载到根 layout**

`src/app/layout.tsx`：顶部 import 加

```tsx
import { ServiceWorkerRegister } from "./_components/ServiceWorkerRegister";
```

body 改为：

```tsx
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        {children}
      </body>
```

- [ ] **Step 4: 生产模式验证**

Run: `npm run build && npx next start -p 3000`（后台），浏览器开 `http://localhost:3000`，DevTools → Application → Service Workers。
Expected: `sw.js` 状态 activated。manifest 项无红色报错（icons 192/512 已存在于 `public/icons/`）。验证完停掉。

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/app/_components/ServiceWorkerRegister.tsx src/app/layout.tsx
git commit -m "feat: 最小 PWA（service worker 注册，仅生产环境）"
```

---

### Task 6: 今日打卡乐观更新

用 React 19 `useOptimistic` 改造：点击「确认完成/确认跳过/撤销」立即更新界面，失败自动回滚并提示。

**Files:**
- Modify: `src/app/companion/today/TodayClient.tsx`

**Interfaces:**
- Consumes: 既有 `PATCH /api/companion/tasks/[taskId]`（body `{ status, resultNote? }`）。API 不动。
- Produces: 无下游依赖。页面组件 props 签名 `TodayClient({ sections }: { sections: TodaySection[] })` 不变。

- [ ] **Step 1: 改造 `TodayClient.tsx`**

改动点（在现有文件基础上改，不要整文件重写时丢样式）：

a) import 行改为：

```tsx
import { startTransition, useOptimistic, useState } from "react";
```

b) `TaskDTO` 定义下方加状态排序表（从 page.tsx 复制同样定义）与乐观 reducer：

```tsx
const statusOrder: Record<string, number> = { pending: 0, done: 1, skipped: 2 };

interface OptimisticAction {
  taskId: string;
  status: TaskDTO["status"];
  resultNote?: string;
}

function applyOptimisticAction(
  sections: TodaySection[],
  action: OptimisticAction
): TodaySection[] {
  return sections.map((section) => ({
    ...section,
    tasks: section.tasks
      .map((t) =>
        t.id === action.taskId
          ? {
              ...t,
              status: action.status,
              resultNote:
                action.status === "pending"
                  ? null
                  : (action.resultNote ?? t.resultNote),
            }
          : t
      )
      .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)),
  }));
}
```

c) `TodayClient` 组件内，`const router = useRouter();` 之后加：

```tsx
  const [optimisticSections, applyOptimistic] = useOptimistic(
    sections,
    applyOptimisticAction
  );
```

d) 删除 `submitting` state（`const [submitting, setSubmitting] = useState(false);`），`patchTask` 整体替换为：

```tsx
  function patchTask(taskId: string, status: TaskDTO["status"], resultNote?: string) {
    setError("");
    setEditing(null);
    setNote("");
    startTransition(async () => {
      applyOptimistic({ taskId, status, resultNote });
      try {
        const res = await fetch(`/api/companion/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, resultNote }),
        });
        const result = (await res.json()) as { code: number; msg: string };
        if (result.code !== 0) {
          throw new Error(result.msg || "打卡失败");
        }
        router.refresh();
      } catch (err) {
        // 乐观状态随 transition 结束自动回滚，这里只需提示
        setError(
          `${err instanceof Error ? err.message : String(err)}，操作未生效，请重试`
        );
      }
    });
  }
```

e) 渲染处 `sections.map(...)` 改为 `optimisticSections.map(...)`；`doneCount` 计算所在的 `sections.map` 回调内逻辑不变（它已在新 map 内）。

f) `TaskCard` 调用处删除 `submitting={submitting}` prop；`TaskCard` 组件签名与实现中删掉 `submitting` 相关：props 类型里的 `submitting: boolean;`、参数解构里的 `submitting`、确认按钮的 `disabled={submitting}` 与文案 `{submitting ? "提交中..." : ...}`（文案改为直接 `editingMode === "done" ? "确认完成" : "确认跳过"`）。「确认跳过」按钮同理删 `disabled={submitting}`。

g) `onConfirm` 处不变（仍调 `patchTask(task.id, editing.mode, note)`）；`onUndo` 不变（`patchTask(task.id, "pending")`）。

- [ ] **Step 2: 类型检查 + lint**

Run: `npx tsc --noEmit && npx eslint src/app/companion/today/`
Expected: 无错误（注意 eslint purity 规则：组件体不得有 `Date.now()`，本次改动不涉及）。

- [ ] **Step 3: 手动验证乐观更新**

`npm run dev` 打开 `/companion/today`（需有今日任务，没有就用 `/dev/reset-today` 造）：
1. 点「完成打卡」→ 填备注 →「确认完成」：卡片**立即**变绿打勾，不等转圈。
2. 点「撤销」：立即回到待办样式。
3. DevTools Network 面板 Offline 模式下点打卡：界面先变，随后顶部出现红色错误提示且界面回滚到原状态。
Expected: 三条全部符合。

- [ ] **Step 4: Commit**

```bash
git add src/app/companion/today/TodayClient.tsx
git commit -m "feat: 今日打卡乐观更新（useOptimistic，失败自动回滚）"
```

---

### Task 7: 今日页加载骨架

**Files:**
- Create: `src/app/companion/today/loading.tsx`

**Interfaces:**
- Produces: 路由级 loading 态，无下游依赖。

- [ ] **Step 1: 创建 `src/app/companion/today/loading.tsx`**

样式对齐 `page.tsx` 的容器结构：

```tsx
export default function Loading() {
  return (
    <main className="min-h-svh bg-zinc-50 px-4 py-6 dark:bg-black sm:px-6">
      <div className="mx-auto max-w-2xl animate-pulse">
        <div className="mb-6 h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mb-2 h-7 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mb-6 h-4 w-56 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 验证**

`npm run dev`，DevTools Network 节流 Slow 3G，访问 `/companion/today`。
Expected: 数据返回前先看到骨架屏，随后替换为真实内容，无布局跳动。

- [ ] **Step 3: Commit**

```bash
git add src/app/companion/today/loading.tsx
git commit -m "feat: 今日任务页加载骨架"
```

---

### Task 8: 启动脚本 + package.json + 文档

**Files:**
- Create: `scripts/start-local.sh`
- Modify: `package.json`（加 script）
- Modify: `README.md`（替换默认模板说明为本项目说明 + 自用部署小节）

**Interfaces:**
- Consumes: Task 4 的 `scripts/scheduler.mts`（常驻模式）。
- Produces: 命令 `npm run start:local`（前提：已 `npm run build`）。

- [ ] **Step 1: 创建 `scripts/start-local.sh`**

```bash
#!/usr/bin/env bash
# 本地自用生产模式启动：next start（局域网可访问）+ 调度器。
# 前提：已执行 npm run build。停止：Ctrl+C（两个进程一并退出）。
set -euo pipefail

PORT="${PORT:-3000}"

echo "[start-local] 启动 next start（0.0.0.0:${PORT}）..."
npx next start -H 0.0.0.0 -p "${PORT}" &
APP_PID=$!

cleanup() {
  echo ""
  echo "[start-local] 正在停止..."
  kill "${APP_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 2
echo "[start-local] 启动调度器..."
exec npx tsx scripts/scheduler.mts
```

- [ ] **Step 2: package.json 加 script**

`"scripts"` 中 `"start": "next start"` 一行之后加：

```json
    "start:local": "bash scripts/start-local.sh",
```

- [ ] **Step 3: 重写 README.md**

完整替换默认模板为（保留简洁，面向自己/评委）：

````markdown
# 学习伴侣（study-companion）

单体模块化学习管理应用：背诵（艾宾浩斯）、备考陪伴、班级 DDL、知识图谱。

技术栈：Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 (SQLite)。

## 开发

```bash
npm install
npx prisma migrate deploy
npm run dev        # http://localhost:3000
npm test           # vitest
npm run build      # 生产构建
```

环境变量见 `.env.example`（AI key / Server酱 SendKey / CRON_SECRET）。

## 本地自用部署（局域网生产模式）

```bash
npm run build
npm run start:local   # next start(0.0.0.0:3000) + 定时调度器
```

- 手机连**同一 Wi-Fi**，浏览器访问 `http://<电脑局域网IP>:3000`（Windows 用 `ipconfig` 查「无线局域网适配器」的 IPv4 地址，如 `192.168.1.5`）。首次连接 Windows 防火墙若弹窗请放行 3000 端口。
- 手机浏览器菜单选「添加到主屏幕」，桌面图标即点即用（HTTPS 部署后升级为完整 PWA）。
- 调度器负责：08:00 / 20:00 班级推送、20:30 背诵提醒、周日 21:00 周报生成、03:30 数据库备份（`backups/`，保留 14 份）。
- 推送走 Server酱到微信：先在微信关注 Server酱服务号，并在 `/classroom/settings` 绑定 SendKey，用 `/dev/push-test` 验证。
- 调试定时任务：`npx tsx scripts/scheduler.mts --now` 立即全量执行一遍。
- 停止：`Ctrl+C`。

项目约定与模块机制见 `AGENTS.md`。
````

- [ ] **Step 4: 验证启动脚本**

Run: `npm run build && npm run start:local`
Expected: 输出 next start 与调度器启动日志；`ipconfig` 查到本机 IPv4 后，浏览器开 `http://<IPv4>:3000` 能打开首页（模拟手机访问）。`Ctrl+C` 后两进程都退出、终端回到提示符。

- [ ] **Step 5: Commit**

```bash
git add scripts/start-local.sh package.json README.md
git commit -m "feat: 本地生产模式启动脚本与自用部署文档"
```

---

### Task 9: 总验收 + 项目记忆更新

**Files:**
- Modify: `AGENTS.md`（当前能力概览/待办/环境配置小节）
- Modify: `docs/completed-history.md`（追加 2026-09-13 条目）

- [ ] **Step 1: 全量验证**

Run: `npm test`
Expected: 全部通过（16 旧 + 7 新）。

Run: `npm run lint`
Expected: 无错误。

Run: `npm run build`
Expected: 成功。

- [ ] **Step 2: 端到端走查（对照 spec §9 验收清单）**

1. `npm run start:local` 启动；
2. 另一终端 `npx tsx scripts/scheduler.mts --now`，五个任务全 ✓（推送数为 0 也算 ✓，看 code=0）；
3. 浏览器开 `http://<IPv4>:3000/companion/today` 完成一次打卡（乐观更新生效）；
4. `ls backups/` 有备份文件；
5. DevTools 确认 `sw.js` 已注册；
6. `Ctrl+C` 干净退出。

- [ ] **Step 3: 更新 `docs/completed-history.md`**

在文件顶部 `## 2026-09-07` 条目**之前**插入新条目：

```markdown
## 2026-09-13（部署自用包）

- [x] 周报生成逻辑抽为 `src/modules/companion/weekly-report.ts` 的 `generateWeeklyReport(goalId)`（route 薄壳化，行为不变）。
- [x] cron 端点 `GET/POST /api/cron/weekly-review?secret=`：遍历 active 目标自动生成周报（已生成/无任务跳过，单目标失败不阻塞），下周任务仍手动确认入库。
- [x] 备份：`scripts/backup.mts`（VACUUM INTO 在线备份 → `backups/`，保留 14 份）+ 纯函数 `pickBackupsToDelete`（3 单测）。
- [x] 本地调度器 `scripts/scheduler.mts`（替代系统 cron）：班级早晚推送/背诵提醒/周日周报/每日备份；`--now` 立即全量调试；纯函数 `matchesSchedule`（4 单测）。
- [x] 最小 PWA：`public/sw.js`（network-only）+ 生产环境注册组件挂根 layout；HTTP 局域网降级为主屏书签。
- [x] 今日打卡乐观更新（useOptimistic，失败自动回滚+提示）；`/companion/today` 加载骨架。
- [x] `npm run start:local`（`scripts/start-local.sh`：next start 0.0.0.0 + 调度器，Ctrl+C 同退）；README 重写为项目说明+自用部署小节。
```

- [ ] **Step 4: 更新 `AGENTS.md`**

- 「6. 当前能力概览」基础设施条目末尾追加：`、本地自用部署（start:local + 调度器 + 每日备份）、最小 PWA、打卡乐观更新`。
- 「7. 待办与已知坑 → 环境配置」第一条中「由外部 cron 请求 `/api/cron/*`」改为「本地自用由 `npm run start:local` 带起的 `scripts/scheduler.mts` 触发；上云服务器后改用系统 crontab（示例不变）」。
- 「7. 待办与已知坑 → 陪伴」删除「周报周日自动触发未做（现手动）」这半句（保留「周报同周不可重生成（409），重生成需先删旧记录」）。

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/completed-history.md
git commit -m "docs: 部署自用包完成记录与记忆更新"
```

---

## Self-Review 结论（写计划时已检查）

- Spec 覆盖：§1 使用场景→Task 8/9；§2 调度器→Task 4；§3 备份→Task 3；§4 周报 cron→Task 1/2；§5 PWA→Task 5；§6 乐观更新+骨架→Task 6/7；§7 启动脚本+文档→Task 8；§9 验收→Task 9。无遗漏。
- 类型一致性：`generateWeeklyReport`/`WeeklyReportOutcome`（Task 1↔2）、`runBackup`（Task 3↔4）、`matchesSchedule`/`ScheduleEntry`（Task 4 内部）、`pickBackupsToDelete`（Task 3 内部）签名一致。
- 无占位符；所有代码步骤含完整代码。
