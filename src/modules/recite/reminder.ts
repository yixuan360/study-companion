import { pushToUser } from "@/lib/push";
import { getTodayReviewCards } from "./today";

export interface ReminderResult {
  success: boolean;
  dueCount: number;
  error?: string;
}

/**
 * 推送「今日待复习」提醒到默认通道（Server 酱 Turbo）。
 * 供 cron 路由或手动触发使用，推送失败不影响调用方。
 */
export async function sendDailyReviewReminder(): Promise<ReminderResult> {
  const { totalCount } = await getTodayReviewCards();

  const title =
    totalCount > 0 ? `学习伴侣：今日有 ${totalCount} 张卡片待复习` : "学习伴侣：今日复习已全部完成";

  const content =
    totalCount > 0
      ? `打开学习伴侣，开始今日复习：\n\n待复习卡片：${totalCount} 张\n\n${new Date().toLocaleString("zh-CN")}`
      : `今天没有待复习的卡片，好好休息或录入新材料吧。\n\n${new Date().toLocaleString("zh-CN")}`;

  const result = await pushToUser({ title, content });

  return {
    success: result.success,
    dueCount: totalCount,
    error: result.success ? undefined : result.error,
  };
}
