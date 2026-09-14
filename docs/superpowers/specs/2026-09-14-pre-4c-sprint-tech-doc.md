# 4C 赛前功能冲刺 —— 技术任务文档（供执行 Agent 使用）

> 生成日期：2026-09-14
> 用途：本文档是**任务分解与验收标准**，交给执行 Agent（Kimi K2.7 coding）逐项实现。
> 执行前**必须先读**：仓库根目录 `AGENTS.md`（项目长期记忆与红线）+ `docs/completed-history.md`（近期完成条目）。本文档只写增量信息，与 AGENTS.md 冲突时以代码现状为准。

---

## 0. 全局硬规范（每个任务都必须遵守）

1. **API 响应格式**：统一 `{ code, data, msg }`，成功 `code=0`、`msg=""`。
2. **AI 调用**：一律走 `src/lib/ai`（`chat({ messages, taskType, responseFormat?, module? })`，见 `src/lib/ai/index.ts`），**必须传 `module` 标注**；禁止业务代码直连 OpenAI SDK。
3. **推送**：一律走 `src/lib/push`。
4. **AI 生成内容必须经用户预览确认后才入库**，禁止业务代码自动保存 AI 输出。
5. **班级数据隔离纪律**（classroom 相关任务红线）：
   - 所有查询带 `classroomId` 条件；写操作前经 `src/modules/classroom/membership.ts` 的 `isMember`/`requireMembership`；
   - 按 id 取任务用 `findFirst({ where: { id, classroomId } })`，禁止按 id 直取；
   - 未登录访问班级页重定向 `/classroom/identity`。
6. **Cookie 读写**只允许在 Server Actions / Route Handlers。
7. **react-hooks purity**：组件体禁止直接调 `Date.now()`/`Math.random()`，非纯数据组装抽到组件外。
8. **Prisma**：SQLite 无 `String[]`，数组用 Json；schema 变更必须同步提交 migration；**migrate/generate 后必须重启 dev server**（先停再 generate，否则 query engine dll 被占用 EPERM）。
9. **测试**：纯函数逻辑（校验、归一化、日期计算、相似度）必须配 vitest 单测，参照已有 `*.test.ts` 写法。每个 Task 完成后 `npm test`、`npm run lint`（0 error）、`npm run build` 必须通过。
10. **提交粒度**：每个 Task 单独 commit；全部完成后更新 `AGENTS.md`（机制/待办变化）并在 `docs/completed-history.md` 追加完成条目。

## 0.1 当前环境要点

- `.env` 已配 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL=deepseek-flash`（DeepSeek-V4.1-Flash，**原生多模态**，API 模型名是 `deepseek-flash` 不是版本号全名）。
- 价格表 `src/lib/ai/pricing.ts` 已含 `deepseek-flash`；新增模型名时同步维护。
- `KIMI_API_KEY` 未配，complex 任务自动回退 DeepSeek（有 warning，正常）。
- Windows + Git Bash 环境：`curl -d '中文'` 会 GBK 乱码，中文 payload 写 UTF-8 文件后 `--data-binary @file`。
- 启动开发环境：`npm run start:local`（含备份+调度器，见 `scripts/start-local.sh`）。

---

## 任务总览与建议顺序

| # | 任务 | 模块 | 优先级 | 量级 |
|---|------|------|--------|------|
| T1 | 班级通知截图 AI 提取（多模态） | classroom + lib/ai | P0 | 中 |
| T2 | 图谱领域标签归一 | graph | P0 | 中 |
| T3 | 图谱 embedding/相似度候选召回（三段式对齐） | graph | P0 | 大 |
| T4 | 图谱 AI 裁决批量化 | graph | P1 | 小 |
| T5 | 陪伴目标详情页 | companion | P1 | 中 |
| T6 | 归档目标列表与恢复 | companion | P1 | 小 |
| T7 | 班级任务删除入口 | classroom | P1 | 小 |
| T8 | 邀请码过期 + 退出班级 | classroom | P1 | 小 |
| T9 | 执行中修改阶段结构 | companion | P2 | 大（有坑，见内文） |
| T10 | 图谱 pendingCleanup 清理页 + align 审阅启用 | graph | P2 | 中 |
| T11 | 背诵四档自评 UI | recite | P2 | 小 |

T3/T4 都改 `src/modules/graph/ingest.ts`，建议同一轮连续做；T7/T8 都改 classroom，同理。

---

## T1 班级通知截图 AI 提取（多模态）

**目标**：班级管理员上传班级群通知截图 → AI 识别图中文字并提取任务（标题/截止时间/平台/课程）→ 走**预览确认**流程后发布。这是答辩演示的核心亮点功能。

**现状**：`src/app/classroom/[id]/` 已有文本粘贴提取的完整链路——API 路由 `src/app/api/classroom/[id]/tasks/extract/route.ts` + 校验归一化 `src/modules/classroom/tasks.ts` + 入口/预览 UI `src/app/classroom/[id]/TaskSection.tsx`（预览确认发布）。schema 里 `ClassTaskSourceType` 枚举**已预留 `screenshot` 取值**（`prisma/schema.prisma:24-27`），无需迁移。注意 `src/modules/classroom/actions.ts` 只管身份/建班/加入/SendKey，提取逻辑不在里面。

**需求**：

1. **AI 网关支持多模态**：`src/lib/ai/index.ts` 的 `ChatMessage.content` 目前只有 `string`。扩展为允许 OpenAI 兼容的多模态 content（`ChatCompletionContentPart[]`，`image_url` 传 base64 data URL）。注意 `buildMessages()` 会把 system 消息合并进 `result[0]`（`index.ts:54-65`），改造时保持该行为且不把图片内容塞进 system。新增可选参数不破坏现有调用签名。
2. **上传与调用**：班级空间页面加"截图提取"入口，前端选图 → 压缩/缩放（最长边建议 ≤1600px，控制 token 与体积）→ base64 提交 Server Action → `chat()` 传图 + 提取 Prompt（复用/改写现有文本提取 Prompt）→ 返回结构化任务列表。
3. **预览确认**：复用现有提取预览 UI 与确认入库流程（产品底线 #4）。
4. **降级与报错**：图片过大/识别不出文字/提取不到任务时给出可读错误；`module` 标注如 `"classroom-screenshot"`。
5. **模型要求**：该功能依赖多模态，调用点可强制使用 DeepSeek（`deepseek-flash`）。若 `DEEPSEEK_MODEL` 被改成纯文本模型，应在日志/报错中体现。

**涉及文件**：`src/lib/ai/index.ts`（多模态支持）、`src/app/api/classroom/[id]/tasks/extract/route.ts`（扩展支持图片输入，或并列新增 screenshot 路由）、`src/modules/classroom/tasks.ts`（校验归一化复用）、`src/app/classroom/[id]/TaskSection.tsx`（入口）、新增预览组件（参照现有提取预览实现）。入库时 `sourceType` 置 `screenshot`。

**验收**：上传一张含 2-3 条作业通知的真实群聊截图，能正确提取并预览确认入库；`ApiLog` 有 `module=classroom-screenshot` 记录；`/dev/ai-usage` 可见；纯文本模型配置下给出友好错误而非崩溃；`npm test && npm run lint && npm run build` 通过。

---

## T2 图谱领域标签归一

**目标**：解决 AGENTS.md 标注的退化点①——`GraphNode.domain` 自由文本导致领域标签碎片化（如"机器学习"/"ML"/"机器学习基础"并存）。

**现状**：`GraphNode.domain String`（`prisma/schema.prisma:126`，有 `@@index([domain])`），由 `src/modules/graph/extract.ts` 的 AI 抽取 Prompt 产出，无约束。

**需求**：

1. **枚举词表方案**（推荐）：在 `extract.ts` 定义领域词表常量（如：数学/编程语言/机器学习/深度学习/数据结构/操作系统/计算机网络/数据库/其他），Prompt 中限定 domain 只能取词表值；`parseExtraction` 层做归一校验——不在词表的值映射到最近义项（维护小映射表）或落入"其他"。纯函数 + 单测。
2. **存量清理**：仿照 `scripts/graph-normalize-edges.mts` 写一次性脚本 `scripts/graph-normalize-domains.mts`，把存量节点的 domain 归一到词表；脚本要支持 `--dry-run` 先输出变更清单。
3. **UI 影响面检查**：图谱页筛选、成长视图（`src/app/graph/growth/`）按 domain 分组的地方确认归一后展示正常。

**涉及文件**：`src/modules/graph/extract.ts`、`src/modules/graph/extract.test.ts`（如有）、新增 `scripts/graph-normalize-domains.mts`。

**验收**：新喂入材料的 domain 全部落在词表内；存量库跑完脚本后 `SELECT DISTINCT domain` 只剩词表值；单测覆盖同义映射与未知值兜底；`npm run build` 通过。

---

## T3 图谱 embedding/相似度候选召回（三段式对齐）

**目标**：替换实体对齐的"全量内存匹配"（AGENTS.md 明确：节点破千必须改），升级为**候选召回 → 规则过滤 → AI 裁决**三段式，并用压测脚本产出对比报告（4C 设计说明书的技术难点证据）。

**现状**：`src/modules/graph/ingest.ts` 两段式：a 段本地候选（name 精确 / aliases 包含 / name 双向包含，全量内存遍历）→ b 段 AI 逐实体裁决（上下位概念不算同一概念，不确定返回 null，失败保守建新）。

**需求**：

1. **候选召回层**：新增纯函数模块（如 `src/modules/graph/candidates.ts`）：
   - 首选方案：若环境变量配置了 OpenAI 兼容 embedding 接口（自定义 `EMBEDDING_BASE_URL`/`EMBEDDING_API_KEY`/`EMBEDDING_MODEL`），用 embedding 余弦相似度召回 top-K（K 建议 10-20）；节点 embedding 存 `GraphNode.metadata` 或新字段（如需新字段走 migration）。
   - 兜底方案（必须实现，因为当前环境无 embedding 服务）：**字符 n-gram（bigram）余弦相似度**本地召回 top-K，纯函数可测。中英文混合场景注意按字/按词切分策略。
   - 召回结果与现有精确/包含规则**取并集**后再进 AI 裁决，保证召回率不低于现状。
2. **保持对齐语义红线**：上下位概念不算同一概念；不确定返回 null；AI 失败保守建新；匹配成功复用规则不变（mentionCount+1、别名并集 ≤20、主名不变）；端点不在实体表的关系仍过滤。
3. **压测对比**：重跑 `scripts/graph-stress-run.mts` / `graph-stress-eval.mts`（先读脚本用法），产出新 `graph-stress-results` 对比：对齐准确率、AI 裁决调用次数、耗时 vs 基线（仓库已有 `scripts/graph-stress-results.json`）。**报告数据要落到一份 md**（如 `docs/graph-alignment-benchmark.md`），供设计说明书引用。
4. **对齐 Prompt 补强**：按 AGENTS.md 提示加入"参数与权重应区分为不同概念"类规则（压测曾错合 1 例）。

**涉及文件**：`src/modules/graph/ingest.ts`、新增 `src/modules/graph/candidates.ts` + 单测、`src/modules/graph/extract.ts`（Prompt）、`scripts/graph-stress-*.mts`。

**验收**：n-gram 兜底召回单测通过（含中英文 case）；压测报告产出且对齐准确率不低于基线；AI 裁决调用次数明显下降；节点 1000+ 的合成数据压测不超时（无 embedding 服务时允许只测兜底路径）；`npm test && npm run build` 通过。

---

## T4 图谱 AI 裁决批量化

**目标**：b 段裁决从逐实体一次调用改为**批量裁决**（一次调用裁多个实体的候选对），降低延迟与费用。

**需求**：

1. `ingest.ts` 中把有候选的实体按批（建议每批 5-10 个）合并进一次 `chat()` 调用，Prompt 要求返回数组，逐项给出 match/null。
2. 解析失败或某项缺失时**该项保守建新**（不影响同批其他项）；保留逐条兜底重试可选。
3. 与 T3 同轮做；批量大小做成常量可调。

**验收**：压测中 AI 调用次数 ≈ ceil（有候选实体数/批大小）；批量返回部分项非法时其余项正常入库；`npm test` 通过。

---

## T5 陪伴目标详情页

**目标**：首页目标卡片可点击进入详情页，看目标全貌。

**现状**：`src/app/companion/page.tsx` 只有卡片列表 + `GoalActions.tsx`（归档/删除）；无详情路由。schema：`Goal`/`Phase`/`Task`/`WeeklyReport`（`prisma/schema.prisma:306-375`）。陪伴模块当前是本地单用户（无 userId 隔离）。

**需求**：

1. 新增路由 `src/app/companion/goal/[id]/page.tsx`：
   - 目标基本信息（标题/分类/截止/每日分钟/现状自述）；
   - 阶段（Phase）时间线与各阶段任务完成度；
   - 历史周报列表（`WeeklyReport`，倒序）；
   - 归档/删除操作入口（复用 `src/modules/companion/actions.ts` 现有 action）。
2. 首页卡片加链接；不存在的 id 用 `notFound()`。
3. 移动端优先，触摸目标 ≥44px，页面 `min-h-svh`。

**验收**：从首页点进详情页信息完整；归档/删除在详情页可用且操作后返回首页；`npm run build` 通过。

---

## T6 归档目标列表与恢复

**目标**：归档可逆。

**需求**：

1. `src/modules/companion/actions.ts` 新增 `restoreGoal`（status 归回 active）。
2. 首页（或详情页入口）加"已归档"折叠区/子页，列出 `status=archived` 目标，提供"恢复"按钮。
3. 恢复后回到正常列表；周报 cron（`src/app/api/cron/weekly-review/route.ts`）只处理 active 目标——确认现有查询已过滤，没有就补上。

**验收**：归档→恢复→再归档全流程正常；`npm test`（如有纯函数）通过。

---

## T7 班级任务删除入口

**目标**：班级任务可删除（目前无入口）。

**需求**：

1. `src/modules/classroom/actions.ts` 新增 `deleteClassTask`：
   - `requireMembership` 校验；**权限**：仅任务创建者（`createdBy`）或班级创建者（`Classroom.creatorId`）可删；
   - 查询用 `findFirst({ where: { id, classroomId } })`；
   - 删除走 Prisma delete——`TaskCompletion` 已配 `onDelete: Cascade`（`prisma/schema.prisma:89`），确认级联生效即可，无需手动清理。
2. UI：任务编辑页 `src/app/classroom/[id]/tasks/[taskId]/page.tsx` 加删除按钮 + 二次确认（可用 `<form>` + `confirm` 或简单 modal，参照项目现有确认交互）。
3. 删除后 revalidate 班级空间页并返回。

**验收**：创建者可删自己任务、班级创建者可删任意任务、普通成员看不到/调不通删除（403）；删除后任务流与完成统计同步消失；`npm run build` 通过。

---

## T8 邀请码过期 + 退出班级

**目标**：补齐邀请与成员生命周期。

**需求**：

1. **邀请码过期**：
   - `Classroom` 加字段 `inviteExpireAt DateTime?`（migration，同步提交）；建班默认有效期（如 7 天，做成常量）；
   - `src/app/classroom/[id]/InviteCodeCard.tsx` 显示过期时间，过期后提供"重新生成邀请码"按钮（新 code + 新过期时间，仅创建者/管理员可操作）；
   - 加入逻辑（`src/modules/classroom/actions.ts` join 相关）校验过期，过期返回可读错误。
2. **退出班级**：
   - 新增 `leaveClassroom`：删除 `ClassroomMember` 记录（保留其 `TaskCompletion` 历史即可，或一并清理——实现时二选一并写入 commit message）；
   - **创建者不能直接退出**（MVP 不做转让/解散，提示"创建者暂不可退出"）；
   - 退出后重定向 `/classroom/identity` 或班级入口页。
3. 全程遵守数据隔离纪律（规范 #5）。

**验收**：过期邀请码加入被拒、重新生成后可加入；普通成员可退出且退出后访问班级页被重定向；创建者退出被拒；migration 文件同步提交；`npm run build` 通过。

---

## T9 执行中修改阶段结构（P2，有坑）

**目标**：目标执行中允许调整阶段（Phase）的周数/日期范围。

**已知坑**（AGENTS.md）：改周数会连锁后续阶段日期与任务归属，易出脏数据。

**需求**：

1. 纯函数模块（如 `src/modules/companion/reschedule.ts`）输入"目标 + 修改后的阶段日期"，输出完整变更计划（受影响的 Phase、Task 的 dueDate/phaseId 迁移映射），**必须配 vitest 单测**，覆盖：缩短/延长某阶段、任务落在被删区间、跨阶段移动。
2. 变更计划先**预览确认**再落库（产品底线 #4 的精神：结构性修改给用户确认清单）；落库用一个 transaction。
3. `Task.phaseId` 是 `onDelete: SetNull`（schema 341 行附近）——删除阶段的任务不能丢，必须显式迁移到相邻阶段或目标级（phaseId=null）。
4. UI 入口放目标详情页（依赖 T5 先做）。

**验收**：单测全覆盖上述 case；一次真实调整（延长中间阶段一周）后，所有任务日期/归属正确，今日页与周视图显示一致；`npm test && npm run build` 通过。

---

## T10 图谱 pendingCleanup 清理页 + align 审阅启用

**目标**：图谱维护闭环。

**需求**：

1. **pendingCleanup 清理页**：图谱区加管理页（挂 `src/app/graph/_components/GraphTabs.tsx`），列出 mentionCount 归零被标 `pendingCleanup` 的节点（查 `ingest.ts`/`actions.ts` 里该标记的写入位置），支持：确认删除（级联清 NodeSource/边，用 transaction）、恢复（撤销标记）。
2. **align 类型 MergeReview 启用**：schema 已有 `MergeReviewType.align`（`prisma/schema.prisma:172-175`）但未使用。在 T3/T4 的批量裁决里，当 AI 返回匹配置信度不确定的场景（或规则候选与 AI 裁决分歧时）写入 `align` 类型 MergeReview，在 `src/app/graph/review/` 审阅队列中展示并支持人工裁决（批准合并/拒绝），批准路径执行与自动合并一致的复用逻辑。
3. 审阅操作全部走 `src/modules/graph/actions.ts` 风格的新 action。

**验收**：删来源导致 mentionCount 归零的节点出现在清理页，删除后图数据无孤儿边；align 队列能产出并裁决；`npm run build` 通过。

---

## T11 背诵四档自评 UI

**目标**：复习页从两档自评升级为四档（DB/API 已保留四档）。

**需求**：`src/app/recite/review/` 页面把两档按钮改为四档（如：重来/困难/良好/简单），映射到现有 API 的四档取值（先读 `src/modules/recite/scheduler.ts` 与 review API 确认枚举）；移动端四个按钮均 ≥44px 触摸目标。

**验收**：四档提交后调度结果符合 `scheduler.ts` 逻辑（已有单测应仍通过，必要时补 case）；`npm test` 通过。

---

## 附：全局验收（全部 Task 完成后）

1. `npm test`、`npm run lint`（0 error；既有 2 个 warning 在 `src/modules/classroom/actions.ts:218-219`，不新增即可）、`npm run build` 全绿。
2. 真机冒烟：`npm run start:local` 启动后手机同 Wi-Fi 访问局域网地址，过一遍：打卡、班级截图提取（T1）、图谱喂入+图页、目标详情页（T5）。
3. 更新 `AGENTS.md`：§4 图谱机制（三段式对齐、domain 词表）、§6 能力概览、§7 待办清单划掉已完成项；`docs/completed-history.md` 追加本次冲刺条目。
