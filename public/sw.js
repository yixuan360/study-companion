// 最小 service worker：只为满足 PWA 安装条件，network-only 不做离线缓存，
// 避免自用阶段缓存旧页面。HTTPS 部署后自动激活完整安装能力。
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // 透传：不调用 respondWith，浏览器走默认网络请求
});
