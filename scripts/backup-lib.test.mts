import { describe, expect, it } from "vitest";
import { pickBackupsToDelete } from "./backup-lib.mts";

describe("pickBackupsToDelete", () => {
  it("份数不超过 keep 时不删", () => {
    const files = ["dev-20260901-0330.db", "dev-20260902-0330.db"];
    expect(pickBackupsToDelete(files, 14)).toEqual([]);
  });

  it("超过 keep 时删除最旧的，保留最新 keep 份", () => {
    const files = [
      "dev-20260903-0330.db",
      "dev-20260901-0330.db",
      "dev-20260902-0330.db",
    ];
    expect(pickBackupsToDelete(files, 2)).toEqual(["dev-20260901-0330.db"]);
  });

  it("忽略非备份命名的文件", () => {
    const files = ["dev-20260901-0330.db", "notes.txt", ".gitkeep", "dev-20260902-0330.db"];
    expect(pickBackupsToDelete(files, 1)).toEqual(["dev-20260901-0330.db"]);
  });
});
