export interface ExtractedEntity {
  name: string;
  aliases: string[];
  summary: string;
}

export interface ExtractedRelation {
  from: string;
  relation: string;
  to: string;
  evidence: string;
}

export interface GraphExtraction {
  domain: string;
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

/**
 * 关系动词归一化（防边碎片化，见 AGENTS.md 图谱退化点②）：
 * ①同义动词映射为标准动词；②互逆动词（属于/源于…）归一为固定方向并调换端点。
 * 在 parseExtraction 阶段统一处理，预览与入库、存量清理脚本共用。
 */
const RELATION_SYNONYMS: Record<string, string> = {
  使用了: "使用",
  采用: "使用",
  应用: "应用于",
  用于: "应用于",
  包括: "包含",
  含有: "包含",
  涵盖: "包含",
  引起: "导致",
  造成: "导致",
  引发: "导致",
  取决于: "需要",
  依赖: "需要",
  是基础: "促进",
  加快: "加速",
  减慢: "延缓",
};

/** 互逆关系：键为遇到的动词，归一为值并把端点对调（B 属于 A → A 包含 B） */
const INVERSE_RELATIONS: Record<string, string> = {
  属于: "包含",
  源于: "导致",
};

/** 非关系噪音词：直接丢弃，不入库（Prompt 已禁止，这里兜底） */
const NOISE_RELATIONS = new Set(["与", "相比", "示例", "相关", "有关", "以及", "和", "或"]);

export function normalizeRelation(rel: {
  from: string;
  relation: string;
  to: string;
}): { from: string; relation: string; to: string } {
  let { from, relation, to } = rel;
  const synonym = RELATION_SYNONYMS[relation];
  if (synonym) relation = synonym;
  const canonical = INVERSE_RELATIONS[relation];
  if (canonical) {
    relation = canonical;
    [from, to] = [to, from];
  }
  return { from, relation, to };
}

export function buildExtractPrompt(content: string): string {
  return `从以下内容中抽取结构化知识，输出严格 JSON：
{"domain":"领域标签（如 计算机/英语/历史）",
 "entities":[{"name":"知识点名","aliases":["别名"],"summary":"一句话解释"}],
 "relations":[{"from":"A","relation":"关系动词","to":"B","evidence":"原文依据片段"}]}
要求：
1. 实体必须是具体概念（不要"文章""作者"这类泛泛实体）
2. 关系动词必须优先从标准动词表中选择（短动词）：是/包含/属于/导致/源于/解决/应用于/促进/抑制/需要/组成/使用/提升/降低
   表中确实没有合适的才自造，自造也用不超过 4 字的短动词；禁止用「与」「相比」「示例」「相关」这类非关系词，不要把名词当关系
3. 只抽取内容明确表达的，禁止脑补
4. entities 控制在 3-15 个，抓重点不求全
内容：
"""
${content}
"""`;
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === "string" && !!s.trim())
    .map((s) => s.trim())
    .slice(0, max);
}

/** 校验 AI 抽取结果结构；relations 引用未抽取实体时过滤（禁止脑补），不合格抛错。 */
export function parseExtraction(raw: unknown): GraphExtraction {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("抽取结果格式错误");
  }
  const obj = raw as Record<string, unknown>;

  const domain = typeof obj.domain === "string" && obj.domain.trim() ? obj.domain.trim() : "未分类";
  if (!Array.isArray(obj.entities)) {
    throw new Error("抽取结果缺少 entities");
  }
  if (!Array.isArray(obj.relations)) {
    throw new Error("抽取结果缺少 relations");
  }

  const entities: ExtractedEntity[] = obj.entities
    .map((e): ExtractedEntity | null => {
      if (typeof e !== "object" || e === null) return null;
      const entity = e as Record<string, unknown>;
      const name = typeof entity.name === "string" ? entity.name.trim() : "";
      if (!name) return null;
      const summary =
        typeof entity.summary === "string" && entity.summary.trim()
          ? entity.summary.trim()
          : "（未提供摘要）";
      return { name, aliases: asStringArray(entity.aliases, 10), summary };
    })
    .filter((e): e is ExtractedEntity => e !== null)
    .slice(0, 20);

  if (entities.length === 0) {
    throw new Error("未能抽取到任何知识点");
  }

  // 实体名归一化集合（大小写不敏感），用于过滤关系端点
  const nameSet = new Set(entities.map((e) => e.name.toLowerCase()));
  const resolveEndpoint = (value: unknown): string | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const name = value.trim();
    if (nameSet.has(name.toLowerCase())) return name;
    // 大小写差异时取实体表里的规范名
    for (const entity of entities) {
      if (entity.name.toLowerCase() === name.toLowerCase()) return entity.name;
    }
    return null;
  };

  const relations: ExtractedRelation[] = obj.relations
    .map((r): ExtractedRelation | null => {
      if (typeof r !== "object" || r === null) return null;
      const rel = r as Record<string, unknown>;
      const from = resolveEndpoint(rel.from);
      const to = resolveEndpoint(rel.to);
      const relation = typeof rel.relation === "string" ? rel.relation.trim() : "";
      const evidence =
        typeof rel.evidence === "string" && rel.evidence.trim()
          ? rel.evidence.trim().slice(0, 300)
          : "";
      if (!from || !to || !relation) return null;
      if (NOISE_RELATIONS.has(relation)) return null;
      const normalized = normalizeRelation({ from, relation, to });
      return { ...normalized, evidence };
    })
    .filter((r): r is ExtractedRelation => r !== null)
    // 归一后同三元组（端点+动词）去重，避免同批内近义/互逆变体重复建边
    .filter(
      (r, i, arr) =>
        arr.findIndex((x) => x.from === r.from && x.relation === r.relation && x.to === r.to) === i
    )
    .slice(0, 40);

  return { domain, entities, relations };
}
