/** 备份文件命名：dev-YYYYMMDD-HHmm.db */
const BACKUP_NAME = /^dev-\d{8}-\d{4}\.db$/;

/** 从目录文件名列表中挑出应删除的备份（只保留最新 keep 份）。纯函数。 */
export function pickBackupsToDelete(files: string[], keep = 14): string[] {
  const backups = files.filter((f) => BACKUP_NAME.test(f)).sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}
