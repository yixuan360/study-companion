import type { ChatContentPart } from "@/lib/ai";

/** 截图最长边上限：控制多模态 token 与上传体积 */
export const MAX_SCREENSHOT_EDGE = 1600;
/** base64 文本长度上限（约 1.8MB 二进制），超限直接拒绝 */
export const MAX_SCREENSHOT_BASE64_LENGTH = 2_500_000;
/** 原图文件大小上限，明显超限的原图不进入压缩流程 */
export const MAX_SCREENSHOT_FILE_BYTES = 15 * 1024 * 1024;

export const SCREENSHOT_OUTPUT_MIME = "image/jpeg";

export interface ScaledSize {
  width: number;
  height: number;
}

/** 等比缩放尺寸计算：最长边超过 maxEdge 时按比例缩小（纯函数） */
export function computeScaledSize(
  width: number,
  height: number,
  maxEdge: number
): ScaledSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("图片尺寸非法");
  }
  if (maxEdge <= 0) {
    throw new Error("缩放上限非法");
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** base64 → data URL（纯函数） */
export function buildImageDataUrl(mimeType: string, base64: string): string {
  if (!mimeType.startsWith("image/")) {
    throw new Error("图片类型非法");
  }
  if (!base64) {
    throw new Error("图片数据为空");
  }
  return `data:${mimeType};base64,${base64}`;
}

/** 校验接口侧收到的 base64 截图（纯函数），不合格抛中文可读错误 */
export function assertScreenshotBase64(base64: string): void {
  if (!base64) {
    throw new Error("图片数据不能为空");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("图片数据格式错误");
  }
  if (base64.length > MAX_SCREENSHOT_BASE64_LENGTH) {
    throw new Error("图片过大，请压缩后再上传（截图最长边建议不超过 1600px）");
  }
}

/** 构造多模态 user content：文本指令在前、图片在后（纯函数） */
export function buildScreenshotContent(
  prompt: string,
  dataUrl: string
): ChatContentPart[] {
  if (!prompt.trim()) {
    throw new Error("提取指令不能为空");
  }
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("图片地址格式错误");
  }
  return [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
}

export interface ScreenshotImage {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * 浏览器端压缩/缩放截图（仅事件处理器中调用，勿在组件渲染期执行）：
 * 等比缩放到最长边 ≤ maxEdge → 绘到 canvas → 输出 JPEG → base64。
 */
export async function resizeImageFile(
  file: File,
  options: { maxEdge?: number; quality?: number } = {}
): Promise<ScreenshotImage> {
  const maxEdge = options.maxEdge ?? MAX_SCREENSHOT_EDGE;
  const quality = options.quality ?? 0.85;

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = computeScaledSize(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("当前浏览器不支持图片处理");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, SCREENSHOT_OUTPUT_MIME, quality)
    );
    if (!blob) {
      throw new Error("图片压缩失败，请换一张截图");
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) {
      throw new Error("图片读取失败");
    }
    return { base64, mimeType: SCREENSHOT_OUTPUT_MIME, width, height };
  } finally {
    bitmap.close();
  }
}
