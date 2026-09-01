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
│   └── dev.db                 # 本地 SQLite 数据库
├── public/                    # 静态资源、图标
├── scripts/                   # 辅助脚本
│   └── generate-icons.py
├── src/
│   ├── app/                   # Next.js App Router 入口
│   │   ├── api/
│   │   │   ├── admin/ai-stats/route.ts
│   │   │   └── health/route.ts
│   │   ├── dev/ai-test/       # 开发调试页面
│   │   │   ├── actions.ts
│   │   │   └── page.tsx
│   │   ├── _components/       # 页面级通用组件
│   │   │   ├── ModuleCard.tsx
│   │   │   └── ModulePlaceholder.tsx
│   │   ├── classroom/page.tsx
│   │   ├── companion/page.tsx
│   │   ├── graph/page.tsx
│   │   ├── recite/page.tsx
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
│   │   └── db.ts              # Prisma Client 单例
│   └── modules/               # 业务模块（当前为空，待按模块填充）
├── .env / .env.example
├── next.config.ts
├── package.json
└── tsconfig.json
```

### 模块划分

- `src/modules/recite`：背诵模块（记忆卡片、间隔重复、背诵提醒）。
- `src/modules/companion`：备考陪伴模块（学习计划、番茄钟、阶段检测）。
- `src/modules/classroom`：班级 DDL 模块（作业、考试、通知及其截止时间）。
- `src/modules/graph`：知识图谱模块（知识点节点、关联、复习路径）。
- `src/lib/ai`：AI 能力统一网关（已创建，支持 DeepSeek / Kimi，统一封装调用、JSON 解析、用量统计与重试）。
- `src/lib/push`：**待创建**，推送能力统一网关。

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
- 网关内部封装 provider 细节，业务层只与稳定接口交互。

### 4.3 数据库设计

- 所有数据表预留 `metadata Json` 字段，用于未来扩展与实验性功能。
- 迁移脚本需与 schema 变更同步提交。

### 4.4 响应式设计

- 移动端优先（mobile-first）。
- 默认按小屏布局实现，再逐步增强到桌面端。

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

## 6. 待办与已知坑

> 待后续会话持续更新。

（当前为空）

## 7. 协作规则

1. **会话开始**：先完整阅读本文件，确认当前上下文与已完成状态。
2. **会话结束**：
   - 更新「已完成清单」，只增不减，已废弃事项用删除线标记。
   - 若目录结构有变化，更新「目录结构」与「模块划分」说明。
   - 在「待办与已知坑」中记录本次未解决但需后续跟进的事项。
3. **冲突解决**：若本文件与 `README.md`、代码注释、临时约定冲突，以本文件为准，并在本文件中记录冲突与最终决议。
