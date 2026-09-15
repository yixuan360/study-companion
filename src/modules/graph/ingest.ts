import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { chat, embedTexts, getEmbeddingConfig } from "@/lib/ai";
import type { Prisma } from "@/generated/prisma/client";
import {
  RECALL_TOP_K,
  embedTextOf,
  recallCandidates,
  type RecallableNode,
} from "./candidates";
import {
  ADJUDICATION_BATCH_SIZE,
  buildBatchPrompt,
  chunkItems,
  parseBatchVerdicts,
  type AdjudicationItem,
} from "./adjudicate";
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

function readMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readEmbedding(value: unknown): number[] | null {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
    ? value
    : null;
}

interface ExistingNode extends RecallableNode {
  summary: string;
  /** 原始 metadata（回填 embedding 时无损合并其余键） */
  metadata: Record<string, unknown>;
}

/**
 * 三段式实体对齐：
 * a. 规则候选——name 精确 / aliases 包含 / name 双向包含（全量内存匹配，O(N)，
 *    与召回层同一趟循环完成；N 破千后本层开销不变，因为不再依赖它单独产出候选）。
 * b. 相似度召回——embedding 可用走向量余弦 top-K（向量存 metadata，惰性回填），
 *    否则字符 n-gram 余弦兜底；与规则命中取并集，召回率不低于原两段式。
 * c. AI 裁决——有候选的实体按 ADJUDICATION_BATCH_SIZE 批量裁决（一次 chat 裁多项），
 *    缺失/非法项逐条兜底；上下位不算同一概念，不确定返回 null，失败保守建新。
 */

interface CandidateBackedEntity {
  entity: ExtractedEntity;
  candidateList: ExistingNode[];
}

/** a+b 段：规则候选与相似度召回取并集，按 top-K 截断（约束 Prompt 大小） */
async function collectCandidateList(
  entity: ExtractedEntity,
  existingNodes: ExistingNode[]
): Promise<ExistingNode[]> {
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

  const embedConfig = getEmbeddingConfig();
  const recalled = await recallCandidates(
    { name: entity.name, aliases: entity.aliases },
    existingNodes,
    embedConfig
      ? { model: embedConfig.model, embedTexts: (texts) => embedTexts({ texts, module: "实体对齐" }) }
      : undefined
  );
  for (const { node } of recalled) {
    candidates.set(node.id, node);
  }

  return [...candidates.values()].slice(0, RECALL_TOP_K);
}

function toAdjudicationItem(
  index: number,
  { entity, candidateList }: CandidateBackedEntity
): AdjudicationItem {
  return {
    index,
    name: entity.name,
    aliases: entity.aliases,
    summary: entity.summary,
    candidates: candidateList.map((n) => ({
      id: n.id,
      name: n.name,
      summary: n.summary,
    })),
  };
}

/** c 段单条路径（批量缺项/整批失败的兜底，也用于 alignEntity 单实体入口） */
async function adjudicateOne(
  entity: ExtractedEntity,
  candidateList: ExistingNode[]
): Promise<{ matchedId: string | null; reason: string }> {
  const candidateText = candidateList
    .map((n) => `- ${n.id} ${n.name}（摘要：${n.summary}）`)
    .join("\n");

  try {
    const result = await chat({
      messages: [
        {
          role: "user",
          content: `新知识点：${entity.name}（摘要：${entity.summary}，别名：${entity.aliases.join("、") || "无"}）
图谱中已有相似节点：
${candidateText}
判断新知识点与哪个已有节点是同一概念，还是全新概念。
注意：
1. 上下位概念（如"卷积神经网络"与"神经网络"）不算同一概念；不确定时返回 null。
2. 参数与权重应区分为不同概念：参数是可训练变量的统称，权重只是参数的一种。
3. 策略与其作用对象、现象与其缓解手段、统称与具体实例都不算同一概念（如"学习率衰减"≠"学习率"）；宁可新建也不要错合。
输出严格 JSON：{"match": 节点id 或 null, "reason": "一句话"}`,
        },
      ],
      taskType: "simple",
      module: "实体对齐",
      responseFormat: "json",
    });

    const parsed = JSON.parse(result.content) as { match?: unknown; reason?: unknown };
    const match = typeof parsed.match === "string" ? parsed.match : null;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    const candidateIds = new Set(candidateList.map((n) => n.id));
    if (match && candidateIds.has(match)) {
      return { matchedId: match, reason };
    }
    return { matchedId: null, reason: reason || "AI 判定为全新概念" };
  } catch (err) {
    console.error("[graph/ingest] alignment adjudication failed:", err);
    return { matchedId: null, reason: "AI 裁决失败，保守创建新节点" };
  }
}

/**
 * c 段批量路径：一批实体一次 chat()。解析后逐项校验：
 * ok 项直接采用；invalid 项（缺失/非法）逐条兜底重裁；整批失败全部逐条兜底。
 */
async function adjudicateBatch(
  items: CandidateBackedEntity[]
): Promise<{ matchedId: string | null; reason: string }[]> {
  const promptItems = items.map((it, i) => toAdjudicationItem(i + 1, it));
  try {
    const result = await chat({
      messages: [{ role: "user", content: buildBatchPrompt(promptItems) }],
      taskType: "simple",
      module: "实体对齐",
      responseFormat: "json",
    });
    const verdicts = parseBatchVerdicts(JSON.parse(result.content), promptItems);
    return await Promise.all(
      verdicts.map((v, i) => {
        if (v.status === "ok") {
          return {
            matchedId: v.matchedId,
            reason: v.matchedId ? v.reason : v.reason || "AI 判定为全新概念",
          };
        }
        console.warn(
          `[graph/ingest] 批量裁决第 ${promptItems[i].index} 项（${items[i].entity.name}）缺失/非法，逐条兜底`
        );
        return adjudicateOne(items[i].entity, items[i].candidateList);
      })
    );
  } catch (err) {
    console.error(
      "[graph/ingest] batch adjudication failed, fallback to per-entity:",
      err
    );
    return Promise.all(
      items.map(({ entity, candidateList }) => adjudicateOne(entity, candidateList))
    );
  }
}

/** 单实体对齐入口（保留原接口；批量流程的逐条兜底也复用其中逻辑） */
export async function alignEntity(
  entity: ExtractedEntity,
  existingNodes: ExistingNode[]
): Promise<{ matchedId: string | null; reason: string }> {
  const candidateList = await collectCandidateList(entity, existingNodes);
  if (candidateList.length === 0) {
    return { matchedId: null, reason: "无本地候选" };
  }
  return adjudicateOne(entity, candidateList);
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

  const existingNodes: ExistingNode[] = (await prisma.graphNode.findMany({
    select: { id: true, name: true, aliases: true, summary: true, metadata: true },
  })).map((n) => {
    const metadata = readMetadata(n.metadata);
    return {
      id: n.id,
      name: n.name,
      aliases: readAliases(n.aliases),
      summary: n.summary,
      metadata,
      embedding: readEmbedding(metadata.embedding),
      embeddingModel:
        typeof metadata.embeddingModel === "string" ? metadata.embeddingModel : null,
    };
  });

  // embedding 惰性回填：配置了 embedding 服务且节点缺失/模型过期时补向量（失败降级 n-gram）
  const embedConfig = getEmbeddingConfig();
  if (embedConfig) {
    const stale = existingNodes.filter(
      (n) => !n.embedding || n.embeddingModel !== embedConfig.model
    );
    if (stale.length > 0) {
      try {
        const vectors = await embedTexts({
          texts: stale.map(embedTextOf),
          module: "实体对齐",
        });
        await Promise.all(
          stale.map((n, i) =>
            prisma.graphNode.update({
              where: { id: n.id },
              data: {
                metadata: {
                  ...n.metadata,
                  embedding: vectors[i],
                  embeddingModel: embedConfig.model,
                },
              },
            })
          )
        );
        stale.forEach((n, i) => {
          n.embedding = vectors[i];
          n.embeddingModel = embedConfig.model;
        });
      } catch (err) {
        console.error("[graph/ingest] embedding 回填失败，降级 n-gram 召回:", err);
      }
    }
  }

  // c 段：AI 裁决。先并行收集并集候选；无候选的实体直接判"无本地候选"，
  // 有候选的按批批量裁决（一次 chat 裁多项，缺项/整批失败逐条兜底），保持原顺序
  const collected: CandidateBackedEntity[] = await Promise.all(
    batchEntities.map(async (entity) => ({
      entity,
      candidateList: await collectCandidateList(entity, existingNodes),
    }))
  );
  const toAdjudicate = collected.filter((c) => c.candidateList.length > 0);
  const batches = chunkItems(toAdjudicate, ADJUDICATION_BATCH_SIZE);
  const batchResults = await Promise.all(
    batches.map((batch) => adjudicateBatch(batch))
  );
  const verdictByEntity = new Map<
    ExtractedEntity,
    { matchedId: string | null; reason: string }
  >();
  for (const c of collected) {
    if (c.candidateList.length === 0) {
      verdictByEntity.set(c.entity, { matchedId: null, reason: "无本地候选" });
    }
  }
  batches.forEach((batch, i) => {
    batch.forEach((item, j) => {
      verdictByEntity.set(item.entity, batchResults[i][j]);
    });
  });
  const alignments = collected.map((c) => ({
    entity: c.entity,
    ...verdictByEntity.get(c.entity)!,
  }));

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
