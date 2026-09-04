import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import type { Prisma } from "@/generated/prisma/client";
import type {
  ExtractedEntity,
  GraphExtraction,
} from "./extract";

export interface IngestResult {
  sourceId: string;
  newNodes: number;
  reusedNodes: number;
  newEdges: number;
  incrementedEdges: number;
  conflicts: number;
  skippedRelations: number;
  alignments: { name: string; matched: string | null; reason: string }[];
}

/** 语义相反的关系对（第一版冲突检测），可按需补充 */
const OPPOSITE_RELATIONS: [string, string][] = [
  ["导致", "抑制"], ["导致", "避免"], ["导致", "防止"], ["导致", "缓解"],
  ["促进", "抑制"], ["促进", "阻碍"], ["促进", "延缓"],
  ["提升", "降低"], ["提高", "降低"], ["增强", "削弱"],
  ["增加", "减少"], ["加速", "延缓"],
];

function isOppositeRelation(a: string, b: string): boolean {
  return OPPOSITE_RELATIONS.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x)
  );
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function readAliases(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string")
    : [];
}

interface ExistingNode {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
}

/**
 * 两段式实体对齐：
 * a. 本地候选——name 精确 / aliases 包含 / name 双向包含。中文场景 SQLite 无大小写
 *    不敏感索引，单机节点量小，全量加载后内存匹配即可；节点破千时改为候选检索
 *    （域名过滤 + LIKE 前缀），见 AGENTS.md 已知事项。
 * b. AI 裁决——仅对有候选的实体调用，判定同一概念或全新概念。
 */
export async function alignEntity(
  entity: ExtractedEntity,
  existingNodes: ExistingNode[]
): Promise<{ matchedId: string | null; reason: string }> {
  const normName = normalizeName(entity.name);
  const aliasSet = new Set(entity.aliases.map(normalizeName));

  const candidates = new Map<string, ExistingNode>();
  for (const node of existingNodes) {
    const nodeName = normalizeName(node.name);
    const nodeAliases = node.aliases.map(normalizeName);
    const isExact = nodeName === normName;
    const isAliasMatch = aliasSet.has(nodeName) || nodeAliases.includes(normName);
    const isContainment =
      !isExact &&
      entity.name.length >= 2 &&
      node.name.length >= 2 &&
      (node.name.includes(entity.name) || entity.name.includes(node.name));
    if (isExact || isAliasMatch || isContainment) {
      candidates.set(node.id, node);
    }
  }

  if (candidates.size === 0) {
    return { matchedId: null, reason: "无本地候选" };
  }

  const candidateList = [...candidates.values()]
    .map((n) => `- ${n.id} ${n.name}（摘要：${n.summary}）`)
    .join("\n");

  try {
    const result = await chat({
      messages: [
        {
          role: "user",
          content: `新知识点：${entity.name}（摘要：${entity.summary}，别名：${entity.aliases.join("、") || "无"}）
图谱中已有相似节点：
${candidateList}
判断新知识点与哪个已有节点是同一概念，还是全新概念。
注意：上下位概念（如"卷积神经网络"与"神经网络"）不算同一概念；不确定时返回 null。
输出严格 JSON：{"match": 节点id 或 null, "reason": "一句话"}`,
        },
      ],
      taskType: "simple",
      responseFormat: "json",
    });

    const parsed = JSON.parse(result.content) as { match?: unknown; reason?: unknown };
    const match = typeof parsed.match === "string" ? parsed.match : null;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    if (match && candidates.has(match)) {
      return { matchedId: match, reason };
    }
    return { matchedId: null, reason: reason || "AI 判定为全新概念" };
  } catch (err) {
    console.error("[graph/ingest] alignment adjudication failed:", err);
    return { matchedId: null, reason: "AI 裁决失败，保守创建新节点" };
  }
}

export async function ingestGraph(input: {
  title: string;
  content: string;
  extracted: GraphExtraction;
}): Promise<IngestResult> {
  const { title, content, extracted } = input;

  // 批内去重：同名实体（大小写不敏感）只处理一次，别名并集
  const batchByName = new Map<string, ExtractedEntity>();
  for (const entity of extracted.entities) {
    const key = normalizeName(entity.name);
    const existing = batchByName.get(key);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, entity.name, ...entity.aliases])];
    } else {
      batchByName.set(key, { ...entity });
    }
  }
  const batchEntities = [...batchByName.values()];

  const existingNodes = (await prisma.graphNode.findMany({
    select: { id: true, name: true, aliases: true, summary: true },
  })).map((n) => ({
    id: n.id,
    name: n.name,
    aliases: readAliases(n.aliases),
    summary: n.summary,
  }));

  // b 段：AI 裁决（仅命中本地候选的实体需要，相互独立并行执行）
  const alignments = await Promise.all(
    batchEntities.map(async (entity) => ({
      entity,
      ...(await alignEntity(entity, existingNodes)),
    }))
  );

  const sourceId = randomUUID();
  const nodeIdByName = new Map<string, string>();
  const excerptByNodeId = new Map<string, string>();
  let newNodes = 0;
  let reusedNodes = 0;
  let newEdges = 0;
  let incrementedEdges = 0;
  let skippedRelations = 0;
  const conflicts: {
    fromName: string;
    toName: string;
    existingRelation: string;
    existingEdgeId: string | null;
    incomingRelation: string;
    incomingEdgeId: string;
    excerpt: string;
  }[] = [];

  await prisma.$transaction(async (tx) => {
    const extractionSnapshot: Prisma.InputJsonValue = {
      domain: extracted.domain,
      entities: extracted.entities.map((e) => ({
        name: e.name,
        aliases: e.aliases,
        summary: e.summary,
      })),
      relations: extracted.relations.map((r) => ({
        from: r.from,
        relation: r.relation,
        to: r.to,
        evidence: r.evidence,
      })),
    };
    await tx.source.create({
      data: {
        id: sourceId,
        title,
        sourceType: "text",
        rawContent: content,
        // 快照本次提炼结果，来源详情页展示用
        metadata: extractionSnapshot,
      },
    });

    for (const { entity, matchedId } of alignments) {
      let nodeId: string;
      if (matchedId) {
        const current = await tx.graphNode.findUnique({
          where: { id: matchedId },
          select: { aliases: true, name: true },
        });
        if (!current) throw new Error(`对齐目标节点不存在: ${matchedId}`);
        // 新名称/别名并入该节点别名表（别名≠主名，主名保持不变）
        const mergedAliases = [
          ...new Set(
            [
              ...readAliases(current.aliases),
              current.name,
              entity.name,
              ...entity.aliases,
            ].filter((a) => a.trim() && a !== current.name)
          ),
        ].slice(0, 20);

        const updated = await tx.graphNode.update({
          where: { id: matchedId },
          data: {
            mentionCount: { increment: 1 },
            aliases: mergedAliases,
          },
          select: { id: true },
        });
        nodeId = updated.id;
        reusedNodes += 1;
      } else {
        const created = await tx.graphNode.create({
          data: {
            name: entity.name,
            aliases: [...new Set(entity.aliases.filter((a) => a.trim()))],
            domain: extracted.domain,
            summary: entity.summary,
          },
          select: { id: true },
        });
        nodeId = created.id;
        newNodes += 1;
      }
      nodeIdByName.set(normalizeName(entity.name), nodeId);
      if (!excerptByNodeId.has(nodeId)) {
        excerptByNodeId.set(nodeId, entity.summary);
      }
    }

    // 关系处理：端点对齐到真实节点 id；已存在的边 weight+1，否则创建；批内+库内冲突检测
    const inBatchPairRelations = new Map<string, Set<string>>();

    for (const rel of extracted.relations) {
      const fromId = nodeIdByName.get(normalizeName(rel.from));
      const toId = nodeIdByName.get(normalizeName(rel.to));
      if (!fromId || !toId || fromId === toId) {
        skippedRelations += 1;
        continue;
      }

      const existingEdge = await tx.graphEdge.findUnique({
        where: {
          fromNodeId_toNodeId_relation: {
            fromNodeId: fromId,
            toNodeId: toId,
            relation: rel.relation,
          },
        },
        select: { id: true },
      });
      let incomingEdgeId: string;
      if (existingEdge) {
        await tx.graphEdge.update({
          where: { id: existingEdge.id },
          data: { weight: { increment: 1 } },
        });
        incomingEdgeId = existingEdge.id;
        incrementedEdges += 1;
      } else {
        const createdEdge = await tx.graphEdge.create({
          data: { fromNodeId: fromId, toNodeId: toId, relation: rel.relation },
          select: { id: true },
        });
        incomingEdgeId = createdEdge.id;
        newEdges += 1;
      }

      // 溯源片段：优先用关系 evidence 覆盖实体摘要
      if (rel.evidence) {
        excerptByNodeId.set(fromId, rel.evidence);
        excerptByNodeId.set(toId, rel.evidence);
      }

      // 冲突检测（第一版只记录不阻塞）：同节点对上语义相反的关系
      const pairKey = `${fromId}|${toId}`;
      const dbEdges = await tx.graphEdge.findMany({
        where: { fromNodeId: fromId, toNodeId: toId },
        select: { relation: true },
      });
      const batchSet = inBatchPairRelations.get(pairKey) ?? new Set<string>();
      const otherRelations = [
        ...dbEdges.map((e) => e.relation),
        ...batchSet,
      ].filter((r) => r !== rel.relation);
      const conflicting = otherRelations.find((r) =>
        isOppositeRelation(r, rel.relation)
      );
      if (conflicting) {
        // 记录旧边的 id，审阅操作（采用新关系/共存）需要
        const existingOppositeEdge = await tx.graphEdge.findFirst({
          where: { fromNodeId: fromId, toNodeId: toId, relation: conflicting },
          select: { id: true },
        });
        conflicts.push({
          fromName: rel.from,
          toName: rel.to,
          existingRelation: conflicting,
          existingEdgeId: existingOppositeEdge?.id ?? null,
          incomingRelation: rel.relation,
          incomingEdgeId,
          excerpt: rel.evidence,
        });
      }
      batchSet.add(rel.relation);
      inBatchPairRelations.set(pairKey, batchSet);
    }

    // NodeSource 溯源：每个涉及节点 upsert 一条（excerpt=关系依据或实体摘要）
    for (const [nodeId, excerpt] of excerptByNodeId) {
      await tx.nodeSource.upsert({
        where: { nodeId_sourceId: { nodeId, sourceId } },
        create: { nodeId, sourceId, excerpt: excerpt.slice(0, 300) },
        update: { excerpt: excerpt.slice(0, 300) },
      });
    }

    // 冲突写入 MergeReview
    for (const c of conflicts) {
      await tx.mergeReview.create({
        data: {
          type: "conflict",
          status: "pending",
          payload: {
            sourceId,
            sourceTitle: title,
            fromName: c.fromName,
            toName: c.toName,
            existingRelation: c.existingRelation,
            existingEdgeId: c.existingEdgeId,
            incomingRelation: c.incomingRelation,
            incomingEdgeId: c.incomingEdgeId,
            incomingExcerpt: c.excerpt,
          },
        },
      });
    }
  });

  return {
    sourceId,
    newNodes,
    reusedNodes,
    newEdges,
    incrementedEdges,
    conflicts: conflicts.length,
    skippedRelations,
    alignments: alignments.map((a) => ({
      name: a.entity.name,
      matched: a.matchedId,
      reason: a.reason,
    })),
  };
}
