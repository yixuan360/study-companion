export interface ScheduleEntry {
  hour: number;
  minute: number;
  /** 0=周日 … 6=周六；缺省表示每天 */
  weekday?: number;
}

/** 判断某本地时刻是否命中时刻表项。纯函数。 */
export function matchesSchedule(entry: ScheduleEntry, date: Date): boolean {
  return (
    date.getHours() === entry.hour &&
    date.getMinutes() === entry.minute &&
    (entry.weekday === undefined || date.getDay() === entry.weekday)
  );
}
