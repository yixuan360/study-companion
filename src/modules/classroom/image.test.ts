import { describe, expect, it } from "vitest";
import {
  assertScreenshotBase64,
  buildImageDataUrl,
  buildScreenshotContent,
  computeScaledSize,
  MAX_SCREENSHOT_BASE64_LENGTH,
} from "./image";

describe("computeScaledSize", () => {
  it("横图超限时等比缩放到最长边 = maxEdge", () => {
    expect(computeScaledSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("竖图超限时等比缩放（1080x1920 → 900x1600）", () => {
    expect(computeScaledSize(1080, 1920, 1600)).toEqual({ width: 900, height: 1600 });
  });

  it("最长边未超限时保持原尺寸（取整）", () => {
    expect(computeScaledSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(computeScaledSize(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("极限单像素缩放不小于 1", () => {
    const scaled = computeScaledSize(10_000, 1, 1600);
    expect(scaled.width).toBe(1600);
    expect(scaled.height).toBe(1);
  });

  it("非法尺寸抛错", () => {
    expect(() => computeScaledSize(0, 100, 1600)).toThrow("图片尺寸非法");
    expect(() => computeScaledSize(100, -1, 1600)).toThrow("图片尺寸非法");
    expect(() => computeScaledSize(100, 100, 0)).toThrow("缩放上限非法");
  });
});

describe("buildImageDataUrl", () => {
  it("拼出 image data URL", () => {
    expect(buildImageDataUrl("image/jpeg", "QUJD")).toBe(
      "data:image/jpeg;base64,QUJD"
    );
  });

  it("非 image 类型抛错", () => {
    expect(() => buildImageDataUrl("text/plain", "QUJD")).toThrow("图片类型非法");
  });

  it("空 base64 抛错", () => {
    expect(() => buildImageDataUrl("image/png", "")).toThrow("图片数据为空");
  });
});

describe("assertScreenshotBase64", () => {
  it("合法 base64 通过", () => {
    expect(() => assertScreenshotBase64("QUJDRA==")).not.toThrow();
    expect(() => assertScreenshotBase64("aGVsbG8")).not.toThrow();
  });

  it("空串抛错", () => {
    expect(() => assertScreenshotBase64("")).toThrow("图片数据不能为空");
  });

  it("含非法字符抛错", () => {
    expect(() => assertScreenshotBase64("QUJD-_*")).toThrow("图片数据格式错误");
    expect(() => assertScreenshotBase64(" QUJD")).toThrow("图片数据格式错误");
  });

  it("超过长度上限抛错并提示压缩", () => {
    const oversized = "A".repeat(MAX_SCREENSHOT_BASE64_LENGTH + 1);
    expect(() => assertScreenshotBase64(oversized)).toThrow("图片过大");
  });
});

describe("buildScreenshotContent", () => {
  const dataUrl = "data:image/jpeg;base64,QUJD";

  it("文本指令在前、图片在后", () => {
    const parts = buildScreenshotContent("提取任务", dataUrl);
    expect(parts).toEqual([
      { type: "text", text: "提取任务" },
      { type: "image_url", image_url: { url: dataUrl } },
    ]);
  });

  it("空指令抛错", () => {
    expect(() => buildScreenshotContent("  ", dataUrl)).toThrow("提取指令不能为空");
  });

  it("非图片 data URL 抛错", () => {
    expect(() => buildScreenshotContent("提取任务", "https://example.com/a.jpg")).toThrow(
      "图片地址格式错误"
    );
  });
});
