import { NextResponse } from "next/server";
import { ingestGraph } from "@/modules/graph/ingest";
import { parseExtraction } from "@/modules/graph/extract";

function bad(msg: string, status = 400) {
  return NextResponse.json({ code: status, data: null, msg }, { status });
}

/** 确认入库：两段式实体对齐 + 关系去重 + 溯源 + 冲突记录，事务内执行 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      content?: string;
      extracted?: unknown;
    };
    const title = body.title?.trim();
    const content = body.content?.trim();
    if (!title) return bad("标题不能为空");
    if (!content) return bad("内容不能为空");
    if (!body.extracted) return bad("缺少抽取结果");

    // 服务端复用同一解析器校验用户确认后的数据（预览可编辑，以提交为准）
    const extracted = parseExtraction(body.extracted);

    const result = await ingestGraph({ title, content, extracted });

    return NextResponse.json({ code: 0, data: result, msg: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[graph/ingest] failed:", message);
    return NextResponse.json({ code: 500, data: null, msg: message }, { status: 500 });
  }
}
