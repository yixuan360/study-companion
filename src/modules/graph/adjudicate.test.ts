import { describe, expect, it } from "vitest";
import {
  ADJUDICATION_BATCH_SIZE,
  buildBatchPrompt,
  chunkItems,
  parseBatchVerdicts,
  type AdjudicationItem,
} from "./adjudicate";

function item(index: number, name: string, candidateIds: string[] = ["c1", "c2"]): AdjudicationItem {
  return {
    index,
    name,
    aliases: [],
    summary: `摘要${index}`,
    candidates: candidateIds.map((id) => ({ id, name: `节点${id}`, summary: "s" })),
  };
}

const ITEMS = [item(1, "梯度消失"), item(2, "CNN"), item(3, "参数")];

describe("chunkItems", () => {
  it("按 size 分批且保持顺序", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkItems([], 3)).toEqual([]);
  });

  it("批大小常量在建议区间 5-10 内", () => {
    expect(ADJUDICATION_BATCH_SIZE).toBeGreaterThanOrEqual(5);
    expect(ADJUDICATION_BATCH_SIZE).toBeLessThanOrEqual(10);
  });
});

describe("buildBatchPrompt", () => {
  it("包含全部知识点、候选 id 与编号约定", () => {
    const prompt = buildBatchPrompt(ITEMS);
    for (const it of ITEMS) {
      expect(prompt).toContain(it.name);
      expect(prompt).toContain(`#${it.index}`);
      for (const c of it.candidates) expect(prompt).toContain(c.id);
    }
    expect(prompt).toContain("JSON 数组");
    expect(prompt).toContain(`共 ${ITEMS.length} 项`);
    // 红线规则保持
    expect(prompt).toContain("上下位概念");
    expect(prompt).toContain("参数与权重应区分");
    expect(prompt).toContain("禁止跨项选择");
  });
});

describe("parseBatchVerdicts", () => {
  it("正常批量返回：match 候选 id 与 null 均判 ok", () => {
    const verdicts = parseBatchVerdicts(
      [
        { index: 1, match: "c1", reason: "同一概念" },
        { index: 2, match: null, reason: "全新概念" },
        { index: 3, match: null, reason: "" },
      ],
      ITEMS
    );
    expect(verdicts).toEqual([
      { status: "ok", matchedId: "c1", reason: "同一概念" },
      { status: "ok", matchedId: null, reason: "全新概念" },
      { status: "ok", matchedId: null, reason: "" },
    ]);
  });

  it("某项缺失（数组短于 items）→ 该项 invalid", () => {
    const verdicts = parseBatchVerdicts(
      [
        { index: 1, match: "c1", reason: "r" },
        { index: 3, match: null, reason: "r" },
      ],
      ITEMS
    );
    expect(verdicts[0].status).toBe("ok");
    expect(verdicts[1]).toEqual({ status: "invalid" });
    expect(verdicts[2].status).toBe("ok");
  });

  it("某项非法：非对象 / match 不在候选内 / match 缺失 / index 越界 / index 非整数", () => {
    const verdicts = parseBatchVerdicts(
      [
        "not-an-object",
        { index: 1, match: "不存在id", reason: "r" },
        { index: 2, reason: "忘记给 match" },
        { index: 99, match: "c1", reason: "越界" },
        { index: 1.5, match: "c1", reason: "非整数" },
      ],
      ITEMS
    );
    expect(verdicts.every((v) => v.status === "invalid")).toBe(true);
  });

  it("index 重复时先到先得，重复项忽略", () => {
    const verdicts = parseBatchVerdicts(
      [
        { index: 1, match: "c1", reason: "r" },
        { index: 1, match: "c2", reason: "后来的重复项" },
      ],
      ITEMS
    );
    expect(verdicts[0]).toEqual({ status: "ok", matchedId: "c1", reason: "r" });
    expect(verdicts[1]).toEqual({ status: "invalid" });
  });

  it("整批解析失败：非数组 / 非对象 → 全部 invalid", () => {
    for (const raw of [null, undefined, "string", 42, {}, { not: "array" }]) {
      const verdicts = parseBatchVerdicts(raw, ITEMS);
      expect(verdicts).toHaveLength(ITEMS.length);
      expect(verdicts.every((v) => v.status === "invalid")).toBe(true);
    }
  });

  it("数组多余项被忽略；items 为空时返回空", () => {
    const verdicts = parseBatchVerdicts(
      [
        { index: 1, match: null, reason: "r" },
        { index: 2, match: null, reason: "r" },
        { index: 3, match: null, reason: "r" },
        { index: 4, match: "c1", reason: "多余项" },
      ],
      ITEMS
    );
    expect(verdicts.every((v) => v.status === "ok")).toBe(true);
    expect(parseBatchVerdicts([], [])).toEqual([]);
  });

  it("reason 非字符串时兜底为空串，match 仍有效", () => {
    const verdicts = parseBatchVerdicts(
      [{ index: 1, match: "c2", reason: 123 }],
      ITEMS
    );
    expect(verdicts[0]).toEqual({ status: "ok", matchedId: "c2", reason: "" });
  });
});
