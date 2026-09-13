# 学习伴侣（study-companion）

单体模块化学习管理应用：背诵（艾宾浩斯）、备考陪伴、班级 DDL、知识图谱。

技术栈：Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 (SQLite)。

## 开发

```bash
npm install
npx prisma migrate deploy
npm run dev        # http://localhost:3000
npm test           # vitest
npm run build      # 生产构建
```

环境变量见 `.env.example`（AI key / Server酱 SendKey / CRON_SECRET）。

## 本地自用部署（局域网生产模式）

```bash
npm run build
npm run start:local   # next start(0.0.0.0:3000) + 定时调度器
```

- 手机连**同一 Wi-Fi**，浏览器访问 `http://<电脑局域网IP>:3000`（Windows 用 `ipconfig` 查「无线局域网适配器」的 IPv4 地址，如 `192.168.1.5`）。首次连接 Windows 防火墙若弹窗请放行 3000 端口。
- 手机浏览器菜单选「添加到主屏幕」，桌面图标即点即用（HTTPS 部署后升级为完整 PWA）。
- 调度器负责：08:00 / 20:00 班级推送、20:30 背诵提醒、周日 21:00 周报生成、03:30 数据库备份（`backups/`，保留 14 份）。
- 推送走 Server酱到微信：先在微信关注 Server酱服务号，并在 `/classroom/settings` 绑定 SendKey，用 `/dev/push-test` 验证。
- 调试定时任务：`npx tsx scripts/scheduler.mts --now` 立即全量执行一遍。
- 停止：`Ctrl+C`。

项目约定与模块机制见 `AGENTS.md`。
