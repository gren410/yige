/* ============================================================
   一格 · 主题（单元10）
   任务书 §9.6：深浅色跟随系统自动切换，没有手动开关。

   绝大多数颜色是 CSS 变量（styles.css 里两套 :root），跟着系统自动变。
   但盒子图标是**画进 SVG 的固定色值**，CSS 变量管不到它 ——
   它得自己问一句「现在是不是深色」，所以集中在这里，
   不让各处视图各写一份 matchMedia。
   ============================================================ */

const QUERY = "(prefers-color-scheme: dark)";

/** 现在系统是不是深色 */
export function prefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * 系统明暗切换时回调（macOS / Windows 到点自动切、iOS 到点自动切都会触发）。
 * @returns 取消监听的函数
 */
export function watchSystemTheme(onChange) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  const handler = () => onChange(mq.matches);
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else if (mq.addListener) mq.addListener(handler); // 老 Safari 的写法
  return () => {
    if (mq.removeEventListener) mq.removeEventListener("change", handler);
    else if (mq.removeListener) mq.removeListener(handler);
  };
}
