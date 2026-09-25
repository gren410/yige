/* ============================================================
   一格 · 离线缓存（单元10）
   任务书 §3：零依赖、无后端。这个文件只是一层「网页本身的缓存」，
   数据从来就在 IndexedDB 里，跟它无关。

   策略：**在线优先**（用户定的）
   - 每次请求先走网络：拿到就用新的，顺手把新版本存进缓存。
   - 网络不通（飞机上、地铁里）才回落到上一次存下的版本。
   之所以不用「缓存优先」，是因为缓存优先会让改过的代码迟迟不生效 ——
   这项目是纯静态站，代码一改就得马上看到。

   只有 https 或 localhost 才允许注册 Service Worker：
   - GitHub Pages 上是 https，正常启用；
   - 电脑上 127.0.0.1 预览，也算安全来源，能启用（方便自检）；
   - 手机用局域网 http://192.168.x.x 打开时浏览器会拒绝注册，
     这不是 bug —— 那种情况下页面照常可用，只是断网打不开。

   改动这个文件后一定要把 VERSION 的数字加一，否则老缓存不会被清掉。
   ============================================================ */

const VERSION = "yige-v1";

/* 应用外壳：改代码新增文件时，记得往这里补一行（漏了的文件断网打不开） */
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./src/main.js",
  "./src/router.js",
  "./src/media/image.js",
  "./src/model/card.js",
  "./src/model/colors.js",
  "./src/model/field.js",
  "./src/model/presets.js",
  "./src/model/template.js",
  "./src/model/timer.js",
  "./src/model/todo.js",
  "./src/state/store.js",
  "./src/storage/dao.js",
  "./src/storage/db.js",
  "./src/util/color.js",
  "./src/util/dom.js",
  "./src/util/format.js",
  "./src/util/id.js",
  "./src/view/box-icon.js",
  "./src/view/box.js",
  "./src/view/card-detail.js",
  "./src/view/card-view.js",
  "./src/view/confirm.js",
  "./src/view/field-control.js",
  "./src/view/new-box.js",
  "./src/view/new-card.js",
  "./src/view/pwa.js",
  "./src/view/sheet.js",
  "./src/view/template-editor.js",
  "./src/view/theme.js",
  "./src/view/toast.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      /* 一个一个加：开发服务器会给响应加 no-store，Cache API 会拒收这种响应，
         用 addAll 会整批失败、一个都存不下；逐个加 + 各自吞掉错误，
         存不上的那一个不影响其它文件进缓存。 */
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting(); // 新版本立刻接管，不等所有页面关掉
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== VERSION) await caches.delete(key); // 清掉上一版
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 别人家的东西不插手

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);

  try {
    const fresh = await fetch(req);
    // 只存正常响应（跨域 opaque 和 4xx/5xx 都不存）
    if (fresh && fresh.ok && fresh.type !== "opaqueredirect") {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;

    // 整页导航兜底：任何一个地址断网都退回入口页，由应用内路由接管
    if (req.mode === "navigate") {
      const shell = (await cache.match("./index.html")) || (await cache.match("./"));
      if (shell) return shell;
    }
    throw err;
  }
}
