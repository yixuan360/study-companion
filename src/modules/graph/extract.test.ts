import { describe, expect, it } from "vitest";
import {
  DOMAIN_VOCABULARY,
  buildExtractPrompt,
  normalizeDomain,
  parseExtraction,
} from "./extract";

describe("normalizeDomain", () => {
  it("词表值原样通过", () => {
    for (const d of DOMAIN_VOCABULARY) {
      expect(normalizeDomain(d)).toBe(d);
    }
  });

  it("空白 trim 后归一", () => {
    expect(normalizeDomain("  机器学习  ")).toBe("机器学习");
    expect(normalizeDomain("  ml  ")).toBe("机器学习");
  });

  it("大小写归一（ASCII 变体）", () => {
    expect(normalizeDomain("ML")).toBe("机器学习");
    expect(normalizeDomain("Machine Learning")).toBe("机器学习");
    expect(normalizeDomain("AI")).toBe("人工智能");
    expect(normalizeDomain("CV")).toBe("计算机视觉");
    expect(normalizeDomain("Dl")).toBe("深度学习");
  });

  it("同义映射：基础/入门与历史变体", () => {
    expect(normalizeDomain("机器学习基础")).toBe("机器学习");
    expect(normalizeDomain("深度学习基础")).toBe("深度学习");
    expect(normalizeDomain("神经网络")).toBe("深度学习");
    expect(normalizeDomain("计算机/人工智能")).toBe("人工智能");
    expect(normalizeDomain("计算机")).toBe("深度学习");
  });

  it("复合标签按段归一，最具体段优先", () => {
    expect(normalizeDomain("计算机/机器学习")).toBe("机器学习");
    expect(normalizeDomain("计算机/神经网络")).toBe("深度学习");
    expect(normalizeDomain("深度学习/自然语言处理")).toBe("深度学习");
    expect(normalizeDomain("人工智能、计算机视觉")).toBe("计算机视觉");
  });

  it("未知值兜底为其他", () => {
    expect(normalizeDomain("健身营养")).toBe("其他");
    expect(normalizeDomain("自然语言处理")).toBe("其他");
    expect(normalizeDomain("机器学习导论与入门基础")).toBe("其他");
  });

  it("空值/非字符串兜底为其他", () => {
    expect(normalizeDomain("")).toBe("其他");
    expect(normalizeDomain("   ")).toBe("其他");
    expect(normalizeDomain(undefined)).toBe("其他");
    expect(normalizeDomain(null)).toBe("其他");
    expect(normalizeDomain(123)).toBe("其他");
  });
});

describe("parseExtraction domain 归一", () => {
  const base = {
    entities: [{ name: "梯度下降", aliases: [], summary: "优化方法" }],
    relations: [],
  };

  it("AI 返回词表外 domain 时在 parse 层归一", () => {
    const result = parseExtraction({ ...base, domain: "ML" });
    expect(result.domain).toBe("机器学习");
  });

  it("domain 缺失时落其他", () => {
    const result = parseExtraction(base);
    expect(result.domain).toBe("其他");
  });

  it("复合 domain 归一后入库", () => {
    const result = parseExtraction({ ...base, domain: "计算机/神经网络" });
    expect(result.domain).toBe("深度学习");
  });
});

describe("buildExtractPrompt", () => {
  it("Prompt 中列出全部领域词表", () => {
    const prompt = buildExtractPrompt("测试内容");
    for (const d of DOMAIN_VOCABULARY) {
      expect(prompt).toContain(d);
    }
  });
});
