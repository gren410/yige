/* ============================================================
   一格 · PWA 装配（单元10）
   两件事：

   ① 注册离线缓存（sw.js）。只有 https 或 localhost 能注册成功，
      局域网 http 打开时浏览器会拒绝 —— 静默跳过，页面照常可用。

   ② 「添加到主屏幕」提示。任务书 §8.8 要求「创建完提示**一次**」，
      理由很硬：iOS 上 7 天不打开一个网站，系统会静默清空它的数据，
      加到主屏才留得住。所以这条提示不是拉新，是保数据。
      - 只在 iPhone / iPad 上出现（电脑上没有「加到主屏」这回事）
      - 已经在主屏里独立运行（standalone）时不再出现
      - 出现这一次就记账，之后永远不再打扰（§8.8「之后不再打扰」）
      - 按 §3336 / §3472 的告知义务，明说主屏那个「一格」和 Safari 里
        这个不是同一个空间、数据不互通
   ============================================================ */

import { db } from "../storage/db.js";

/* 记账的键名带版本号：将来改了提示文案想再提示一次，把 .v1 改成 .v2 即可 */
const HINT_KEY = "hint.addToHome.v1";

/** 是不是 iPhone / iPad（电脑上的触屏 Mac 也算） */
function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** 现在是不是「从主屏图标打开的」而不是浏览器标签页 */
export function isStandalone() {
  return (
    navigator.standalone === true ||
    (!!window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
  );
}

/** 注册离线缓存。失败只是没有离线能力，不影响任何功能，所以只记一条 console。 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .catch((err) => {
      console.info("离线缓存没装上（不影响使用）：", err.message);
    });
}

/**
 * 首次提示「添加到主屏幕」。调用一次即可，内部自己判断该不该出现。
 */
export async function maybeShowHomeScreenHint() {
  if (!isIos() || isStandalone()) return;
  try {
    if (await db.getSetting(HINT_KEY)) return;
    // 先记账再显示：万一用户没点「知道了」就切走，也不至于每次打开都弹
    await db.setSetting(HINT_KEY, { at: new Date().toISOString() });
  } catch (err) {
    console.info("提示记账失败，跳过这次提示：", err.message);
    return;
  }
  showHint();
}

function showHint() {
  const el = document.createElement("div");
  el.className = "hs-hint";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "添加到主屏幕");
  el.innerHTML = `
    <div class="hs-hint-main">
      <p class="hs-hint-title">把「一格」放到主屏</p>
      <p class="hs-hint-text">点 Safari 底下的分享按钮，选「添加到主屏幕」。</p>
      <p class="hs-hint-note">主屏上那个「一格」是独立的一份，第一次打开是空的 —— 两边的卡片不会互相出现。</p>
    </div>
    <button type="button" class="hs-hint-ok">知道了</button>`;

  const close = () => {
    el.classList.remove("is-open");
    setTimeout(() => el.remove(), 300); // 与 CSS 退场时长一致
  };
  el.querySelector(".hs-hint-ok").addEventListener("click", close);

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open")); // 先挂载再改 class，动画才会跑
}
