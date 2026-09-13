# 子项目 1「部署自用包」设计文档

> 日期：2026-09-13
> 背景：为 4C 大赛（2027 第 20 届，目标国奖）做准备。总路线图三波：**①先用起来（本文档）** → ②边用边修 + 图谱亮点（领域归一 / embedding 三段式检索）→ ③演示与补全（OCR 截图提取等）。
> 目标：让 app 进入作者日常生活，开始积累真实使用数据；部署形态为**本地生产模式**（`next build && next start` 常驻本机，手机同 Wi-Fi 经局域网 IP 访问），所有脚本与文档按「将来可平移到云服务器」标准编写。

## 1. 使用场景与效果（验收基准）

- 电脑开机后一条命令启动 app + 调度器，后台常驻。
- 手机（鸿蒙，华为浏览器）连家中 Wi-Fi，访问 `http://<局域网IP>:3000`，可「添加到主屏幕」当图标用（HTTP 下为书签形态，HTTPS 后自动升级为完整 PWA）。
- 微信（Server酱）定时收到：08:00 班级早推送、20:00 班级晚推送、20:30 背诵复习提醒。
- 周日 21:00 自动生成所有 active 目标的周报，次日打开 app 可见。
- 每天凌晨数据库自动备份，保留最近 14 份。

## 2. 调度器 `scripts/scheduler.mts`

Windows 本地无 cron 守护进程，新增独立调度脚本（tsx 运行，不引入新依赖、不改 app 本体）：

- 时间表（本地时间）：
  - 08:00 `GET /api/cron/classroom-push?secret=$CRON_SECRET&mode=morning`
  - 20:00 `GET /api/cron/classroom-push?secret=$CRON_SECRET&mode=evening`
  - 20:30 `POST /api/cron/daily-reminder?secret=$CRON_SECRET`（背诵提醒，沿用现有端点约定）
  - 周日 21:00 `GET /api/cron/weekly-review?secret=$CRON_SECRET`（新增端点，见 §4）
  - 每日 03:30 触发备份（见 §3）
- 实现：每分钟 tick 一次，对比「时:分」触发；同一分钟去重防重复触发；每次请求打印结果日志（成功/失败 + msg）。
- 目标地址从环境变量读（默认 `http://localhost:3000`），secret 从 `.env` 读（`CRON_SECRET`）。
- 容错：单次请求失败只记日志不崩溃；app 未启动时请求失败静默重试下一周期。
- 将来上云服务器后，该脚本被系统 crontab 替代，app 侧 cron 端点不变。

## 3. 备份脚本

- 新增 `scripts/backup.mts`：用 Prisma 执行 `VACUUM INTO '<path>'`（SQLite 原生在线备份，对 WAL 安全），输出 `backups/dev-YYYYMMDD-HHmm.db`。
- 保留策略：备份后清理 `backups/` 目录，只留最近 14 份（按文件名日期排序删除最旧）。
- `backups/` 加入 `.gitignore`。
- 由调度器每日 03:30 调用（调度器 import 备份函数直接执行，不经 HTTP）。

## 4. 周报自动触发端点

- 新增 `GET /api/cron/weekly-review?secret=`：校验 `CRON_SECRET`（与现有 cron 端点一致）。
- 逻辑：遍历所有 `status=active` 的 Goal，对每个 goal 复用现有周报生成逻辑（`weekly-review` API 内的核心函数抽出来复用），本周已存在 WeeklyReport 则跳过该 goal。
- 返回 `{ code, data: { generated: n, skipped: n }, msg }`。
- **边界**：只自动生成周报总结；下周任务仍由用户在周计划页预览确认后入库——不破坏「AI 内容须预览确认」产品底线。

## 5. PWA

- `src/app/manifest.ts` 已有；检查并补全 icons（`public/icons/` 已有生成脚本产物，确认 192/512 存在）。
- 新增 `public/sw.js`：最小 service worker（install 即 skipWaiting，fetch 透传 network-only，不做离线缓存——自用阶段避免缓存旧页面困扰）。
- 新增注册组件（客户端组件，`useEffect` 中 `navigator.serviceWorker.register('/sw.js')`，**仅 `process.env.NODE_ENV === 'production'`**），挂到根 layout。
- 不引入 next-pwa（Next 16 兼容性存疑，且不需要复杂缓存策略）。

## 6. 打卡乐观更新

- 页面 `src/app/companion/today/`：打卡/跳过/撤销改乐观更新——点击立即更新本地勾选状态，请求失败回滚并 toast 提示。
- 实现需先读现有组件结构（server/client 边界），遵循项目既有模式；组件内禁止直接 `Date.now()`（react-hooks purity 规则），需要时抽到组件外。
- 顺手补：今日页加载骨架（loading.tsx），消除自用卡顿感。

## 7. 启动脚本与文档

- 新增 `scripts/start-local.sh`（Git Bash）：先后台启动 `next start`，再启动调度器；Ctrl+C 一并退出。
- `package.json` 增加 script：`"start:local"`（build 检查 + 调 start-local.sh，或直接文档说明两条命令）。
- 文档：在 README 或 `docs/` 增加「本地自用部署」小节：启动步骤、查看局域网 IP 的方法（`ipconfig` 查 IPv4）、手机访问与添加主屏、鸿蒙/微信推送注意事项（先关注 Server酱服务号并用 `/dev/push-test` 验证）。
- 局域网访问需确认 `next start` 监听 `0.0.0.0`（`-H 0.0.0.0`），防火墙首次放行 3000 端口。

## 8. 明确不做（YAGNI）

- 不做离线缓存 / 后台同步（自用阶段无价值且易出缓存坑）。
- 不做 OCR 截图提取、embedding 检索、领域归一（属第二、三波）。
- 不迁 PostgreSQL（单用户 SQLite 够用，多用户/上云时再迁）。
- 不做原生 App / Web Push（国内安卓与鸿蒙无可靠通道，微信推送已够）。
- 不做多用户打磨项（邀请码过期、退出班级等，班级模块本期单人用）。

## 9. 验收清单

1. `next build` 通过，`npm test` 通过（scheduler 纯函数单测不受影响）。
2. 一条命令启动后：手机（同 Wi-Fi）能打开 app 并完成一次陪伴打卡（乐观更新生效）、一次图谱喂入。
3. 手动把系统时间触发逻辑改为立即执行（或调度器支持 `--now` 调试参数）验证：早推送/晚推送/背诵提醒/周报生成/备份 五个任务各自成功。
4. `backups/` 出现备份文件，超过 14 份时最旧被清理。
5. 生产模式下 `/sw.js` 注册成功（DevTools Application 面板可见）。
6. README/docs 的自用部署小节可按步骤走通。
