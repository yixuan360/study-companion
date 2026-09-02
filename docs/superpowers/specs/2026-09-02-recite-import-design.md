# 背诵模块：文字录入到 AI 制卡设计文档

## 背景

背诵模块需要一条完整的"文字录入 → AI 制卡 → 预览确认 → 批量入库"链路。产品底线是：**所有 AI 生成内容必须经过用户预览确认后才能写入数据库**。

## 目标

实现 MVP 版本的核心制卡链路：

1. 用户在 `/recite/import` 输入标题和学习材料内容。
2. 后端创建 Material 记录，并调用 AI 网关生成记忆卡片。
3. 前端展示生成的卡片列表，允许用户全选/反选、编辑单张卡、删除单张卡。
4. 用户确认后，仅将选中的卡片批量写入数据库。
5. 保存成功后跳转到该材料的卡片列表页 `/recite/materials/[id]`。
6. 提供材料列表页 `/recite/materials` 查看所有材料。

## 数据流

```
/recite/import
  ├─ 1. 用户输入标题 + 内容 → 点击"开始制卡"
  ├─ 2. POST /api/recite/generate-cards
  │    ├─ 创建 Material（sourceType: text, rawContent: content）
  │    ├─ 调用 src/lib/ai chat()（taskType: simple, responseFormat: json）
  │    └─ 返回 { code, data: { materialId, cards, usage, model, provider }, msg }
  ├─ 3. 前端进入预览区：展示卡片列表，支持全选/反选、单张编辑/删除
  └─ 4. 用户点击"确认保存 N 张卡"
       → POST /api/recite/cards/batch-create
         ├─ 仅保存被勾选的卡片
         └─ 成功后跳转到 /recite/materials/[materialId]
```

## API 设计

### POST /api/recite/generate-cards

生成卡片，仅创建 Material，不写入 Card。

**请求体：**

```json
{
  "title": "材料标题",
  "content": "学习材料正文..."
}
```

**校验规则：**

- `title` 必填，去空后长度 > 0。
- `content` 必填，去空后长度 > 0。
- 内容超过 8000 字符时截断，并在响应 `msg` 中提示："内容较长，已截断前 8000 字符，建议分段录入"。

**处理流程：**

1. 创建 `Material` 记录，`sourceType: 'text'`，`rawContent` 为截断后的内容。
2. 拼接制卡 Prompt（见下方）。
3. 调用 AI 网关 `chat({ messages, taskType: 'simple', responseFormat: 'json' })`。
4. 解析返回 JSON，提取 `cards` 数组。
5. 返回卡片数组及 AI 调用元数据。

**制卡 Prompt：**

```
你是学习卡片制作专家。将以下学习材料拆解为原子知识点，每个知识点生成一张记忆卡。
要求：
1. 一张卡只考一个知识点，问题明确无歧义
2. 题型分布：优先挖空题（cloze，针对关键概念/定义/公式/结论），其次简答题（qa），判断题（judge）少量
3. 挖空题用 ____ 表示空缺处
4. 忽略页码、装饰性文字
5. 输出严格 JSON：{"cards":[{"type":"cloze|qa|judge","question":"...","answer":"...","hint":"一句话提示，可省略"}]}
材料：
"""
{content}
"""
```

**成功响应：**

```json
{
  "code": 0,
  "data": {
    "materialId": "uuid",
    "cards": [
      { "type": "cloze", "question": "...", "answer": "...", "hint": "..." }
    ],
    "usage": { "promptTokens": 0, "completionTokens": 0, "totalTokens": 0 },
    "model": "deepseek-chat",
    "provider": "deepseek"
  },
  "msg": ""
}
```

**截断提示响应：**

```json
{
  "code": 0,
  "data": { ... },
  "msg": "内容较长，已截断前 8000 字符，建议分段录入"
}
```

### POST /api/recite/cards/batch-create

批量保存用户确认后的卡片。

**请求体：**

```json
{
  "materialId": "uuid",
  "cards": [
    { "type": "cloze", "question": "...", "answer": "...", "hint": "..." }
  ]
}
```

**校验规则：**

- `materialId` 必填且对应记录存在。
- `cards` 为数组且长度 > 0。
- 每张卡必须包含 `type`（`cloze` | `qa` | `judge`）、`question`（非空）、`answer`（非空）。
- `hint` 可选。

**处理流程：**

1. 查询 `Material` 确认存在。
2. 使用 `prisma.card.createMany` 批量创建卡片。
3. 返回保存数量。

**成功响应：**

```json
{
  "code": 0,
  "data": { "savedCount": 3 },
  "msg": ""
}
```

## 页面设计

### /recite/import

三步流程页面，移动端优先。

**输入区：**

- 标题输入框（`input`）。
- 大文本域（`textarea`，约 12 行），用于粘贴笔记。
- "开始制卡"按钮，点击后进入 loading 状态，按钮文案变为"制卡中..."，禁用输入区。

**预览区：**

- 顶部显示"共生成 X 张卡"，左侧放置"全选/反选"复选框。
- 卡片列表，每张卡片显示：
  - 题型标签（cloze → 挖空，qa → 问答，judge → 判断）。
  - 题目（`question`）。
  - 答案（`answer`）。
  - 可选 hint（若存在则展示）。
  - 复选框（默认选中）。
  - "编辑"按钮：点击后进入行内编辑模式，可修改 `question`、`answer`、`hint`。
  - "删除"按钮：从列表移除。
- 底部固定"确认保存 N 张卡"按钮，N 为当前勾选数量；N 为 0 时禁用。

**错误提示：**

- API 失败时显示错误信息。
- 截断提示在输入区下方以警告色展示。

### /recite/materials

材料列表页：

- 顶部标题"我的材料"，右侧"录入新材料"按钮跳转到 `/recite/import`。
- 列表展示每个材料的标题、卡片数、创建时间。
- 点击整行进入 `/recite/materials/[id]`。

### /recite/materials/[id]

材料详情/卡片列表页：

- 顶部返回按钮 + 材料标题。
- 展示该材料下所有卡片。
- 每张卡显示题型标签、题目、答案、hint。
- 每张卡提供"删除"按钮，删除后刷新页面。

## 错误处理

- 所有 API 统一返回 `{ code, data, msg }`。
- AI 调用失败返回 `code: 500`，`msg` 为可读错误信息。
- 校验失败返回 `code: 400`。
- 前端统一用提示区域展示错误，loading 状态正确清理。

## 文件变更清单

新增文件：

- `src/app/api/recite/generate-cards/route.ts`
- `src/app/api/recite/cards/batch-create/route.ts`
- `src/app/recite/import/page.tsx`
- `src/app/recite/materials/page.tsx`
- `src/app/recite/materials/[id]/page.tsx`

修改文件：

- `AGENTS.md`：更新已完成清单与目录结构。

## 依赖

- 复用现有 `src/lib/ai` 网关，不新增依赖。
- 复用现有 Prisma Client 和模型，不改动 schema。
