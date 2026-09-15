import { describe, expect, it } from "vitest";
import {
  EMBED_MIN_SCORE,
  NGRAM_MIN_SCORE,
  RECALL_TOP_K,
  cosineSimilarity,
  embedTextOf,
  recallByNGram,
  recallCandidates,
  tokenize,
  type RecallableNode,
} from "./candidates";

function node(
  id: string,
  name: string,
  aliases: string[] = [],
  extra: Partial<RecallableNode> = {}
): RecallableNode {
  return { id, name, aliases, ...extra };
}

describe("tokenize 中英文混合分词", () => {
  it("中文按字 bigram，单字退化 unigram", () => {
    expect(tokenize("梯度消失")).toEqual(["梯度", "度消", "消失"]);
    expect(tokenize("网")).toEqual(["网"]);
  });

  it("英文整词 + 词内字符 bigram（小写化）", () => {
    const tokens = tokenize("CNN");
    expect(tokens).toContain("cnn");
    expect(tokens).toContain("cn");
    expect(tokens).toContain("nn");
  });

  it("中英文混合各自成袋", () => {
    const tokens = tokenize("卷积神经网络 CNN");
    expect(tokens).toEqual(
      expect.arrayContaining(["卷积", "积神", "神经", "经网", "网络", "cnn"])
    );
  });

  it("标点与空白不参与切分", () => {
    expect(tokenize("预训练-微调范式")).not.toContain("-");
  });
});

describe("cosineSimilarity", () => {
  const vec = (entries: Record<string, number>) => new Map(Object.entries(entries));

  it("完全一致为 1，完全无关为 0", () => {
    expect(cosineSimilarity(vec({ a: 1, b: 1 }), vec({ a: 1, b: 1 }))).toBeCloseTo(1);
    expect(cosineSimilarity(vec({ a: 1 }), vec({ b: 1 }))).toBe(0);
  });

  it("一侧为空向量返回 0", () => {
    expect(cosineSimilarity(new Map(), vec({ a: 1 }))).toBe(0);
  });
});

describe("recallByNGram 字符 n-gram 兜底召回", () => {
  it("同义变体召回：梯度消失 ⇄ 梯度弥散", () => {
    const nodes = [node("n1", "梯度弥散", ["梯度消失问题"])];
    const hits = recallByNGram({ name: "梯度消失", aliases: [] }, nodes);
    expect(hits.map((h) => h.node.id)).toContain("n1");
    expect(hits[0].score).toBeGreaterThanOrEqual(NGRAM_MIN_SCORE);
    // 反向亦可召回
    const reverse = recallByNGram({ name: "梯度弥散", aliases: [] }, [
      node("n2", "梯度消失"),
    ]);
    expect(reverse.map((h) => h.node.id)).toContain("n2");
  });

  it("中英文跨语：共享缩写/别名的整词通道召回（CNN）", () => {
    const nodes = [
      node("en", "Convolutional Neural Network", ["CNN", "ConvNet"]),
    ];
    // 中文名 + 英文缩写别名的实体，能命中只挂英文名的节点
    const hits = recallByNGram(
      { name: "卷积神经网络", aliases: ["CNN"] },
      nodes
    );
    expect(hits.map((h) => h.node.id)).toContain("en");
    // 反向：缩写实体命中中文名节点（节点挂 CNN 别名）
    const reverse = recallByNGram({ name: "CNN", aliases: [] }, [
      node("cn", "卷积神经网络", ["CNN"]),
    ]);
    expect(reverse.map((h) => h.node.id)).toContain("cn");
    expect(reverse[0].score).toBeGreaterThan(0.5);
  });

  it("跨领域无关概念不召回（咖啡 vs 神经网络）", () => {
    const nodes = [node("coffee", "手冲咖啡"), node("net", "神经网络")];
    const hits = recallByNGram({ name: "手冲咖啡", aliases: [] }, nodes);
    expect(hits.map((h) => h.node.id)).toEqual(["coffee"]);
  });

  it("弱共现不过阈值：长短期记忆网络 ⇄ 循环神经网络不召回", () => {
    const nodes = [node("rnn", "循环神经网络")];
    const hits = recallByNGram({ name: "长短期记忆网络", aliases: [] }, nodes);
    expect(hits).toEqual([]);
  });

  it("top-K 截断且得分降序、同分按 id 稳定排序", () => {
    const nodes = Array.from({ length: 30 }, (_, i) =>
      node(`n${String(i).padStart(2, "0")}`, "神经网络", ["别名"])
    );
    const hits = recallByNGram({ name: "神经网络", aliases: [] }, nodes, {
      topK: 10,
    });
    expect(hits).toHaveLength(10);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
    expect(hits[0].node.id).toBe("n00");
  });

  it("默认常量合理：阈值在 (0,1)，K 在 10-20", () => {
    expect(NGRAM_MIN_SCORE).toBeGreaterThan(0);
    expect(NGRAM_MIN_SCORE).toBeLessThan(1);
    expect(RECALL_TOP_K).toBeGreaterThanOrEqual(10);
    expect(RECALL_TOP_K).toBeLessThanOrEqual(20);
  });

  it("1000+ 节点批量召回性能：1200 节点 × 20 查询毫秒级", () => {
    const nodes = Array.from({ length: 1200 }, (_, i) =>
      node(`id-${i}`, `深度概念${i % 200}号`, [`别名${i}`, `alias${i}`])
    );
    nodes[777] = node("id-777", "梯度弥散", []);
    const queries = Array.from({ length: 20 }, () => ({
      name: "梯度消失",
      aliases: [],
    }));
    const start = performance.now();
    for (const q of queries) recallByNGram(q, nodes);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("recallCandidates embedding 优先 / n-gram 兜底", () => {
  // 确定性假向量：把文本映射到 2 维空间，"近义"文本角度接近
  const fakeEmbed = async (texts: string[]): Promise<number[][]> =>
    texts.map((t) => (t.includes("咖啡") ? [1, 0] : [0, 1]));

  it("库内已有同模型向量时走向量余弦 top-K", async () => {
    const nodes = [
      node("a", "手冲咖啡", [], { embedding: [1, 0], embeddingModel: "m" }),
      node("b", "神经网络", [], { embedding: [0, 1], embeddingModel: "m" }),
      node("c", "无向量节点"),
    ];
    const hits = await recallCandidates(
      { name: "冰滴咖啡", aliases: [] },
      nodes,
      { model: "m", embedTexts: fakeEmbed }
    );
    expect(hits.map((h) => h.node.id)).toEqual(["a"]);
    expect(hits[0].score).toBeCloseTo(1);
  });

  it("向量模型过期时视为不可用，退回 n-gram", async () => {
    const nodes = [
      node("a", "梯度弥散", [], { embedding: [1, 0], embeddingModel: "old" }),
    ];
    let called = 0;
    const hits = await recallCandidates(
      { name: "梯度消失", aliases: [] },
      nodes,
      {
        model: "new",
        embedTexts: async (t) => {
          called += t.length;
          return t.map(() => [1, 0]);
        },
      }
    );
    expect(called).toBe(0); // 没有同模型向量时不发起 embed 调用
    expect(hits.map((h) => h.node.id)).toEqual(["a"]);
  });

  it("未提供 embed 依赖时纯 n-gram 路径", async () => {
    const nodes = [node("a", "梯度弥散")];
    const hits = await recallCandidates({ name: "梯度消失", aliases: [] }, nodes);
    expect(hits.map((h) => h.node.id)).toEqual(["a"]);
  });

  it("embedding 分数受 EMBED_MIN_SCORE 下限约束", () => {
    expect(EMBED_MIN_SCORE).toBeGreaterThan(0);
    expect(EMBED_MIN_SCORE).toBeLessThan(1);
  });
});

describe("embedTextOf", () => {
  it("主名 + 别名拼接，供 embedding 向量化", () => {
    expect(embedTextOf({ name: "卷积神经网络", aliases: ["CNN"] })).toBe(
      "卷积神经网络 CNN"
    );
    expect(embedTextOf({ name: "过拟合", aliases: [] })).toBe("过拟合");
  });
});
