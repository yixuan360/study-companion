<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# 学习伴侣 —— 项目记忆文件

> 本文件是项目的长期记忆。每次 AI 开发会话开始前应先阅读，结束后更新「已完成清单」与「目录结构变化」。

## 1. 项目愿景

「学习伴侣」是一个单体模块化应用，统一管理**背诵、备考陪伴、班级 DDL、知识图谱**四类学习场景。核心洞察是：学习的本质是在某个时间点提醒用户处理某个内容项。围绕这一洞察，系统通过统一的提醒与内容调度机制，把零散的学习任务串联成可持续的复习与备考流程。

## 2. 技术栈与版本

| 层级 | 技术 | 版本/说明 |
|------|------|-----------|
| 框架 | Next.js App Router | 16.3.4 |
| 语言 | TypeScript | ^5 |
| UI | React + Tailwind CSS | React 19.2.8，Tailwind CSS 4 |
| ORM | Prisma | ^6.19.3 |
| 数据库 | SQLite（开发期） | 通过 `DATABASE_URL` 配置，未来可能迁移 PostgreSQL |
| 构建 | ESLint + PostCSS | 配置见 `eslint.config.mjs`、`postcss.config.mjs` |

## 3. 目录结构

```
study-companion/
├── prisma/
│   ├── schema.prisma          # Prisma 模型定义
│   ├── migrations/            # 数据库迁移文件
│   ├── seed.ts                # 数据库种子脚本
│   └── dev.db                 # 本地 SQLite 数据库
├── public/                    # 静态资源、图标
├── scripts/                   # 辅助脚本
│   └── generate-icons.py
├── src/
│   ├── app/                   # Next.js App Router 入口
│   │   ├── api/
│   │   │   ├── admin/ai-stats/route.ts
│   │   │   ├── classroom/
│   │   │   │   └── [id]/
│   │   │   │       └── tasks/
│   │   │   │           ├── extract/route.ts        # AI 提取通知中的任务（不入库）
│   │   │   │           ├── [taskId]/
│   │   │   │       │   ├── route.ts                # PATCH 成员编辑任务（老师改期）
│   │   │   │       │   └── toggle/route.ts         # 切换当前用户自己的完成状态
│   │   │   │           └── route.ts                # POST 确认发布（批量入库）
│   │   │   ├── companion/
│   │   │   │   ├── daily-feedback/route.ts  # AI 今日总结（simple，注入记忆包）
│   │   │   │   ├── generate-plan/route.ts   # AI 生成阶段计划+第一周任务（不入库）
│   │   │   │   ├── goals/route.ts           # 预览确认后入库（Goal+Phases+第一周Tasks）
│   │   │   │   ├── weekly-review/route.ts   # AI 周报（complex，?goalId=，入 WeeklyReport 库）
│   │   │   │   └── tasks/
│   │   │   │       ├── [taskId]/route.ts    # PATCH 打卡：done/skipped/pending + resultNote
│   │   │   │       └── batch-create/route.ts # 下周任务确认入库（weekStart+day 计算 dueDate）
│   │   │   ├── cron/
│   │   │   │   ├── classroom-push/route.ts   # 班级任务早晚提醒（需 CRON_SECRET，mode=morning|evening）
│   │   │   │   └── daily-reminder/route.ts   # 定时复习提醒入口（需 CRON_SECRET）
│   │   │   ├── health/route.ts
│   │   │   └── recite/
│   │   │       ├── cards/
│   │   │       │   ├── batch-create/route.ts
│   │   │       │   └── [cardId]/route.ts
│   │   │       ├── generate-cards/route.ts
│   │   │       ├── review/route.ts        # 提交复习结果
│   │   │       ├── stats/route.ts         # 累计复习次数与连续天数
│   │   │       └── today/route.ts         # 今日待复习卡片（支持 materialId/每日新卡上限参数）
│   │   ├── dev/ai-test/       # AI 网关调试页面
│   │   │   ├── actions.ts
│   │   │   └── page.tsx
│   │   ├── dev/push-test/     # 推送网关调试页面
│   │   │   ├── actions.ts
│   │   │   └── page.tsx
│   │   ├── dev/reset-today/   # 复习调试页：重置卡片 nextReviewAt
│   │   │   ├── actions.ts
│   │   │   └── page.tsx
│   │   ├── _components/       # 页面级通用组件
│   │   │   ├── BackLink.tsx           # 统一的「← 返回」导航链接
│   │   │   ├── ModuleCard.tsx
│   │   │   └── ModulePlaceholder.tsx
│   │   ├── classroom/
│   │   │   ├── [id]/
│   │   │   │   ├── tasks/[taskId]/
│   │   │   │   │   ├── page.tsx              # 任务编辑页（显示录入人/最后修改人）
│   │   │   │   │   └── TaskEditForm.tsx
│   │   │   │   ├── page.tsx                  # 班级空间：邀请码/成员/任务流（服务端取数）
│   │   │   │   ├── InviteCodeCard.tsx        # 邀请码+邀请链接一键复制
│   │   │   │   └── TaskSection.tsx           # 录入区（AI提取/预览/发布）+任务清单+筛选
│   │   │   ├── identity/
│   │   │   │   ├── page.tsx                  # 创建身份（支持 ?code= 邀请自动入班）
│   │   │   │   └── IdentityForm.tsx
│   │   │   ├── join/
│   │   │   │   ├── page.tsx                  # 邀请链接落地页（自动入班）
│   │   │   │   └── JoinClient.tsx
│   │   │   ├── settings/                     # 个人设置：绑定 Server酱 SendKey+测试推送
│   │   │   ├── page.tsx                      # 班级列表+创建+加入（?error=invalid-code 提示）
│   │   │   └── CreateJoinForms.tsx
│   │   ├── companion/
│   │   │   ├── new/
│   │   │   │   ├── page.tsx                 # 目标初始化两步向导
│   │   │   │   └── preview/page.tsx         # 计划预览（阶段名/任务可编辑删除，确认入库）
│   │   │   ├── plan/
│   │   │   │   ├── page.tsx                 # 周视图：阶段总览+本周日历+周报（服务端取数）
│   │   │   │   └── PlanClient.tsx           # 周报生成/风险灯/下周计划确认入库（支持 ?goalId= 切换）
│   │   │   ├── today/
│   │   │   │   ├── page.tsx                 # 今日任务页（服务端取数，按目标分组）
│   │   │   │   └── TodayClient.tsx          # 打卡（完成/跳过+备注）、AI 今日总结
│   │   │   └── page.tsx                     # 陪伴模块首页（引导/目标卡片/今日任务与周计划入口）
│   │   ├── graph/page.tsx
│   │   ├── recite/
│   │   │   ├── import/page.tsx          # 文字录入与 AI 制卡
│   │   │   ├── materials/page.tsx       # 材料列表
│   │   │   ├── materials/[id]/
│   │   │   │   ├── page.tsx             # 材料详情（服务端取数）
│   │   │   │   └── MaterialDetailClient.tsx  # 卡片列表/掌握度分布/重置进度
│   │   │   ├── review/page.tsx          # 今日复习卡片流（两档自评）
│   │   │   ├── SendReminderButton.tsx   # 手动推送今日复习提醒
│   │   │   └── page.tsx                 # 背诵模块入口
│   │   ├── layout.tsx
│   │   ├── manifest.ts
│   │   └── globals.css
│   ├── generated/prisma/      # Prisma Client 生成产物（勿手动修改）
│   ├── lib/                   # 全局基础设施与网关
│   │   ├── ai/                # AI 能力统一网关
│   │   │   ├── constants.ts
│   │   │   ├── config.ts
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   ├── push/              # 推送能力统一网关
│   │   │   ├── types.ts
│   │   │   ├── channels/
│   │   │   │   └── server-chan.ts
│   │   │   └── index.ts
│   │   ├── auth.ts            # 轻量账号：getCurrentUser()/sessionToken httpOnly cookie 30 天（MVP，未来可换 NextAuth）
│   │   └── db.ts              # Prisma Client 单例
│   └── modules/               # 业务模块
│       ├── recite/
│       │   ├── actions.ts       # Server Actions：重置复习进度、手动推送提醒
│       │   ├── reminder.ts      # 推送「今日待复习」提醒（走 push 网关）
│       │   ├── scheduler.ts     # 艾宾浩斯调度算法纯函数
│       │   ├── scheduler.test.ts
│       │   ├── stats.ts         # 累计复习次数与连续天数统计
│       │   └── today.ts         # 今日待复习查询（支持 materialId 过滤与新卡上限）
│       ├── companion/
│       │   ├── plan.ts          # 计划类型/校验（parsePlan）/日期计算纯函数
│       │   ├── stats.ts         # startOfWeek（周一起）、daysUntil、getWeekTasks、getCheckInStreak（连续打卡天数）、toISODate/weekdayLabel
│       │   ├── weekly.ts        # parseWeeklyReview：周报 AI 输出校验（riskLevel/summary/adjustments/nextWeekTasks）
│       │   └── memory.ts        # 【记忆包机制】assembleContext(goalId)，详见下方模块划分说明
│       └── classroom/
│           ├── actions.ts      # Server Actions：创建身份/建班/加入/保存SendKey/测试推送/退出登录
│           ├── membership.ts   # 【数据隔离】isMember/requireMembership（非成员 forbidden 403）/forbiddenResponse
│           ├── tasks.ts        # 任务校验归一化：parseTaskInput/parseExtractedTasks/normalizeDeadlineText/类型与平台映射
│           └── reminder.ts     # 班级任务早晚提醒推送（按成员 pushKey 逐人推送各自未完成清单）
├── .env                     # 本地环境变量（API Key、数据库地址，不提交）
├── next.config.ts
├── package.json
└── tsconfig.json
```

### 模块划分

- `src/modules/recite`：背诵模块（记忆卡片、间隔重复、背诵提醒）。
  - `scheduler.ts`：艾宾浩斯调度纯函数。
  - `today.ts`：今日待复习查询（支持按材料过滤与每日新卡上限）。
  - `stats.ts`：累计复习次数与连续复习天数统计。
  - `reminder.ts`：封装「今日待复习」推送（经 `src/lib/push` 网关）。
  - `actions.ts`：Server Actions（重置复习进度、手动触发推送提醒），`/dev/reset-today` 与材料详情页共用。
- `src/modules/companion`：备考陪伴模块（目标→AI 阶段计划→每日任务→打卡→AI 周报）。
  - `plan.ts`：计划类型与纯函数——`parsePlan`（校验/归一化 AI 输出，兼容 assessment 为字符串或字符串数组）、`computePhaseDates`（阶段起止日期，从今天起按周数累推）、`computeTaskDueDate`（第 N 天任务到期日）、`parseDateOnly`（YYYY-MM-DD 解析）。
  - `stats.ts`：周与打卡统计——`startOfWeek`（周一为一周起点）、`getWeekTasks`（某目标某周任务）、`getCheckInStreak`（连续打卡天数：从今天、若今天未打卡则从昨天往前，每天至少完成 1 个任务）、`toISODate`/`weekdayLabel`（本地自然日工具）。
  - `weekly.ts`：`parseWeeklyReview`，校验周报 AI 输出（riskLevel 枚举、summary 非空、adjustments 可空、nextWeekTasks day 1-7）。

### 记忆包机制（技术护城河，后续会话重点维护）

`src/modules/companion/memory.ts` 的 `assembleContext(goalId)` 是陪伴模块所有 AI 调用的统一上下文来源，把一个目标的「身份 + 进展」压缩为结构化文本，共 6 个区块：

1. `【目标】`标题 + 类别（exam/project/habit 中文标签）
2. `【截止】`日期 + 剩余天数
3. `【每日可投入】`分钟数
4. `【现状自述】`用户创建目标时填写的原始描述
5. `【当前阶段】`按日期区间判定（今天不在任何区间时回退到下一个未开始阶段，再回退到最后一个阶段），含阶段重点与结束标志（exitCriteria 存于 Phase.metadata）
6. `【最近打卡】`最近 3 条 done/skipped 任务（含 resultNote 备注）+ `【本周完成率】`done/total

使用约定（后续会话必须遵守）：

- **所有备考相关 AI 调用一律调用 `assembleContext(goalId)` 拿记忆包，拼进 `chat()` 的 system 消息**（配合 `MEMORY_PACK_HEADER`），禁止各自重新拼目标信息。已接入：今日总结 `daily-feedback`、周报 `weekly-review`。
- 后续新增 AI 能力（备考答疑、薄弱点提炼、阶段检测、推送文案等）直接复用此函数；记忆包内容演进（错题分布、知识图谱覆盖率等）只改 memory.ts，不动调用方。
- `goalId` 不存在时抛错；当前阶段判定逻辑与周报页保持一致（本会话实现的 `/companion/plan` 用 `startDate <= today <= endDate` 判定 isCurrent）。

### 班级模块（classroom）与数据隔离纪律

- `src/modules/classroom`：班级作业共享模块（一人录入、全班受益）。
  - `actions.ts`：Server Actions——`createIdentityAction`（昵称+学号建身份，签发 sessionToken cookie）、`createClassroomAction`（8 位邀请码，创建者自动入班）、`joinClassroomAction`/`joinByInviteCodeAction`（邀请码/邀请链接入班）、`updatePushKeyAction`/`sendTestPushAction`（绑定并测试 Server酱）、`signOutAction`（清 cookie）。
  - `membership.ts`：**数据隔离唯一入口**——`isMember`（查成员关系）、`requireMembership`（页面用，非成员触发 forbidden() 渲染 403 页，需 `next.config.ts` 的 `experimental.authInterrupts`）、`forbiddenResponse`（API 用，HTTP 403 JSON）。
  - `tasks.ts`：任务输入校验与归一化。`normalizeDeadlineText` 兼容 AI 输出的 `HH:mm:ss`/ISO `T` 分隔并截断到分钟；`parseClassTaskType` 同时接受中文标签（作业/考试/活动/通知）和枚举键。
  - `reminder.ts`：`sendClassroomTaskPush(mode)`——morning 推今日到期、evening 推未来 24h 到期，只推绑定 pushKey 成员的各自未完成任务，无待办不推送。
- **数据隔离纪律（多租户安全底线，所有 classroom 代码必须遵守）**：
  1. 所有查询必须带 `classroomId` 条件，禁止无班级过滤的全表查询；
  2. 所有写操作（发布/编辑/打卡）前必须经 `isMember`/`requireMembership` 校验当前用户是该班级成员，否则 403；
  3. 任务编辑查询用 `findFirst({ where: { id, classroomId } })` 而非按 id 直取，防止跨班级越权访问；
  4. 未登录访问班级页面统一重定向 `/classroom/identity`，API 返回 401。
- 关键设计：**任务共享、完成状态个人化**——`ClassTask` 全班一份，`TaskCompletion`（taskId+userId 唯一）记录各人 done/doneAt；`ClassTask.updatedBy` 记录最后修改人。
- `next.config.ts` 开启了 `experimental.authInterrupts`（为 forbidden() 403 页），升级 Next 时留意该实验配置的变化。
- `src/modules/graph`：知识图谱模块（知识点节点、关联、复习路径）。
- `src/lib/ai`：AI 能力统一网关（已创建，支持 DeepSeek / Kimi，统一封装调用、JSON 解析、用量统计与重试）。
- `src/lib/push`：推送能力统一网关（Server 酱 Turbo，抽象 `PushChannel` 接口；`pushToUser({ sendKey, title, content })` 支持指定 SendKey，不传回落环境变量 `SERVER_CHAN_SEND_KEY`——背诵模块默认通道不受影响）。

## 4. 编码规范

### 4.1 API 响应格式

所有 API 路由统一返回：

```json
{
  "code": 0,
  "data": ...,
  "msg": ""
}
```

- 成功时 `code` 为 `0`，`msg` 为空字符串。
- 错误时 `code` 非 `0`，`msg` 为可读错误信息，`data` 视情况为 `null` 或补充信息。

### 4.2 外部服务调用

- **AI 调用一律走 `src/lib/ai` 网关**，禁止在业务代码里直接调用任何大模型 API。
- **推送一律走 `src/lib/push` 网关**，禁止直接请求 Server 酱或任何推送服务商。
- **陪伴模块的 AI 调用必须在 system 消息注入记忆包**：`assembleContext(goalId)`（见模块划分中的记忆包机制小节）。
- 网关内部封装 provider 细节，业务层只与稳定接口交互。

### 4.3 数据库设计

- 所有数据表预留 `metadata Json` 字段，用于未来扩展与实验性功能。
- 迁移脚本需与 schema 变更同步提交。

### 4.4 响应式设计

- 移动端优先（mobile-first）。
- 默认按小屏布局实现，再逐步增强到桌面端。

### 4.5 轻量账号体系（MVP）

- 无密码注册：`/classroom/identity` 填昵称（必填）+学号（选填）即创建 `User`，`sessionToken`（uuid）写入 httpOnly cookie（30 天，SameSite=Lax）。
- 服务端统一用 `src/lib/auth.ts` 的 `getCurrentUser()` 获取当前用户（返回 `User | null`）；未来替换 NextAuth 时只需保持该函数签名。
- Cookie 读写只允许出现在 Server Actions / Route Handlers 中。

### 4.6 数据隔离纪律（多租户安全底线）

- 班级模块所有查询必须带 `classroomId` 条件；所有写操作前必须校验当前用户是该班级成员，否则 403（页面 `forbidden()` 渲染 403 页 / API 返回 403 JSON）。
- 校验统一走 `src/modules/classroom/membership.ts`，禁止在业务代码里手写成员判断。

## 5. 已完成清单

- [x] 项目初始化（Next.js App Router + TypeScript + Tailwind CSS）。
- [x] 目录结构搭建（`src/app`、`src/lib`、`src/modules`、`prisma`、`public`、`scripts`）。
- [x] Prisma 初始化并生成 Client（当前仅有 `User` 占位模型）。
- [x] 四个模块入口占位页面：`/recite`、`/companion`、`/classroom`、`/graph`。
- [x] 首页模块卡片组件 `ModuleCard.tsx` 与占位组件 `ModulePlaceholder.tsx`。
- [x] 健康检查接口 `/api/health`。
- [x] 统一 AI 网关 `src/lib/ai/`（DeepSeek 默认、Kimi 复杂任务、OpenAI 兼容、60 秒超时、失败重试 1 次）。
- [x] `ApiLog` Prisma 模型与迁移，用于记录每次 AI 调用的 token 用量与耗时。
- [x] 管理接口 `GET /api/admin/ai-stats`，查看累计 AI 用量。
- [x] 开发调试页面 `/dev/ai-test`，支持输入文本提取要点并展示 token 用量。
- [x] 统一推送网关 `src/lib/push/`（Server 酱 Turbo、`PushChannel` 抽象、`pushToUser` 入口、失败不阻塞业务）。
- [x] 开发调试页面 `/dev/push-test`，一键发送测试推送到微信。
- [x] 背诵模块数据库层：`Material`、`Card`、`ReviewLog` 模型及枚举定义，迁移文件 `20260901102816_add_recite_models`，并添加常用查询索引。
- [x] 数据库种子脚本 `prisma/seed.ts`，包含 1 条示例材料、3 张示例卡片及 1 条复习记录；`prisma.config.ts` 已配置 `migrations.seed`，可通过 `npx prisma db seed` 执行。
- [x] 背诵模块核心制卡链路：`/recite/import` 文字录入 → AI 制卡 → 预览确认 → 批量入库。
- [x] API `POST /api/recite/generate-cards`（创建 Material 并调用 AI 网关生成卡片，不自动入库）。
- [x] API `POST /api/recite/cards/batch-create`（仅保存用户勾选卡片）。
- [x] API `DELETE /api/recite/cards/[cardId]`（删除单张卡片）。
- [x] 页面 `/recite/materials` 材料列表与 `/recite/materials/[id]` 卡片详情/删除。
- [x] 背诵模块复习调度算法 `src/modules/recite/scheduler.ts`：艾宾浩斯阶梯 `[1,2,4,7,15,30]`，四档自评（forgot/hard/good/easy）状态流转，mastery 进阶规则，纯函数便于测试。
- [x] `scheduler.ts` 的 vitest 单元测试，覆盖四档结果、mastery 流转、边界与脏数据。
- [x] Prisma 迁移 `20260902015423_add_card_good_streak`，为 `Card` 增加 `goodStreak` 字段以支持连续 good/easy 计数。
- [x] API `GET /api/recite/today`：返回今日待复习卡片与每日上限 10 张的新卡。
- [x] API `POST /api/recite/review`：入参 `{ cardId, result, userAnswer? }`，走调度算法更新卡片并写 `ReviewLog`。
- [x] 复习页面 `/recite/review`：卡片流，顶部进度条，挖空高亮，判断题对/错作答，简答题默写输入，四档自评按钮，完成总结页。
- [x] 首页 `/` 背诵模块卡片显示今日待复习数量，点击直达复习页。
- [x] 背诵模块入口 `/recite` 更新为复习/材料/录入导航页。
- [x] 背诵模块页面移动端样式统一：按钮触摸目标 ≥44px、卡片圆角一致、加载态加 spinner、页面使用 `min-h-svh`。
- [x] 录入页 `/recite/import` 支持“重新录入”清空当前预览；材料详情页删除按钮与材料列表入口扩大触摸区域。
- [x] 复习页 `/recite/review` 完成态增加“查看材料”“录入新材料”入口。
- [x] 开发调试页 `/dev/reset-today`：一键重置指定材料所有卡片的 `nextReviewAt` 为现在，新卡同步置为 `learning`。
- [x] 首页“背诵记忆卡”入口改为 `/recite` 模块导航页，让用户选择“开始复习 / 我的材料 / 录入新材料”。
- [x] 复习页新增“查看背诵原文”折叠区，显示当前卡片所属材料的原始内容，避免只面对孤立卡片。
- [x] 挖空题空白处改为可输入框，支持在显示答案前主动填写。
- [x] 统一返回导航组件 `BackLink`（`src/app/_components/BackLink.tsx`），复习页/材料列表/材料详情/录入页顶部均接入，统一返回 `/recite` 或上级页面。
- [x] 修复 `.env` 中 `DATABASE_URL` 为 `file:./dev.db`（相对 schema 目录），Prisma Studio 可正常查看数据；`src/lib/db.ts` 运行时仍会覆盖为绝对路径，应用行为不变。
- [x] 按材料复习链路：`getTodayReviewCards` 支持 `materialId` 过滤，`GET /api/recite/today?materialId=xxx` 透传；材料详情页新增「开始背诵本材料」跳转 `/recite/review?materialId=xxx`，复习页透传参数。
- [x] 复习页两档自评：界面只保留「忘了 / 记得」（记得提交 good），调度器与数据库枚举不动，四档数据保留可随时恢复。
- [x] 自评按钮标注后果：「记得 → N 天后再见」由 `scheduler.ts` 纯函数本地预览；「忘了 → 明天再见」。
- [x] 复习页每日新卡上限可调：顶部选择器 5/10/20，`GET /api/recite/today?dailyNewCardLimit=n` 生效。
- [x] 复习队列混合排序：每日新卡均匀插入到期旧卡队列（`interleaveDueAndNew`），不再先旧后新。
- [x] `src/modules/recite/stats.ts` + `GET /api/recite/stats`：累计复习次数与连续复习天数（按本地自然日去重）。
- [x] 入口页 `/recite` 与复习完成页显示累计复习次数与连续天数。
- [x] 材料详情页：掌握度分布统计（new/learning/familiar/mastered）、每张卡显示遗忘次数（`lapseCount`）与下次复习日期。
- [x] 材料详情页「重置复习进度」按钮：核心逻辑抽取为 `src/modules/recite/actions.ts` 的 `resetCardsProgress`，`/dev/reset-today` 改为复用同一实现。
- [x] 定时复习提醒：`src/modules/recite/reminder.ts` + `GET/POST /api/cron/daily-reminder`（需 `CRON_SECRET`，支持 `?secret=` 或 `Authorization: Bearer`）；入口页新增「推送今日复习提醒到微信」手动触发按钮。
- [x] 修复首页背诵模块卡片今日待复习数量角标不显示的问题（badge 匹配条件误写为 `/recite/review`）。
- [x] 陪伴模块数据库层：`Goal`、`Phase`、`Task`、`WeeklyReport` 模型及枚举（`GoalCategory` exam/project/habit、`GoalStatus` active/done/archived、`TaskStatus` pending/done/skipped），迁移文件 `20260904154226_add_companion_models`，全部预留 `metadata Json`；Task.phaseId 可空（阶段删除置 Null），Goal/Phase 级联删除。
- [x] `src/modules/companion/plan.ts`：计划校验与日期纯函数（`parsePlan`/`computePhaseDates`/`computeTaskDueDate`/`parseDateOnly`）。
- [x] API `POST /api/companion/generate-plan`：入参 `{ title, category, deadline, dailyMinutes, userContext }`，走 AI 网关（taskType `complex`、responseFormat `json`）生成差距评估 + 阶段划分 + 第一周任务，仅返回不入库。
- [x] API `POST /api/companion/goals`：预览确认后入库，服务端复用 `parsePlan` 校验；事务内创建 Goal（assessment 存 `metadata`）+ Phases（startDate 从今天按 weeks 累推，exitCriteria 存 `metadata`）+ 第一周 Tasks（dueDate=今天+(day-1)，挂到第一阶段），返回 `{ goalId }`。
- [x] 页面 `/companion` 陪伴模块首页：无目标时显示「开始一个新目标」引导；有目标时显示卡片（标题、类别、倒计时天数、本周进度条、今日任务数与完成情况）。
- [x] 页面 `/companion/new` 两步向导：第 1 步目标名称/类别/截止日期/每日分钟数，第 2 步现状自述（带四级示例引导语），提交调 generate-plan，计划经 sessionStorage（key `companion:planDraft`）传给预览页。
- [x] 页面 `/companion/new/preview` 计划预览：差距评估、阶段划分（阶段名可编辑，显示推算的起止日期）、第一周任务（title/detail/minutes 可编辑、可删除），「确认开始」入库后跳转 `/companion`；无草稿时引导回 `/companion/new`。
- [x] 【记忆包机制】`src/modules/companion/memory.ts`：`assembleContext(goalId)` 组装「目标信息+当前阶段+最近 3 次打卡+本周完成率」结构化文本；设计说明见「模块划分 → 记忆包机制」小节，后续所有备考 AI 调用必须复用。
- [x] `src/modules/companion/stats.ts`：周一为起点的 `startOfWeek`、`getWeekTasks`、`getCheckInStreak`（连续打卡天数）、`toISODate`/`daysUntil`/`weekdayLabel`；`/companion` 首页与周视图共用。
- [x] API `PATCH /api/companion/tasks/[taskId]`：任务打卡，body `{ status: done|skipped|pending, resultNote? }`；done 记 `doneAt`，pending 撤销时清空备注与 doneAt。
- [x] API `POST /api/companion/daily-feedback`：按 goalId 汇总今日任务完成情况，注入记忆包调 AI（taskType `simple`）生成今日总结，仅返回不入库。
- [x] 页面 `/companion/today` 今日任务：按目标分组显示今日任务（pending 排前），每项可「完成打卡/跳过」（可填结果备注/跳过原因）、已完成项可撤销、圆形复选框快捷打卡；底部「生成今日总结」按钮显示 AI 反馈。
- [x] API `POST /api/companion/weekly-review?goalId=`：汇总本周任务（完成率、各任务 resultNote、连续打卡天数），注入记忆包调 AI（taskType `complex`）按指定 Prompt 生成周报；`WeeklyReport` 立即入库（riskLevel 与 nextWeekTasks 存 `metadata`），同周重复生成返回 409。
- [x] API `POST /api/companion/tasks/batch-create`：body `{ goalId, weekStart: 'YYYY-MM-DD', tasks:[{day,title,detail,minutes}] }`，dueDate=weekStart+(day-1)，自动挂接到期日所在阶段；该周已有任务时返回 409 防重复入库。
- [x] 页面 `/companion/plan` 周视图：阶段总览（当前阶段高亮）、本周任务日历（周一~周日分组、今天高亮、已完成打勾/跳过灰化、备注内联显示）、周报区（进度风险灯 绿/黄/红 + 周报卡片 + 下周计划确认入库按钮，已入库显示 ✓）；多目标时顶部切换（`?goalId=`）。
- [x] 首页 `/` 陪伴模块卡片显示角标「剩 N 天 · 今日 x/y」（取最近截止的 active 目标 + 所有 active 目标今日任务完成数）；`ModuleCard` 新增 `badgeText` 自定义角标支持。
- [x] `/companion` 首页新增「今日任务」「周计划与周报」两个快捷入口卡片（今日任务入口带完成数摘要）。
- [x] 班级模块数据层：`Classroom`（inviteCode 唯一索引）、`ClassroomMember`（classroomId+userId 联合唯一）、`ClassTask`（含枚举 `ClassTaskSourceType` text/screenshot、`ClassTaskType` homework/exam/activity/notice、`updatedBy` 最后修改人）、`TaskCompletion`（taskId+userId 联合唯一，任务共享但完成状态个人化）；`User` 增加 `studentNo`/`pushKey`/`sessionToken`（唯一）。迁移 `20260905113000_add_classroom_models`、`20260905120000_add_class_task_updated_by`。
- [x] 轻量账号体系：`src/lib/auth.ts`（getCurrentUser/cookie 签发，MVP 注释说明未来可换 NextAuth）；`/classroom/identity` 创建身份页（昵称必填+学号选填，支持 `?code=` 邀请自动入班）。
- [x] 页面 `/classroom`：我的班级列表 + 创建班级（Server Action，邀请码 8 位去易混淆字符生成）+ 加入班级（邀请码）+ 无效邀请码错误提示。
- [x] 页面 `/classroom/[id]` 班级空间：邀请码+邀请链接一键复制（含 execCommand 降级）、成员列表（班长/我角标）、任务流。
- [x] 数据隔离：`membership.ts` + 页面 `forbidden()` 真实 403（`next.config.ts` 开启 `experimental.authInterrupts`，新增 `app/forbidden.tsx`）+ API 403 JSON；未登录统一重定向创建身份页。
- [x] API `POST /api/classroom/[id]/tasks/extract`：AI（simple+json）按指定 Prompt 提取通知中的任务（相对时间换算、低置信度标注），只解析不入库；Prompt 额外注入本地日期+星期锚点避免 UTC 日期偏差。
- [x] API `POST /api/classroom/[id]/tasks`（确认发布批量入库）、`PATCH .../tasks/[taskId]`（任何成员可编辑，记录 updatedBy）、`POST .../tasks/[taskId]/toggle`（切换当前用户自己的 TaskCompletion）。
- [x] 班级空间任务流：按 deadline 升序、逾期未完成置顶标「已逾期」、三色预警（<24h 红/<3天黄/其余绿，含「还剩X天/小时」）、平台/课程/类型标签、录入人昵称、我的完成复选框；全部/未完成/已完成筛选。
- [x] 录入区：大文本域+智能提取 → 提取结果卡片预览（全部字段可编辑、置信度<0.6 标黄「时间待确认」）→ 确认发布；聚焦时尝试读取剪贴板（需授权，失败静默），检测到内容弹「是否提取」；移动端录入按钮固定底部+底部弹层。
- [x] 任务编辑页 `/classroom/[id]/tasks/[taskId]`：全部字段可改（老师改期场景），显示录入人+最后修改人。
- [x] 推送网关升级：`pushToUser({ sendKey, title, content })` 支持指定 SendKey，不传回落 `SERVER_CHAN_SEND_KEY`（背诵模块不受影响）。
- [x] 页面 `/classroom/settings` 个人设置：绑定 Server酱 SendKey（含获取教程+SCT 格式校验）+发送测试消息+展示昵称/学号/已加入班级；`signOutAction` 清除身份。
- [x] API `GET /api/cron/classroom-push?secret=&mode=morning|evening`：与背诵 daily-reminder 共用 CRON_SECRET；morning 推今日到期、evening 推 24h 内到期（标题「⏰ 明天截止：N 项任务」），按成员各自 pushKey 推各自未完成清单，无待办不推送。
- [x] 邀请链接 `/classroom/join?code=xxx`：已登录直接入班，未登录先创建身份再自动入班（identity 页透传 code）。
- [x] 首页 `/` 班级卡片角标「3 天内 N 项到期」：跨所有我加入的班级统计未来 3 天到期且我未完成的任务。

## 6. 待办与已知坑

> 待后续会话持续更新。

- 使用推送前需在 `.env` 中配置 `SERVER_CHAN_SEND_KEY`（Server 酱 Turbo 的 SendKey）。
- 定时提醒需在 `.env` 中配置 `CRON_SECRET`，由外部 cron 服务（Vercel Cron、系统 crontab 等）定时请求 `/api/cron/daily-reminder?secret=xxx`；本地开发可先不配置，用入口页的手动触发按钮。
- `.env` 中 `DATABASE_URL` 必须为相对 schema 目录的路径（`file:./dev.db`），否则 Prisma Studio 会因路径解析错误显示空表；应用运行时由 `src/lib/db.ts` 覆盖为绝对路径，不受影响。
- `pushToUser` 当前只支持单个默认 SendKey；未来若需按用户绑定不同 SendKey，可在 `getDefaultSendKey()` 处扩展为按 `userId` 查询数据库并选择对应通道。
- Prisma 6 使用 `prisma.config.ts` 时会跳过默认的 `.env` 加载，因此配置文件中通过 `import "dotenv/config"` 手动加载环境变量；执行种子命令使用 `npx prisma db seed`。
- **产品底线**：所有 AI 生成内容必须经过用户预览确认后才能入库，禁止在业务代码中自动保存 AI 输出。
- 复习调度测试：
  - 运行单元测试：`npm test`（仅测试 `scheduler.ts`）。
  - 手动造今日复习数据：访问 `/dev/reset-today`，或在材料详情页点「重置复习进度」。
  - 每日新卡上限默认 `DEFAULT_DAILY_NEW_CARD_LIMIT = 10`（`src/modules/recite/today.ts`），复习页可切换 5/10/20。
- 移动端样式：已将主要页面 `min-h-screen` 统一为 `min-h-svh`；主要操作按钮高度统一为 ≥44px，避免小屏误触。
- 复习流程当前为单用户本地 Demo，未接入真实用户体系；`ReviewLog` 的 `userAnswer` 仅作记录，不做 AI 自动批改。
- 复习页 UI 只暴露两档自评（forgot/good），但 API 与数据库仍保留 hard/easy，恢复四档只需改回前端按钮。
- 陪伴模块执行闭环已通（建目标→今日打卡→AI 周报→下周计划入库），剩余待办：
  - 周报周日自动触发：本期仅手动按钮，后续可挂 `/api/cron/`（复用 CRON_SECRET 模式）在周日晚自动跑 `weekly-review` 并推送。
  - 周报不支持重新生成（同周 409）；如需重生成需先删旧 WeeklyReport，且下周任务已入库后重新生成会因 batch-create 的 409 无法再次确认，需设计清理流程。
  - 目标卡片仍不可点击；目标详情页（/companion/goals/[id]）如需单独的历史周报列表可再建。
  - 首页陪伴角标只显示最早截止目标的倒计时 + 全部 active 目标今日完成数，多目标时未按目标拆分。
  - 打卡成功后依赖 `router.refresh()` 重新取数，无乐观更新；任务量大时可优化。
- AI 生成计划的已知行为：模型可能把「差距评估 3 条以内」输出为字符串数组，`parsePlan` 已兼容两种形态；Prompt 中要求同一天任务 minutes 总和不超过每日可投入时间。周报 Prompt 要求 nextWeekTasks day 1-7 对应下周一到下周日，day 与 dueDate 的换算统一在 `tasks/batch-create` 服务端做。
- 班级模块上线（账号+空间+AI 提取任务流+推送），剩余待办与已知点：
  - `ClassTask.sourceType` 的 screenshot（截图提取）本期未实现；录入区暂只支持文本粘贴。
  - `src/lib/auth.ts` 为单设备单 token（重新创建身份会使旧 token 失效）、无找回；多人试用通过"不同浏览器/无痕窗口=不同身份"隔离。
  - 邀请码永不过期且无退出班级功能；试用中误加错班需数据库手动删 `ClassroomMember`。
  - 早晚推送依赖外部 cron 触发 `/api/cron/classroom-push`，本机 crontab 示例见下；Server酱免费版 5 条/分钟、同内容可能被去重。
  - 班级任务无「删除」入口（编辑页可改内容），误发布需数据库手动删。
  - AI 提取为非确定性输出：已做 `normalizeDeadlineText` 兼容秒数/T 分隔、`parseClassTaskType` 兼容中英文类型、低置信度标黄；若遇新格式变体在此扩展。
  - Windows 下 Git Bash 用 `curl -d '含中文'` 会发送 GBK 乱码，联调中文 payload 必须写 UTF-8 文件后 `--data-binary @file`。
- `.env` 中 `KIMI_API_KEY` 未配置时，complex 任务自动回退 DeepSeek（控制台有 warning）；AI 网关 60 秒超时对长规划可能偏紧，若频繁超时可考虑调大。
- `.env` 已配置 `CRON_SECRET=dev-local-secret-2026`（本地联调值）。本机 crontab 配置（Windows 用任务计划程序或 WSL crontab，URL 前缀按部署地址替换）：
  ```
  0 8 * * * curl -s "http://localhost:3000/api/cron/classroom-push?secret=dev-local-secret-2026&mode=morning"
  0 20 * * * curl -s "http://localhost:3000/api/cron/classroom-push?secret=dev-local-secret-2026&mode=evening"
  ```
- dev server 运行期间执行 `npx prisma generate` 可能因 query engine dll 被占用报 EPERM，且可能卡死 dev server（本次出现，重启后恢复）；建议 generate 前先停 dev server。

## 7. 协作规则

1. **会话开始**：先完整阅读本文件，确认当前上下文与已完成状态。
2. **会话结束**：
   - 更新「已完成清单」，只增不减，已废弃事项用删除线标记。
   - 若目录结构有变化，更新「目录结构」与「模块划分」说明。
   - 在「待办与已知坑」中记录本次未解决但需后续跟进的事项。
3. **冲突解决**：若本文件与 `README.md`、代码注释、临时约定冲突，以本文件为准，并在本文件中记录冲突与最终决议。
