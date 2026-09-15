/**
 * 三段式对齐的 c 段 AI 裁决（批量路径，纯函数部分）。
 *
 * 有并集候选的实体按 ADJUDICATION_BATCH_SIZE 分批，每批一次 chat() 调用，
 * Prompt 要求返回 JSON 数组、逐项给出 match（候选节点 id 或 null）。
 * parseBatchVerdicts 是解析纯函数：缺失/非法项标记 invalid（由调用方逐条兜底，
 * 保守建新，不影响同批其他项）；整批非数组/解析失败 → 全部 invalid。
 */

/** 每批裁决的实体数（可调；5-10 之间是延迟/解析可靠性的平衡点） */
export const ADJUDICATION_BATCH_SIZE = 8;

export interface AdjudicationCandidate {
  id: string;
  name: string;
  summary: string;
}

export interface AdjudicationItem {
  /** 批内编号（从 1 开始，Prompt 输出必须原样带回，用于回定位） */
  index: number;
  name: string;
  aliases: string[];
  summary: string;
  candidates: AdjudicationCandidate[];
}

export type BatchVerdict =
  | { status: "ok"; matchedId: string | null; reason: string }
  | { status: "invalid" };

/** 按 size 分批（保持原顺序），供批量裁决与单测使用 */
export function chunkItems<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function formatCandidates(candidates: AdjudicationCandidate[]): string {
  return candidates
    .map((c) => `- ${c.id} ${c.name}（摘要：${c.summary}）`)
    .join("\n");
}

/** 批量裁决 Prompt：逐项独立判断，只允许从该项自己的候选列表中选 id */
export function buildBatchPrompt(items: AdjudicationItem[]): string {
  const first = items[0]?.index ?? 1;
  const blocks = items
    .map(
      (it) => `#${it.index}
新知识点：${it.name}（摘要：${it.summary}，别名：${it.aliases.join("、") || "无"}）
候选节点：
${formatCandidates(it.candidates)}`
    )
    .join("\n\n");
  return `一次裁决 ${items.length} 个新知识点。对每个知识点，判断它与候选节点中的哪个是同一概念，还是全新概念。
${blocks}
注意：
1. 上下位概念（如"卷积神经网络"与"神经网络"）不算同一概念；不确定时返回 null。
2. 参数与权重应区分为不同概念：参数是可训练变量的统称，权重只是参数的一种。
3. 策略与其作用对象、现象与其缓解手段、统称与具体实例都不算同一概念（如"学习率衰减"≠"学习率"）；宁可新建也不要错合。
4. 逐项独立判断，只允许从该项自己的候选列表中选择 id，禁止跨项选择。
输出严格 JSON 数组，共 ${items.length} 项，每项形如 {"index": ${first}, "match": 节点id 或 null, "reason": "一句话"}，index 必须与知识点编号一致，缺项视为该项裁决失败。`;
}

/**
 * 解析批量裁决结果。与 items 等长对齐：
 * - index 匹配、match 为 null 或候选内合法 id → ok；
 * - 缺失、index 越界/重复/非整数、match 不在该项候选内 → invalid（逐条兜底）。
 */
export function parseBatchVerdicts(
  raw: unknown,
  items: AdjudicationItem[]
): BatchVerdict[] {
  const verdicts: BatchVerdict[] = items.map(() => ({ status: "invalid" }));
  if (!Array.isArray(raw) || items.length === 0) return verdicts;

  const positionByIndex = new Map(items.map((it, i) => [it.index, i]));
  const seen = new Set<number>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.index !== "number" || !Number.isInteger(e.index)) continue;
    const pos = positionByIndex.get(e.index);
    if (pos === undefined || seen.has(e.index)) continue;
    seen.add(e.index);

    let matchedId: string | null;
    if (e.match === null) {
      matchedId = null;
    } else if (
      typeof e.match === "string" &&
      items[pos].candidates.some((c) => c.id === e.match)
    ) {
      matchedId = e.match;
    } else {
      continue; // match 非法（含缺失）：该项保持 invalid
    }
    const reason = typeof e.reason === "string" ? e.reason : "";
    verdicts[pos] = { status: "ok", matchedId, reason };
  }
  return verdicts;
}
