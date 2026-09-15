# 已完成清单完整历史

> 2026-09-07 起 AGENTS.md 只保留「当前能力概览」，详细完成记录统一追加到本文件（替代原「只增不减」写在 AGENTS.md 里的做法）。

## 2026-09-15（4C 冲刺 T11：背诵四档自评 UI）

- [x] 新纯函数模块 `src/modules/recite/rating-options.ts`：`buildRatingOptions(card)` 按 forgot/hard/good/easy 顺序生成四档自评按钮展示数据（label 重来/困难/良好/简单 + hint 下次复习间隔），每档 hint 取自 `scheduleReview` 真实输出（≤1 天显示「明天再见」，其余「N 天后再见」，顶档钳位 30 天）；复习页按钮展示与调度结果天然一致。5 个 vitest 用例（`rating-options.test.ts`：顺序/文案、新卡四档提示、入档卡四档提示、顶档钳位、逐档与 scheduleReview 一致性）。
- [x] 复习页 `/recite/review` 两档自评升级四档：`grid grid-cols-2 gap-3 sm:grid-cols-4`（移动端 2×2，sm 以上四列横排），按钮 `py-4` + label/hint 双行 ≈74px ≥44px 触摸目标；配色 rose→amber→emerald→sky 渐进；`ReviewResult` 类型直接复用 scheduler 导出（删掉页面本地两档 type）；调度逻辑零改动。
- [x] 完成总结页口径不变：forgotCount 只统计「重来」，困难/良好/简单均算记住（hard 不下调阶梯只是保持当前档）。
- [x] 端到端验证（`next start` + HTTP）：复习页 200 渲染（Suspense 骨架正常），客户端 chunk 含四档文案与间隔提示；四档各做一次真实 POST `/api/recite/review`（easy/hard/forgot/good 覆盖脏数据 interval=3 取档、保持当前档、重置第 1 档、阶梯推进四种路径），独立 tsx 脚本按 scheduler.ts 逐字段断言 4 项全 PASS（含 nextReviewAt 天级核对），ReviewLog 4 条落库确认；验收后 dev.db 还原基线（还原后复查卡片状态与历史日志均回到测试前）、taskkill 杀净 node 子进程。
- [x] `npm test` 112 用例全过（scheduler 16 用例原样通过）、`npm run lint` 0 error（仅存量 2 warning）、`npm run build` 通过。AGENTS.md §3/§6/§7 同步（「两档自评」→四档、删「API/DB 保留四档」待办）。

## 2026-09-15（4C 冲刺 T10：图谱 pendingCleanup 清理页 + align 审阅启用）

- [x] **pendingCleanup 清理页** `/graph/cleanup`：挂入 GraphTabs（桌面顶部 + 移动端底部，🧹 清理）。标记存储形式确认为 `metadata.pendingCleanup: true` + 本次新增 `pendingCleanupAt`（ISO 时间，`deleteSourceAction` 归零时写入）。页面 `force-dynamic`（管理页数据随时变，避免构建期静态快照）；`mentionCount=0` 库内收窄 + 内存过滤。`deleteCleanupNodeAction` 事务内二次校验标记后删除（GraphEdge/NodeSource 外键 `onDelete: Cascade` 自动级联，验收实测 0 孤儿边）；`restoreCleanupNodeAction` 撤销标记 + mentionCount 重置 1（UI 文案明示）。
- [x] **align 类型 MergeReview 启用**（原 schema 枚举闲置项）：判定纯函数在 `adjudicate.ts`（克制宁可少报）——AI 已合并不报；**规则精确命中（name/别名）但 AI 拒绝 = 人机分歧必报**；AI reason 含不确定信号（不确定/无法确定/难以判断/存疑/疑似同一/可能是同一/分歧）才报；confident 拒绝（上下位/参数≠权重等）不报。批量 Prompt 新增第 5 条引导 AI 对证据不足的项返回 match:null + reason 带不确定词。`resolveAlignSuggestion` 提名建议并入节点（精确命中优先，否则候选首个），payload 带 newNodeId/entity 快照/aiReason/来源，与入库同事务写入；`IngestResult` 新增 `alignReviews` 计数（additive，接口兼容）。
- [x] **重名守卫**（e2e 暴露的真实 bug）：AI 拒绝同名候选时直接 create 会撞 `GraphNode.name @unique` 导致整篇 ingest 500 且审阅随事务回滚——现改为：已标 align 待审且同名节点存在时跳过创建（newNodeId=null），相关关系按端点缺失跳过；批准合并回退用 payload 实体快照执行复用逻辑（mentionCount+1、别名并集≤20、主名不变），拒绝=不入库。
- [x] **人工裁决** `resolveAlignReviewAction`（approve/reject）：批准在单事务内完成——别名并合（复刻 ingest 复用逻辑）→ 新建节点出边/入边迁移（同三元组 weight 累加、自环删除）→ NodeSource upsert 迁移 → 删新建节点 → 目标 mentionCount+1；拒绝仅置 status 维持新建。审阅页 `/graph/review` 分「🤔 合并存疑 / ⚡ 关系冲突」两区（conflict 原逻辑不动）。
- [x] 端到端验证（`next start` + HTTP/直调混合，24 项全 PASS）：同名分歧 ingest 不崩溃且产出 2 条 align 待审（参数⇒权重为真实管线产出；训练集重名走 newNodeId=null 路径）；批准路径权重 mentionCount 1→2、别名并入「参数」、优化器→参数边迁移为 优化器→权重、NodeSource 2 条、0 孤儿边；拒绝路径节点各自独立；删来源→两节点标记→清理页 HTML 列出→确认删除 0 孤儿边→恢复 mentionCount=1 标记清除。验收后 taskkill 杀净 node 进程、dev.db 还原基线。
- [x] 单测：`adjudicate.test.ts` 新增 4 组 align 判定用例（信号词/提名/必报/克制拒绝），全量 107 用例过；lint 0 error；build 过。AGENTS.md §4/§6/§7 同步（划掉「align 未使用/pendingCleanup 无清理页」待办）。

## 2026-09-15（4C 冲刺 T5：陪伴目标详情页）

- [x] 纯函数模块 `src/modules/companion/goal-detail.ts`：`buildGoalDetail`/`buildPhaseRows`/`buildReportRows`/`normalizeRiskLevel` + 风险等级样式表 `RISK_LEVEL_STYLES`（与 plan 页共用，PlanClient 删本地重复定义）；页面层只查库，展示组装全部可测（8 单测）。
- [x] 日期纯函数归位：`toISODate`/`startOfWeek`/`daysUntil`/`weekdayLabel` 从 stats.ts 移至 plan.ts（stats.ts 重导出保持既有 import 路径），消除纯函数对 prisma 的传递依赖，纯模块可被 vitest 直接测。
- [x] 页面 `/companion/goal/[id]`：基本信息（标题/类别/截止/剩 N 天/每日分钟/创建于/累计进度条）、现状自述 + AI 差距评估（metadata.assessment）、阶段时间线（当前阶段高亮、past/current/upcoming 圆点、各阶段完成度 done/total · %）、历史周报倒序（风险灯 + 周标签 + 完成率 + 摘要 + 调整建议）、`GoalActions` 归档/删除（操作后返回首页）；不存在 id `notFound()`；入口「本周计划与打卡」跳 plan 页。
- [x] `GoalActions.tsx` 增加可选 props：`archived`（已归档目标隐藏归档按钮，详情页显示「已归档」角标）、`afterActionHref`（操作完成跳转，详情页传 `/companion`）；首页不传，行为不变。
- [x] 首页 `/companion` 目标卡片：标题链接 + 底部「查看详情 →」入口（触摸目标 ≥44px）。

## 2026-09-15（4C 冲刺 T6：归档目标列表与恢复）

- [x] `src/modules/companion/actions.ts` 新增 `restoreGoalAction`（status archived→active + `revalidatePath("/companion")`），与归档/删除同风格。
- [x] 首页 `/companion` 底部新增「已归档目标（N）」折叠区（`ArchivedGoals.tsx`，默认收起）：列出归档目标（标题/类别/截止），「恢复」按钮沿用 GoalActions 二次确认模式（恢复后回到进行中列表），触摸目标 ≥44px；渲染独立于进行中列表空态——唯一目标归档后也能在首页恢复。
- [x] 周报 cron `GET/POST /api/cron/weekly-review` 核对：查询本就 `where: { status: "active" }`，只处理进行中目标，无需改动。
- [x] 端到端验证（`next start` + HTTP 直调 Server Action）：归档→恢复→再归档→再恢复全流程 DB 状态与页面渲染（进行中列表/已归档折叠区/详情页已归档角标）全部正确，DB 还原为初始状态。

## 2026-09-15（4C 冲刺 T7：班级任务删除入口）

- [x] `src/modules/classroom/actions.ts` 新增 `deleteClassTaskAction(classroomId, taskId)`：`requireMembership` 先校验成员（非成员 `forbidden()` 403）→ `findFirst({ where: { id, classroomId } })` 取任务（禁止按 id 直取，`include` 带出 `Classroom.creatorId` 一次查全）→ 权限：仅任务录入人（`createdBy`）或班级创建者（班长）可删，否则返回可读错误 `{ error }`；`prisma.classTask.delete` 删除，`TaskCompletion` 靠 schema `onDelete: Cascade` 级联清理（无需手动）；`revalidatePath("/classroom/[id]")`。
- [x] 任务编辑页 `/classroom/[id]/tasks/[taskId]`：页面层计算 `canDelete`（录入人/班长），普通成员不渲染删除入口（页面按钮与 action 双层拦截）；新增 `TaskDeleteButton.tsx`（GoalActions 首点确认态模式：首点「删除任务」→ 内联确认条「确认删除/取消」+ 后果提示文案，按钮触摸目标 ≥44px，删除后 `router.push` 回班级空间页）；错误以红条内联展示。
- [x] 端到端验证（`next start` + HTTP 直调 Server Action，DB 备份/还原）：录入人删自己任务 ✓、班长删任意成员任务 ✓、普通成员直调 action 返回可读错误且页面无删除按钮 ✓、删除后班级空间任务流消失且 `TaskCompletion` 级联清零 ✓。
- [x] AGENTS.md §7 待办「班级任务无删除入口」移除，§6 班级能力概览补「任务编辑/删除（仅录入人或班长可删，二次确认）」。

## 2026-09-15（4C 冲刺 T8：邀请码过期 + 退出班级）

- [x] 迁移 `20260915052020_add_classroom_invite_expire`：`Classroom` 新增 `inviteExpireAt DateTime?`（null = 永久有效，兼容存量数据），migration 文件同步生成。
- [x] 新纯函数模块 `src/modules/classroom/invite.ts`：导出常量 `INVITE_EXPIRE_DAYS = 7`、`inviteExpireAtFrom(now)`、`isInviteExpired(expireAt, now)`（now 入参以兼容 react 纯度 lint）；5 个 vitest 用例（`invite.test.ts`）。
- [x] 建班/重新生成邀请码统一默认 7 天有效期（`createClassroomAction` 与 `regenerateInviteCodeAction` 同用 `inviteExpireAtFrom`）；`regenerateInviteCodeAction(classroomId)` 仅班级创建者可操作（新 code + 新有效期，邀请码唯一索引冲突换码重试 3 次，复用建班逻辑）。
- [x] 加入过期校验三处共用一个 helper：`joinClassroomAction`（表单）返回可读错误「邀请码已过期，请联系班长重新生成」；`joinByInviteCodeAction`（邀请链接）与 `createIdentityAction`（建身份自动入班）重定向 `/classroom?error=invite-expired`，列表页渲染对应红色横幅。
- [x] UI：`InviteCodeCard` 显示有效期（`有效期至 xxxx/x/x` / 过期红字提示「同学无法通过它加入」）；过期且为班长时提供「重新生成邀请码」按钮（首点确认态，提示旧码立即失效），非创建者不渲染；`LeaveClassroomButton`（班级空间页底部，非创建者可见，二次确认 + 后果提示，触摸目标 ≥44px）。
- [x] `leaveClassroomAction(classroomId)`：`requireMembership` → 创建者返回可读错误「创建者暂不可退出」（MVP 不做转让/解散）→ 删除 `ClassroomMember`；**TaskCompletion 历史保留不清理**（任务完成记录是班级共享数据，个人退出不影响历史统计——二选一取保留）；退出后跳 `/classroom` 列表页。
- [x] 端到端验证（`next start` + HTTP 直调 Server Action，测试行已清理）：过期邀请码加入被拒（重定向 invite-expired 横幅渲染 ✓）、非创建者重新生成被拒、班长重新生成后新码 7 天有效且可用其加入 ✓、创建者退出被拒、普通成员退出后班级页 403 且其 TaskCompletion 保留 ✓；`npm test` 93/93、lint 0 error、build 通过。
- [x] AGENTS.md §7 待办「邀请码无过期/退出班级」移除，§3/§6 同步班级模块职责与能力概览。

## 2026-09-15（4C 冲刺 T9：执行中修改阶段结构）

- [x] 新纯函数模块 `src/modules/companion/reschedule.ts`：`planReschedule(phases, tasks, newWeeks)` 输出完整变更计划（阶段新 startDate/endDate + 任务 dueDate/phaseId 迁移映射，含中文 reason）；规则：锚定首阶段现有开始日按新周数连续排布（与 computePhaseDates 同约定）、任务保留 dueDate 按新区间重挂 phaseId、越界任务收敛到首/末阶段边界日（绝不丢任务/置空 phaseId）、phaseId 本就 null 的任务不动；`toReschedulePreview` 转可序列化确认清单（MM/DD 区间 + 统计数）；`phaseWeeks` 取现有周数。10 个 vitest 用例覆盖：延长/缩短中间阶段、连锁平移、被删区间任务迁移、越界收敛（首/末）、跨阶段移动、边界日（末天含/次日）、零变更、乱序输入、非法周数校验、null 任务不动。
- [x] Server Actions（`actions.ts`）：`previewRescheduleAction`（只算不落库）与 `applyRescheduleAction`（transaction 内更新全部阶段日期 + 任务改期/迁移，落库时重算计划——与预览同一纯函数；revalidate 详情页/plan/today 三路径）。
- [x] UI（详情页阶段时间线头部「调整阶段」入口，`[id]/ReschedulePanel.tsx`，仅 active 目标）：各阶段周数输入 → 「生成变更计划」→ 确认清单（X 个阶段日期变更 · Y 个任务改期 · Z 个任务变更归属，逐阶段旧→新区间、逐任务改期/归属/reason，零变更禁用落库）→ 「确认落库」；编辑即作废旧预览防脏确认；触摸目标 ≥44px，组件体无 Date.now 等非纯调用。
- [x] 端到端验证（`next start` + HTTP 直调 Server Action，临时任务验后删、DB 还原）：P2 6→7 周预览正确（P2 10/06~11/23、P3 连锁 +7、P3 区间任务迁移到 P2、日期不变）；落库后 DB 精确符合计划、14 个既有任务零变动；plan 页阶段区间/详情页时间线显示新日期；today 页可见内容与调整前逐字一致（仅 flight 流内部偏移不同）；回滚 [4,6,4] 后阶段日期与初始快照完全一致。
- [x] AGENTS.md §7 待办「执行中修改阶段结构未做」移除，§3 模块职责加 reschedule.ts，§6 陪伴概览补「执行中调整阶段结构」。

## 2026-09-13（部署自用包）

- [x] 周报生成逻辑抽为 `src/modules/companion/weekly-report.ts` 的 `generateWeeklyReport(goalId)`（route 薄壳化，行为不变）。
- [x] cron 端点 `GET/POST /api/cron/weekly-review?secret=`：遍历 active 目标自动生成周报（已生成/无任务跳过，单目标失败不阻塞），下周任务仍手动确认入库。
- [x] 备份：`scripts/backup.mts`（VACUUM INTO 在线备份 → `backups/`，保留 14 份）+ 纯函数 `pickBackupsToDelete`（3 单测）。
- [x] 本地调度器 `scripts/scheduler.mts`（替代系统 cron）：班级早晚推送/背诵提醒/周日周报/每日备份；`--now` 立即全量调试；纯函数 `matchesSchedule`（4 单测）。
- [x] 最小 PWA：`public/sw.js`（network-only）+ 生产环境注册组件挂根 layout；HTTP 局域网降级为主屏书签。
- [x] 今日打卡乐观更新（useOptimistic，失败自动回滚+提示）；`/companion/today` 加载骨架。
- [x] `npm run start:local`（`scripts/start-local.sh`：next start 0.0.0.0 + 调度器，Ctrl+C 同退）；README 重写为项目说明+自用部署小节。
- [x] tsconfig 修复：`allowImportingTsExtensions: true`（87755bd），否则 `.mts` 脚本带扩展 import 使 `next build` 类型检查 TS5097 失败。
- [x] 乐观更新 reducer 单测 `src/app/companion/today/apply-optimistic-action.test.ts`（3 例：标记完成重排+备注、撤销清空备注、缺省保留原备注）。

## 2026-09-07（图谱边归一 + 计划对话式调整）

- [x] 图谱边归一（防边碎片化）：extract Prompt 增加标准动词表（是/包含/属于/导致/源于/解决/应用于/促进/抑制/需要/组成/使用/提升/降低）并要求短动词；`parseExtraction` 统一走 `normalizeRelation`（RELATION_SYNONYMS 同义映射 + INVERSE_RELATIONS 互逆方向归一〔属于→包含、源于→导致，端点对调〕+ 噪音词过滤〔与/相比/示例/相关…〕+ 批内三元组去重），预览与入库、清理脚本共用同一出口；存量清理脚本 `scripts/graph-normalize-edges.mts`（删噪音边 3 条、改写互逆/近义方向 15 条；冲突检测的 OPPOSITE_RELATIONS 基于归一后动词，误报减少）。
- [x] 计划对话式调整（预览期）：API `POST /api/companion/revise-plan`（草稿+指令→AI 返回完整修订计划，复用 parsePlan 校验出入参，不入库）；预览页底部「对话式调整」指令框，支持多轮（历史存 sessionStorage 随草稿）与「撤销上一次调整」，手动编辑会清空撤销栈；产品底线不变（调整后仍是预览，确认才入库）。
- [x] 计划执行中手动调整：`PATCH /api/companion/tasks/[taskId]` 扩展 title/detail/estMinutes/dueDate（改期自动按到期日重挂阶段，打卡语义不变）；同路由新增 `DELETE` 删任务；`POST /api/companion/tasks` 手动新增单条任务；周计划页任务标题可点进编辑页 `/companion/plan/tasks/[taskId]`（改内容/改期/删除，复用打卡 API），底部「+ 手动添加任务」内联表单。
- [x] 周报下周计划 AI 调整：API `POST /api/companion/revise-week-tasks`（任务数组+指令→修订数组，不入库）；周计划页下周任务预览区加「AI 调整」指令框，本地 override 后「确认入库」用修订版任务。
- [x] AI 用量按模块统计：`ApiLog` 增加 `module` 字段（迁移 `20260906170000_add_apilog_module`），`chat()` 新增 `module` 选项写入日志；8 个调用点全部标注（制卡/备考计划/今日总结/备考周报/图谱抽取/实体对齐/任务提取/调试）。
- [x] 页面 `/dev/ai-usage`：总览卡片（调用数/token/输入输出/估算费用）、近 30 天每日消耗柱状图（echarts bar 按需引入）、按功能模块、按模型（含均耗时与费用估算）；价格表为 `src/lib/ai/pricing.ts`（元/百万 token，仅本地估算，厂商调价后需手工更新）。
- [x] 首页 `/` 底部新增「AI 用量与费用」入口链接。
- [x] 陪伴模块目标管理：目标卡片支持归档（status=archived，数据保留、列表隐藏）与删除（级联删阶段/任务/周报，二次确认）；`src/modules/companion/actions.ts`（deleteGoalAction/archiveGoalAction）+ `src/app/companion/GoalActions.tsx`。

## 2026-09-06（图谱模块 + 压测）

- [x] 图谱模块数据层：`Source`（sourceType 枚举 text/url/screenshot/pdf，本期仅 text）、`GraphNode`（aliases 存 Json 数组——SQLite 无标量数组，迁 PG 可换 String[]；name 唯一）、`GraphEdge`（from+to+relation 唯一，weight 去重累加）、`NodeSource`（nodeId+sourceId 唯一溯源）、`MergeReview`（type align/conflict，status pending/approved/rejected）。迁移 `20260906110000_add_graph_models`。
- [x] API `POST /api/graph/extract`：AI（simple+json）按指定 Prompt 抽取 domain/entities/relations，`parseExtraction` 校验并过滤端点不在实体表的关系。
- [x] API `POST /api/graph/ingest`：事务内两段式实体对齐 + 关系去重 + NodeSource 溯源 + 冲突写 MergeReview，返回新增/复用节点数、新增边数、冲突数、对齐明细。
- [x] 页面 `/graph/import` 喂入页：标题+大文本域 → 提炼 → 预览（领域标签、实体/关系可删、删除实体后受影响关系自动灰化提示）→ 确认入库 → 合并结果摘要（新增X/复用Y/新增Z + 冲突跳转审阅）。
- [x] API `GET /api/graph/data?domain=`：节点 symbolSize 按 mentionCount 映射 20-60，边带 relation 与 weight；>200 节点只回 mentionCount≥2（临时策略，有注释）；统计数字与领域列表。
- [x] API `GET /api/graph/node/[id]`：节点详情（别名/摘要/提及数/关联边含邻居名与方向/来源溯源列表）。
- [x] 页面 `/graph` 力导向图：ECharts 按需引入（echarts/core + GraphChart + CanvasRenderer），节点拖拽/缩放/点击抽屉、边 label 默认隐藏 hover 显示、领域图例自动配色、领域筛选下拉、搜索定位高亮、统计数字、空态「去喂入第一篇知识」引导。
- [x] 节点详情底部抽屉：名称/别名/解释/提及次数/关联知识点（可点击跳转高亮）/来源列表（展开看原文片段）。
- [x] 页面 `/graph/sources` 列表与 `/graph/sources/[id]` 详情：提炼快照（Source.metadata）、关联节点、原文与溯源片段；删除来源（mentionCount-1，归零标 pendingCleanup，节点边保守保留）。
- [x] 页面 `/graph/review` 审阅队列：pending 冲突（新旧关系对比+来源+依据），三选一裁决（保留旧/采用新/共存+备注）。
- [x] 页面 `/graph/growth` 成长视图：三张大数字卡片、近 30 天喂入/新增柱状图、领域分布饼图（echarts bar+pie 按需引入）。
- [x] 图谱模块底部 tab 导航 `GraphTabs`（图谱/喂入/来源/成长；移动端固定底部、桌面顶部横排）。
- [x] 首页 `/` 图谱卡片角标「N 知识点 · 本周 +M」（空图谱不显示）。
- [x] 图谱全流程走查通过：两篇同领域文章相同概念正确合并（mentionCount=2、别名并入、重复边 weight+1）、溯源片段正确、冲突进审阅队列并裁决成功。
- [x] 压测脚本 `scripts/graph-stress-*.mts`：16 篇混域喂入验证合并策略。

**图谱压测结论（2026-09-06，16 篇=12 深度学习+4 跨领域）**：

- 管线 16/16 成功；101 实体、83 关系；91 节点、91 边。
- **合并机制正确率 100%**（7 次对齐决策全部正确：CNN→卷积神经网络、LSTM→长短期记忆网络等），另有 1 例错合「参数⇒权重」（1/24≈4%），可在对齐 Prompt 加"参数与权重应区分"。
- 抽取覆盖率是主要损耗：2 次"应复用未复用"实为 AI 抽取时漏掉了实体（对齐没机会跑），非对齐失败。
- **已确认退化点①：领域标签碎片化**——12 个 domain 中 6 个是同领域变体（机器学习/深度学习/人工智能/计算机/计算机视觉 + 斜杠复合标签）。调优方向：domain 也走对齐（归一表或 AI 归一），或 extract Prompt 限定领域枚举。
- **已确认退化点②：关系粒度碎**——36 种动词，含"与/相比/示例"等非关系词和"使用/使用了"近义。已实施（2026-09-07）：extract Prompt 标准动词表 + normalizeRelation（同义映射/互逆归一/噪音过滤/批内去重）+ 存量清理脚本；存量 84 边清理后 81 条（删噪音 3、改写方向 15，真语义多边保留）。
- 孤立节点 16%（健康线内）；冲突 0 误报；跨领域 4 篇 0 错连、独立成块（健身营养/历史/咖啡/英语各自聚簇）。
- mention 分布健康：卷积神经网络×4、学习率×3、梯度消失×3 等核心概念随喂入增长。

## 2026-09-05（班级模块）

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

## 2026-09-04（陪伴模块）

- [x] 陪伴模块数据库层：`Goal`、`Phase`、`Task`、`WeeklyReport` 模型及枚举（`GoalCategory` exam/project/habit、`GoalStatus` active/done/archived、`TaskStatus` pending/done/skipped），迁移文件 `20260904154226_add_companion_models`，全部预留 `metadata Json`；Task.phaseId 可空（阶段删除置 Null），Goal/Phase 级联删除。
- [x] `src/modules/companion/plan.ts`：计划校验与日期纯函数（`parsePlan`/`computePhaseDates`/`computeTaskDueDate`/`parseDateOnly`）。
- [x] API `POST /api/companion/generate-plan`：入参 `{ title, category, deadline, dailyMinutes, userContext }`，走 AI 网关（taskType `complex`、responseFormat `json`）生成差距评估 + 阶段划分 + 第一周任务，仅返回不入库。
- [x] API `POST /api/companion/goals`：预览确认后入库，服务端复用 `parsePlan` 校验；事务内创建 Goal（assessment 存 `metadata`）+ Phases（startDate 从今天按 weeks 累推，exitCriteria 存 `metadata`）+ 第一周 Tasks（dueDate=今天+(day-1)，挂到第一阶段），返回 `{ goalId }`。
- [x] 页面 `/companion` 陪伴模块首页：无目标时显示「开始一个新目标」引导；有目标时显示卡片（标题、类别、倒计时天数、本周进度条、今日任务数与完成情况）。
- [x] 页面 `/companion/new` 两步向导：第 1 步目标名称/类别/截止日期/每日分钟数，第 2 步现状自述（带四级示例引导语），提交调 generate-plan，计划经 sessionStorage（key `companion:planDraft`）传给预览页。
- [x] 页面 `/companion/new/preview` 计划预览：差距评估、阶段划分（阶段名可编辑，显示推算的起止日期）、第一周任务（title/detail/minutes 可编辑、可删除），「确认开始」入库后跳转 `/companion`；无草稿时引导回 `/companion/new`。
- [x] 【记忆包机制】`src/modules/companion/memory.ts`：`assembleContext(goalId)` 组装「目标信息+当前阶段+最近 3 次打卡+本周完成率」结构化文本。
- [x] `src/modules/companion/stats.ts`：周一为起点的 `startOfWeek`、`getWeekTasks`、`getCheckInStreak`（连续打卡天数）、`toISODate`/`daysUntil`/`weekdayLabel`；`/companion` 首页与周视图共用。
- [x] API `PATCH /api/companion/tasks/[taskId]`：任务打卡，body `{ status: done|skipped|pending, resultNote? }`；done 记 `doneAt`，pending 撤销时清空备注与 doneAt。
- [x] API `POST /api/companion/daily-feedback`：按 goalId 汇总今日任务完成情况，注入记忆包调 AI（taskType `simple`）生成今日总结，仅返回不入库。
- [x] 页面 `/companion/today` 今日任务：按目标分组显示今日任务（pending 排前），每项可「完成打卡/跳过」（可填结果备注/跳过原因）、已完成项可撤销、圆形复选框快捷打卡；底部「生成今日总结」按钮显示 AI 反馈。
- [x] API `POST /api/companion/weekly-review?goalId=`：汇总本周任务（完成率、各任务 resultNote、连续打卡天数），注入记忆包调 AI（taskType `complex`）按指定 Prompt 生成周报；`WeeklyReport` 立即入库（riskLevel 与 nextWeekTasks 存 `metadata`），同周重复生成返回 409。
- [x] API `POST /api/companion/tasks/batch-create`：body `{ goalId, weekStart: 'YYYY-MM-DD', tasks:[{day,title,detail,minutes}] }`，dueDate=weekStart+(day-1)，自动挂接到期日所在阶段；该周已有任务时返回 409 防重复入库。
- [x] 页面 `/companion/plan` 周视图：阶段总览（当前阶段高亮）、本周任务日历（周一~周日分组、今天高亮、已完成打勾/跳过灰化、备注内联显示）、周报区（进度风险灯 绿/黄/红 + 周报卡片 + 下周计划确认入库按钮，已入库显示 ✓）；多目标时顶部切换（`?goalId=`）。
- [x] 首页 `/` 陪伴模块卡片显示角标「剩 N 天 · 今日 x/y」（取最近截止的 active 目标 + 所有 active 目标今日任务完成数）；`ModuleCard` 新增 `badgeText` 自定义角标支持。
- [x] `/companion` 首页新增「今日任务」「周计划与周报」两个快捷入口卡片（今日任务入口带完成数摘要）。

## 2026-09-01~03（背诵模块 + 基础设施）

- [x] 项目初始化（Next.js App Router + TypeScript + Tailwind CSS）、目录结构搭建、Prisma 初始化、四模块入口占位页面、`/api/health`。
- [x] 统一 AI 网关 `src/lib/ai/`（DeepSeek 默认、Kimi 复杂任务、OpenAI 兼容、60 秒超时、失败重试 1 次）；`ApiLog` 模型记录 token 用量与耗时；`GET /api/admin/ai-stats`；开发调试页面 `/dev/ai-test`。
- [x] 统一推送网关 `src/lib/push/`（Server 酱 Turbo、`PushChannel` 抽象、`pushToUser` 入口、失败不阻塞业务）；开发调试页面 `/dev/push-test`。
- [x] 背诵模块数据库层：`Material`、`Card`、`ReviewLog` 模型及枚举，迁移 `20260901102816_add_recite_models` + 常用查询索引；种子脚本 `prisma/seed.ts`（`npx prisma db seed`）。
- [x] 制卡链路：`/recite/import` 文字录入 → AI 制卡 → 预览确认 → 批量入库；`POST /api/recite/generate-cards`（不入库）、`POST /api/recite/cards/batch-create`（仅保存勾选）、`DELETE /api/recite/cards/[cardId]`；`/recite/materials` 列表与 `/recite/materials/[id]` 详情/删除。
- [x] 复习调度算法 `src/modules/recite/scheduler.ts`：艾宾浩斯阶梯 `[1,2,4,7,15,30]`，四档自评（forgot/hard/good/easy）状态流转，mastery 进阶规则，纯函数；vitest 单元测试 16 个用例（`npm test`）。
- [x] 迁移 `20260902015423_add_card_good_streak`：`Card` 增加 `goodStreak` 字段支持连续 good/easy 计数。
- [x] API `GET /api/recite/today`（今日待复习 + 每日上限 10 张新卡，`materialId`/`dailyNewCardLimit` 参数）；`POST /api/recite/review`（调度更新 + `ReviewLog`）；`/recite/review` 卡片流页面（进度条/挖空/判断/默写/自评/总结页）。
- [x] 首页 `/` 背诵卡片今日待复习角标；`/recite` 入口导航页；移动端样式统一（≥44px 触摸目标、`min-h-svh`、spinner）。
- [x] 复习页「查看背诵原文」折叠区、挖空可输入、两档自评（forgot/good，四档数据保留可恢复）、自评按钮标注后果、每日新卡上限 5/10/20 可调、新旧卡混合排序（`interleaveDueAndNew`）。
- [x] `src/modules/recite/stats.ts` + `GET /api/recite/stats`（累计复习次数与连续天数，按本地自然日去重）；入口页与完成页展示。
- [x] 材料详情页：掌握度分布（new/learning/familiar/mastered）、每张卡遗忘次数与下次复习日期、「重置复习进度」（核心逻辑 `src/modules/recite/actions.ts` 的 `resetCardsProgress`，`/dev/reset-today` 复用）。
- [x] 定时复习提醒：`src/modules/recite/reminder.ts` + `GET/POST /api/cron/daily-reminder`（需 `CRON_SECRET`）；入口页手动推送按钮。
- [x] 按材料复习链路（`materialId` 透传）；统一返回导航 `BackLink`；修复首页背诵角标匹配条件；修复 `.env` 中 `DATABASE_URL` 为相对路径（`file:./dev.db`）。
