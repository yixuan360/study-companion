import { NextResponse } from "next/server";
import { chat } from "@/lib/ai";
import { buildExtractPrompt, parseExtraction } from "@/modules/graph/extract";

const MAX_CONTENT_LENGTH = 8000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; content?: string };
    const content = body.content?.trim();
    if (!content) {
      return bad("内容不能为空");
    }
    const truncated = content.length > MAX_CONTENT_LENGTH;
    const processed = truncated ? content.slice(0, MAX_CONTENT_LENGTH) : content;

    const result = await chat({
      messages: [{ role: "user", content: buildExtractPrompt(processed) }],
      taskType: "simple",
      module: "图谱抽取",
      responseFormat: "json",
    });

    const extraction = parseExtraction(JSON.parse(result.content));

    return NextResponse.json({
      code: 0,
      data: { extraction, truncated },
      msg: truncated ? "内容较长，仅提取前 8000 字" : "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[graph/extract] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
