<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# 学习伴侣 —— 项目记忆文件

> 本文件是项目的长期记忆，只保留**当前状态与约定**。详细完成历史见 `docs/completed-history.md`（新完成条目追加到那里，本文件只更新概览与待办）。

## 1. 项目愿景

单体模块化应用，统一管理**背诵、备考陪伴、班级 DDL、知识图谱**四类学习场景。核心洞察：学习的本质是在某个时间点提醒用户处理某个内容项。系统通过统一的提醒与内容调度机制，把零散学习任务串联成可持续的复习与备考流程。

## 2. 技术栈

Next.js App Router 16.3.4 · TypeScript ^5 · React 19 + Tailwind CSS 4 · Prisma ^6（SQLite，未来可能迁 PG）· vitest。

- `src/lib/ai`：AI 统一网关（DeepSeek 默认 / Kimi 复杂任务，60s 超时，重试 1 次，写 `ApiLog`）。
- `src/lib/push`：推送统一网关（Server 酱 Turbo，`pushToUser({ sendKey?, title, content })`）。
- `src/lib/auth.ts`：轻量账号（sessionToken httpOnly cookie 30 天，`getCurrentUser()`）。
- `src/lib/db.ts`：Prisma Client 单例。

## 3. 目录结构

```
study-companion/
├── prisma/                # schema.prisma / migrations / seed.ts / dev.db
├── public/                # 静态资源
├── scripts/               # 辅助脚本（见各文件名注释；graph-* 为图谱压测与边归一清理）
├── docs/
│   └── completed-history.md  # 已完成清单完整历史（2026-09-07 起）
└── src/
    ├── app/
    │   ├── api/           # REST 路由：admin / classroom / companion / cron / graph / health / recite
    │   ├── dev/           # 调试页：ai-test / ai-usage / push-test / reset-today
    │   ├── _components/   # BackLink / ModuleCard 等通用组件
    │   ├── classroom/     # identity(建身份) / join(邀请落地) / settings / [id](班级空间+任务编辑)
    │   ├── companion/     # page(首页) / new(向导+preview) / plan(周视图+tasks/[taskId]编辑页) / today
    │   ├── graph/         # page(力导向图) / import / review / sources / growth / _components/GraphTabs
    │   ├── recite/        # page(入口) / import / materials(+[id]) / review
    │   └── layout.tsx / manifest.ts / globals.css
    ├── generated/prisma/  # Prisma Client 生成产物（勿手动修改）
    ├── lib/               # ai / push / auth.ts / db.ts
    └── modules/           # 业务模块（纯函数 + Server Actions，见下）
```

### 模块职责（`src/modules/`）

- `recite`：艾宾浩斯调度 `scheduler.ts`（纯函数+测试）、今日查询 `today.ts`（materialId/新卡上限）、统计 `stats.ts`、推送 `reminder.ts`、actions.ts。
- `companion`：`plan.ts`（parsePlan 校验/日期纯函数）、`stats.ts`（周一为起点周统计/连续打卡，日期纯函数重导出）、`goal-detail.ts`（目标详情页展示组装，纯函数）、`weekly.ts`（周报输出校验）、`memory.ts`（记忆包）、`actions.ts`（目标归档/恢复/删除）。
- `classroom`：`actions.ts`（身份/建班/加入/SendKey）、`membership.ts`（数据隔离唯一入口）、`tasks.ts`（校验归一化）、`reminder.ts`（早晚推送）。
- `graph`：`extract.ts`（Prompt + parseExtraction + normalizeRelation 归一）、`candidates.ts`（相似度候选召回：embedding 优先/n-gram 兜底，纯函数）、`adjudicate.ts`（批量裁决 Prompt + parseBatchVerdicts，纯函数）、`ingest.ts`（三段式对齐 + ingestGraph）、`actions.ts`（来源删除/冲突裁决）。

## 4. 关键机制（改动前必须读）

### 记忆包机制（技术护城河）

`src/modules/companion/memory.ts` 的 `assembleContext(goalId)` 是陪伴模块所有 AI 调用的统一上下文来源（目标/截止/每日分钟/现状自述/当前阶段/最近 3 条打卡+本周完成率）。**所有备考 AI 调用一律用它拿记忆包拼进 system 消息**，禁止各自重新拼；新增 AI 能力直接复用，记忆包演进只改 memory.ts。

### 数据隔离纪律（多租户安全底线，classroom 代码必须遵守）

1. 所有查询必须带 `classroomId` 条件；
2. 写操作前必须经 `membership.ts` 的 `isMember`/`requireMembership` 校验成员身份，否则 403（页面 `forbidden()` / API `forbiddenResponse`）；
3. 任务编辑查询用 `findFirst({ where: { id, classroomId } })`，禁止按 id 直取；
4. 未登录访问班级页统一重定向 `/classroom/identity`。

关键设计：**任务共享、完成状态个人化**——`ClassTask` 全班一份，`TaskCompletion`（taskId+userId 唯一）记各人状态。

### 图谱三段式实体对齐（不退化的核心）

a 段规则候选（name 精确/aliases 包含/name 双向包含，全量内存匹配，O(N) 一趟）→ b 段相似度召回（`candidates.ts`：配了 OpenAI 兼容 embedding 接口则向量余弦 top-K，向量存 `GraphNode.metadata` 惰性回填；否则字符 n-gram 余弦兜底，中文按字 bigram、英文整词+词内 bigram，阈值 0.25/top-K 15）→ 两段结果**取并集**进 c 段 AI 裁决（`adjudicate.ts`：有候选实体按 `ADJUDICATION_BATCH_SIZE=8` 分批，一次 chat 裁多项返回 JSON 数组；缺项/非法项与整批失败均逐条兜底保守建新；批不跨篇——每次 ingest 是独立请求）。红线：上下位概念不算同一概念，参数≠权重，策略≠作用对象，不确定返回 null，失败保守建新。匹配成功复用（mentionCount+1、别名并集≤20、主名不变）；关系 `@@unique(from,to,relation)` 已存在则 weight+1；端点不在实体表的关系被过滤（禁止脑补）。语义相反关系（OPPOSITE_RELATIONS）只记录 `MergeReview` 不阻塞，人工三选一裁决。溯源 `NodeSource`；删来源保守处理（mentionCount-1，归零标 `pendingCleanup`）。对比报告见 `docs/graph-alignment-benchmark.md`。

### 图谱关系归一（防边碎片化）

`extract.ts` 的 `normalizeRelation` 在 parse 层统一处理：RELATION_SYNONYMS 同义映射（使用了→使用等）、INVERSE_RELATIONS 互逆归一（属于→包含、源于→导致，端点对调）、噪音词过滤（与/相比/示例…）、批内三元组去重。遇到新动词变体：在 `RELATION_SYNONYMS`/`INVERSE_RELATIONS` 加映射后重跑 `scripts/graph-normalize-edges.mts` 清理存量。

## 5. 编码规范

1. **API 响应格式**：统一 `{ code, data, msg }`，成功 `code=0`、`msg=""`，错误非 0 + 可读 `msg`。
2. **外部服务**：AI 一律走 `src/lib/ai` 网关、推送一律走 `src/lib/push` 网关；AI 调用必须传 `module` 标注（写入 `ApiLog.module` 供 `/dev/ai-usage` 统计）。
3. **产品底线**：所有 AI 生成内容必须经用户预览确认后才入库，禁止业务代码自动保存 AI 输出。
4. **数据库**：所有表预留 `metadata Json`；迁移与 schema 变更同步提交。Prisma SQLite 无 String[]，数组用 Json 存。
5. **响应式**：移动端优先；按钮触摸目标 ≥44px；页面用 `min-h-svh`。
6. **账号**：Cookie 读写只允许在 Server Actions / Route Handlers；`next.config.ts` 开启 `experimental.authInterrupts`（forbidden 403 页），升级 Next 时留意。
7. **react-hooks 编译器 lint（purity）**：组件体禁止直接调 Date.now()/Math.random()，非纯数据组装抽到组件外普通函数。

## 6. 当前能力概览（详见 docs/completed-history.md）

- **背诵**：AI 制卡（预览确认入库）→ 艾宾浩斯复习流（两档自评、每日新卡上限可调、原文折叠、按材料复习）→ 统计（累计/连续天数）→ 定时/手动推送提醒。
- **陪伴**：建目标（AI 差距评估+阶段计划）→ 预览期对话式调整（多轮+撤销）→ 今日打卡 → AI 周报+下周计划（可 AI 调整再入库）→ 执行中手动编辑/改期/增删任务 → 目标详情页 → 归档（首页折叠区可恢复）/删除。
- **班级**：轻量身份 → 建班/邀请链接 → AI 提取通知任务（预览确认发布）→ 任务流（三色预警、个人完成态）→ 早晚推送 → SendKey 绑定。
- **图谱**：喂入（AI 抽取→预览→三段式对齐入库）→ 力导向图（搜索/筛选/节点抽屉/溯源）→ 冲突审阅队列 → 来源管理 → 成长视图 → 关系归一。
- **基础设施**：AI 网关（module 标注+用量日志）、推送网关、AI 用量面板 `/dev/ai-usage`（含费用估算，`src/lib/ai/pricing.ts` 价格表需手工维护）、调试页 `/dev/*`、本地自用部署（start:local + 调度器 + 每日备份）、最小 PWA、打卡乐观更新。

## 7. 待办与已知坑

**环境配置**

- 推送需 `.env` 配 `SERVER_CHAN_SEND_KEY`；定时提醒需 `CRON_SECRET`（已配本地值 `dev-local-secret-2026`），本地自用由 `npm run start:local` 带起的 `scripts/scheduler.mts` 触发；上云服务器后改用系统 crontab（示例不变）。本机 crontab 示例（URL 前缀按部署地址替换）：
  ```
  0 8 * * * curl -s "http://localhost:3000/api/cron/classroom-push?secret=dev-local-secret-2026&mode=morning"
  0 20 * * * curl -s "http://localhost:3000/api/cron/classroom-push?secret=dev-local-secret-2026&mode=evening"
  ```
- `.env` 中 `DATABASE_URL` 必须相对 schema 目录（`file:./dev.db`）；Prisma 6 用 `prisma.config.ts` 时不自动加载 `.env`（文件内已 `import "dotenv/config"`）。
- `KIMI_API_KEY` 未配置时 complex 任务自动回退 DeepSeek（有 warning）。

**操作坑**

- `prisma migrate`/`generate` 后必须重启 dev server，否则 db.ts 单例是旧模型（query engine dll 被占用会 EPERM 甚至卡死 dev server，建议 generate 前先停）。
- Windows Git Bash 用 `curl -d '含中文'` 发 GBK 乱码，中文 payload 写 UTF-8 文件后 `--data-binary @file`。
- `GET /api/graph/data` 节点 >200 时只回 mentionCount≥2；echarts 容器必须显式高度。

**背诵**：单用户本地 Demo；复习页只暴露两档自评但 API/DB 保留四档；造数据用 `/dev/reset-today` 或材料详情页「重置复习进度」。

**陪伴**

- 周报同周不可重生成（409），重生成需先删旧记录。
- 首页角标多目标未拆分。
- **执行中修改阶段结构未做**（改周数连锁后续阶段日期与任务归属，易出脏数据）；预览撤销只回退 AI 调整栈（手动编辑清空），历史存 sessionStorage。

**班级**：截图提取未实现；单设备单 token 无找回；邀请码无过期/退出班级；班级任务无删除入口；Server 酱免费版 5 条/分钟。

**图谱**

- 实体对齐全量内存匹配，节点破千须改候选检索；AI 裁决逐实体调用，量大可改批量。
- `align` 类型 MergeReview 未使用；`pendingCleanup` 节点仅标记无清理页。
- 退化点①**领域标签碎片化**未解决（domain 走对齐或 Prompt 限定枚举）；对齐 Prompt 可加「参数与权重应区分」（压测错合 1 例）。

## 8. 协作规则

1. **会话开始**：读本文件 + `docs/completed-history.md` 的近期条目。
2. **会话结束**：新完成条目**追加到 `docs/completed-history.md`**；本文件「当前能力概览」必要时同步摘要；待办只留仍需跟进的。
3. 目录结构/机制/约定变化：直接更新本文件对应小节。
4. 冲突解决：本文件与代码/README 冲突时先核对现状再改，以事实为准。
