import { prisma } from "@/lib/db";
import { CardType, MasteryLevel, MaterialSourceType, ReviewResult } from "@/generated/prisma/client";

async function main() {
  // 清理旧数据（可选，确保种子可重复执行）
  await prisma.reviewLog.deleteMany();
  await prisma.card.deleteMany();
  await prisma.material.deleteMany();

  // 插入示例材料
  const material = await prisma.material.create({
    data: {
      title: "JavaScript 闭包要点",
      sourceType: MaterialSourceType.text,
      rawContent:
        "闭包是指函数能够记住并访问它的词法作用域，即使这个函数在其词法作用域之外执行。闭包常用于数据私有化和函数工厂。",
      metadata: { topic: "javascript", difficulty: "medium" },
    },
  });

  // 插入 3 张示例卡片
  const cards = await prisma.card.createMany({
    data: [
      {
        materialId: material.id,
        question: "什么是闭包？",
        answer:
          "闭包是指函数能够记住并访问它的词法作用域，即使这个函数在其词法作用域之外执行。",
        hint: "想想作用域链和函数返回函数。",
        cardType: CardType.qa,
        mastery: MasteryLevel.new,
        intervalDays: 0,
        nextReviewAt: new Date(),
        reviewCount: 0,
        lapseCount: 0,
        metadata: { priority: "high" },
      },
      {
        materialId: material.id,
        question: "闭包常用于实现数据 {{c1::私有化}}。",
        answer: "私有化",
        hint: "通过闭包隐藏变量，使其无法从外部直接访问。",
        cardType: CardType.cloze,
        mastery: MasteryLevel.learning,
        intervalDays: 1,
        nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        reviewCount: 1,
        lapseCount: 0,
        metadata: { priority: "medium" },
      },
      {
        materialId: material.id,
        question: "闭包只能用于函数工厂场景。",
        answer: "错误",
        hint: "闭包还可用于模块模式、事件处理等场景。",
        cardType: CardType.judge,
        mastery: MasteryLevel.familiar,
        intervalDays: 3,
        nextReviewAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        reviewCount: 2,
        lapseCount: 1,
        metadata: { priority: "low" },
      },
    ],
  });

  // 为其中一张卡片插入一条复习记录
  const firstCard = await prisma.card.findFirst({
    where: { materialId: material.id },
    orderBy: { createdAt: "asc" },
  });

  if (firstCard) {
    await prisma.reviewLog.create({
      data: {
        cardId: firstCard.id,
        result: ReviewResult.good,
        userAnswer: "函数记住了它的作用域。",
        aiFeedback: "回答基本正确，建议补充“即使在外部执行”这一关键点。",
      },
    });
  }

  console.log(`Seeded material: ${material.id}`);
  console.log(`Seeded ${cards.count} cards`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
