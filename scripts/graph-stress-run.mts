/**
 * 图谱压力测试运行器（阶段4验收）
 * 用法：npx tsx scripts/graph-stress-run.mts <start> <end>
 *   按下标区间喂入文章（左闭右开），走真实管线：AI extract → ingest。
 *   结果追加到 scripts/graph-stress-results.json（可用 STRESS_RESULTS 覆盖路径），每 4 篇做一次指标快照。
 *   每篇记录 elapsedMs（extract+ingest  wall time），可用 STRESS_BASE 覆盖服务地址。
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";

const BASE = process.env.STRESS_BASE ?? "http://localhost:3000";
const RESULTS_FILE = process.env.STRESS_RESULTS ?? "scripts/graph-stress-results.json";

interface Expectation {
  entityStem: string; // 实体名关键词
  targetStem: string | null; // 应合并到的节点名关键词；null = 应为全新节点
}

interface Article {
  key: string;
  title: string;
  content: string;
  expect: Expectation[];
}

const articles: Article[] = [
  {
    key: "cnn-basics",
    title: "深度学习基础一：卷积神经网络",
    content:
      "卷积神经网络（CNN，又称 ConvNet）通过卷积核在图像上滑动做局部特征提取，池化层逐步压缩空间尺寸，是图像识别领域的主流模型。经典的 LeNet 和 AlexNet 都属于卷积神经网络。",
    expect: [],
  },
  {
    key: "backprop",
    title: "深度学习基础二：反向传播",
    content:
      "训练神经网络离不开反向传播（BP算法）：损失函数从输出层出发，利用链式法则逐层求出各参数的梯度，再用梯度下降按学习率更新权重。当网络层数加深时，梯度在回传中逐渐变小，出现梯度消失，使底层参数几乎得不到更新。",
    expect: [
      { entityStem: "反向传播", targetStem: "反向传播" },
      { entityStem: "梯度消失", targetStem: "梯度消失" },
    ],
  },
  {
    key: "overfitting",
    title: "深度学习基础三：过拟合与正则化",
    content:
      "过拟合（overfitting）指模型在训练集上表现很好、但在验证集上泛化差。常用正则化手段缓解：L2 正则在损失函数中加入权重平方惩罚，Dropout 在训练时随机丢弃神经元，两者都能抑制过拟合、提升泛化能力。",
    expect: [{ entityStem: "过拟合", targetStem: "过拟合" }],
  },
  {
    key: "resnet",
    title: "深度学习基础四：残差网络",
    content:
      "残差网络（ResNet）引入跳跃连接（shortcut），把输入直接加到输出上，让梯度可以走捷径回传，有效缓解了深层 CNN 的梯度消失问题，使上千层的卷积神经网络训练成为可能。",
    expect: [
      { entityStem: "梯度消失", targetStem: "梯度消失" },
      { entityStem: "CNN", targetStem: "卷积神经网络" },
    ],
  },
  {
    key: "lstm",
    title: "深度学习基础五：LSTM",
    content:
      "长短期记忆网络（LSTM）是循环神经网络（RNN）的改进，通过输入门、遗忘门和输出门控制信息流，细胞状态为梯度提供长距离通道，从而缓解普通 RNN 的梯度消失，适合建模序列数据。",
    expect: [{ entityStem: "梯度消失", targetStem: "梯度消失" }],
  },
  {
    key: "transformer",
    title: "深度学习基础六：Transformer",
    content:
      "Transformer 完全抛弃循环结构，靠自注意力机制（self-attention）让每个位置直接关注序列中所有其他位置，配合位置编码保留顺序信息。相比 LSTM，Transformer 更容易并行训练，是 BERT 和 GPT 的基础。",
    expect: [{ entityStem: "LSTM", targetStem: "长短期记忆" }],
  },
  {
    key: "data-augment",
    title: "深度学习基础七：数据增强与训练技巧",
    content:
      "数据增强通过对训练图像做随机翻转、裁剪、颜色抖动等变换扩充样本多样性，是抑制过拟合的廉价手段。配合批归一化（BatchNorm）稳定各层分布、调好学习率（常用余弦退火衰减），收敛更快更稳。",
    expect: [{ entityStem: "过拟合", targetStem: "过拟合" }],
  },
  {
    key: "pretrain",
    title: "深度学习基础八：预训练与微调",
    content:
      "预训练-微调范式：先在海量语料上自监督预训练（如 BERT 的掩码语言模型），再在具体任务上微调。这种迁移学习让小数据集也能训练出强模型，是 NLP 与图像识别的主流做法。",
    expect: [{ entityStem: "BERT", targetStem: "BERT" }],
  },
  {
    key: "detection",
    title: "深度学习进阶一：目标检测",
    content:
      "目标检测要同时回答有什么和在哪里：YOLO 一类单阶段检测器直接在图像上回归边界框，用 IoU（交并比）衡量预测框与真实框的重合程度。检测网络的骨干通常采用在 ImageNet 上预训练的 CNN。",
    expect: [{ entityStem: "CNN", targetStem: "卷积神经网络" }],
  },
  {
    key: "gan",
    title: "深度学习进阶二：生成对抗网络",
    content:
      "生成对抗网络（GAN）由生成器和判别器博弈训练：生成器伪造样本骗过判别器，判别器努力分辨真假，两者交替优化，最终生成样本逼近真实分布。GAN 广泛用于图像生成与风格迁移。",
    expect: [],
  },
  {
    key: "optimizer",
    title: "深度学习进阶三：优化器与学习率",
    content:
      "优化器决定如何用梯度更新参数：SGD 加动量是经典基线，Adam 会自适应调整每个参数的学习率、对稀疏梯度友好。学习率过大导致震荡不收敛，过小则收敛太慢，常用学习率衰减来平衡。",
    expect: [{ entityStem: "学习率", targetStem: "学习率" }],
  },
  {
    key: "compression",
    title: "深度学习进阶四：模型压缩",
    content:
      "模型压缩让 CNN 能部署到手机端：量化把权重从 FP32 压到 INT8，剪枝删除不重要的连接，知识蒸馏让小模型模仿大模型的输出分布，三者常组合使用以保持精度。",
    expect: [{ entityStem: "CNN", targetStem: "卷积神经网络" }],
  },
  {
    key: "english",
    title: "英语学习方法",
    content:
      "英语听力提升要精听与泛听结合：精听是逐句听写、对照原文找出没听出来的连读弱读；泛听磨耳朵维持语感。影子跟读（shadowing）跟着音频延迟半句复述，同时练语音辨识和口腔肌肉记忆，备考四级很有效。",
    expect: [],
  },
  {
    key: "meiji",
    title: "日本近代史：明治维新",
    content:
      "明治维新是日本近代化的转折点：明治天皇政府提出殖产兴业、文明开化、富国强兵三大政策，全面学习西方技术与制度，废除幕藩体制，使日本快速走上工业化道路，也埋下了军国主义扩张的伏笔。",
    expect: [],
  },
  {
    key: "fitness",
    title: "健身入门：增肌的营养学",
    content:
      "增肌的核心是热量盈余与蛋白质摄入：每公斤体重每天摄入 1.6 到 2.2 克蛋白质，配合渐进超负荷的力量训练刺激肌肉蛋白合成。睡眠不足会升高皮质醇，不利于恢复与增肌。",
    expect: [],
  },
  {
    key: "coffee",
    title: "手冲咖啡入门",
    content:
      "手冲咖啡的关键变量是研磨度、水温和萃取时间：研磨过细加上水温过高会导致过度萃取、苦涩味重；研磨偏粗、水温偏低则萃取不足、味道尖酸。建议中度研磨、92 度左右水温、两分半到三分钟。",
    expect: [],
  },
];

interface ResultRecord {
  seq: number;
  key: string;
  title: string;
  domain: string;
  entities: string[];
  relations: string[];
  newNodes: number;
  reusedNodes: number;
  newEdges: number;
  incrementedEdges: number;
  conflicts: number;
  skippedRelations: number;
  /** extract+ingest 端到端 wall time（毫秒），用于耗时对比 */
  elapsedMs: number;
  alignments: { name: string; matchedId: string | null; matchedName: string | null; reason: string }[];
  expect: Expectation[];
  error?: string;
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function snapshot() {
  const res = await fetch(`${BASE}/api/graph/data`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.msg);
  const { nodes, edges, stats } = json.data;
  const degree = new Map<string, number>();
  const pairEdges = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    const pair = [e.source, e.target].sort().join("|");
    pairEdges.set(pair, (pairEdges.get(pair) ?? 0) + 1);
  }
  const isolated = nodes.filter((n: { id: string }) => !degree.get(n.id));
  return {
    stats,
    isolatedCount: isolated.length,
    isolatedNames: isolated.map((n: { name: string }) => n.name),
    maxPairEdgeCount: Math.max(0, ...pairEdges.values()),
    multiEdgePairs: [...pairEdges.values()].filter((c) => c > 1).length,
    mentionGe2: nodes.filter((n: { value: number }) => n.value >= 2).length,
    nodes: nodes.map((n: { name: string; value: number; domain: string }) => ({
      name: n.name,
      mention: n.value,
      domain: n.domain,
    })),
  };
}

async function main() {
  const start = Number(process.argv[2] ?? 0);
  const end = Number(process.argv[3] ?? articles.length);
  const idToName = new Map<string, string>();
  try {
    if (existsSync(RESULTS_FILE)) {
      const prev = JSON.parse(readFileSync(RESULTS_FILE, "utf8"));
      for (const r of prev) {
        for (const a of r.alignments ?? []) {
          if (a.matchedId && a.matchedName) idToName.set(a.matchedId, a.matchedName);
        }
      }
    }
  } catch {
    // 忽略历史文件解析失败
  }

  for (let i = start; i < Math.min(end, articles.length); i++) {
    const article = articles[i];
    const articleStart = Date.now();
    process.stdout.write(`[${i + 1}/${articles.length}] ${article.title} … `);

    // 1) AI 抽取
    const er = await post("/api/graph/extract", {
      title: article.title,
      content: article.content,
    });
    if (er.code !== 0) {
      console.log(`抽取失败: ${er.msg}`);
      appendFileSync(
        RESULTS_FILE,
        JSON.stringify({ seq: i + 1, key: article.key, title: article.title, error: er.msg }) + "\n"
      );
      continue;
    }
    const extraction = er.data.extraction;

    // 2) 确认入库（等价于用户在预览页点确认）
    const ir = await post("/api/graph/ingest", {
      title: article.title,
      content: article.content,
      extracted: extraction,
    });
    if (ir.code !== 0) {
      console.log(`入库失败: ${ir.msg}`);
      appendFileSync(
        RESULTS_FILE,
        JSON.stringify({ seq: i + 1, key: article.key, title: article.title, error: ir.msg }) + "\n"
      );
      continue;
    }
    const r = ir.data;

    // 补齐 matchedId → 节点名映射（拿全量节点对照）
    const dataRes = await fetch(`${BASE}/api/graph/data`);
    const dataJson = await dataRes.json();
    for (const n of dataJson.data.nodes) idToName.set(n.id, n.name);

    const record: ResultRecord = {
      seq: i + 1,
      key: article.key,
      title: article.title,
      domain: extraction.domain,
      entities: extraction.entities.map((e: { name: string }) => e.name),
      relations: extraction.relations.map(
        (x: { from: string; relation: string; to: string }) => `${x.from}|${x.relation}|${x.to}`
      ),
      newNodes: r.newNodes,
      reusedNodes: r.reusedNodes,
      newEdges: r.newEdges,
      incrementedEdges: r.incrementedEdges,
      conflicts: r.conflicts,
      skippedRelations: r.skippedRelations,
      elapsedMs: Date.now() - articleStart,
      alignments: r.alignments.map((a: { name: string; matched: string | null; reason: string }) => ({
        name: a.name,
        matchedId: a.matched,
        matchedName: a.matched ? idToName.get(a.matched) ?? "?" : null,
        reason: a.reason,
      })),
      expect: article.expect,
    };

    appendFileSync(RESULTS_FILE, JSON.stringify(record) + "\n");
    console.log(
      `+${r.newNodes} 新节点 / ${r.reusedNodes} 复用 / +${r.newEdges} 边(+${r.incrementedEdges}权重) / ${r.conflicts} 冲突 / 跳过${r.skippedRelations}（${Date.now() - articleStart}ms）`
    );

    if ((i + 1) % 4 === 0) {
      const s = await snapshot();
      appendFileSync(RESULTS_FILE, JSON.stringify({ checkpoint: i + 1, ...s }) + "\n");
      console.log(
        `  ▓ 快照@${i + 1}: 节点${s.stats.nodeCount} 边${s.stats.edgeCount} 来源${s.stats.sourceCount} | 孤立${s.isolatedCount} | mention≥2:${s.mentionGe2} | 最大节点对边数:${s.maxPairEdgeCount}`
      );
    }
  }
  console.log("done");
}

main().catch((err) => {
  console.error("runner failed:", err);
  process.exit(1);
});
