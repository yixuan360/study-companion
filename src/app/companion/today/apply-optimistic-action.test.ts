import { describe, expect, it } from "vitest";
import { applyOptimisticAction, type TodaySection } from "./TodayClient";

function makeSections(): TodaySection[] {
  return [
    {
      goalId: "g1",
      goalTitle: "目标一",
      tasks: [
        { id: "t1", title: "任务1", detail: "", estMinutes: 30, status: "done", resultNote: "旧备注" },
        { id: "t2", title: "任务2", detail: "", estMinutes: 30, status: "pending", resultNote: null },
        { id: "t3", title: "任务3", detail: "", estMinutes: 30, status: "skipped", resultNote: null },
      ],
    },
  ];
}

describe("applyOptimisticAction", () => {
  it("标记完成后状态与备注更新，且任务按 pending→done→skipped 重排", () => {
    const next = applyOptimisticAction(makeSections(), {
      taskId: "t2",
      status: "done",
      resultNote: "完成备注",
    });
    expect(next[0].tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    const t2 = next[0].tasks.find((t) => t.id === "t2")!;
    expect(t2.status).toBe("done");
    expect(t2.resultNote).toBe("完成备注");
  });

  it("撤销（pending）清空备注并排到最前", () => {
    const next = applyOptimisticAction(makeSections(), {
      taskId: "t1",
      status: "pending",
    });
    expect(next[0].tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(next[0].tasks[0].resultNote).toBeNull();
  });

  it("未提供新备注时保留原备注；不改动其他任务", () => {
    const next = applyOptimisticAction(makeSections(), {
      taskId: "t1",
      status: "skipped",
    });
    const t1 = next[0].tasks.find((t) => t.id === "t1")!;
    expect(t1.resultNote).toBe("旧备注");
    expect(next[0].tasks.find((t) => t.id === "t2")!.status).toBe("pending");
  });
});
