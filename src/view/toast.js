/* ============================================================
   一格 · 底部小条 Toast（单元8）
   任务书 §8.5：「Toast 带撤销」。

   删掉一张卡片之后，底下滑出一条「卡片已删除 ｜ 撤销」，
   停留 3 秒自己消失；这 3 秒里点「撤销」就能马上把它找回来。

   同一时间只留一条：删第二张的时候，上一条的「撤销」自动作废
   （H1 就这个策略，够用且不会出现「点了撤销却恢复错了那张」）。

   iOS 上 navigator.vibrate 完全不可用（任务书 §8.5），
   所以手感全靠视觉：滑入 + 淡入，点「撤销」有瞬时高亮。
   ============================================================ */

import { escapeHtml } from "../util/dom.js";

/** 小条停留多久（毫秒）—— 任务书没规定，取 iOS 上常见的一档 */
const DEFAULT_MS = 3000;

/** 退场动画时长，要和 styles.css 里 .toast 的 transition 对得上 */
const EXIT_MS = 240;

let active = null;

/**
 * 弹一条小条。
 * @param {object} opts
 * @param {string}   opts.message     一句话，如「卡片已删除」
 * @param {string}   [opts.actionText] 按钮文字，如「撤销」；不给就只有文字
 * @param {Function} [opts.onAction]  点按钮时执行（可 async）
 * @param {number}   [opts.duration]  停留毫秒，默认 3000
 */
export function showToast({ message, actionText, onAction, duration = DEFAULT_MS } = {}) {
  closeToast(true); // 上一条直接拿掉：两条重叠在一起会看着像花了屏

  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.innerHTML = `
    <span class="toast-msg">${escapeHtml(message || "")}</span>
    ${actionText ? `<button type="button" class="toast-action">${escapeHtml(actionText)}</button>` : ""}`;

  const actionBtn = el.querySelector(".toast-action");
  const timer = setTimeout(() => closeToast(), duration);

  actionBtn?.addEventListener("click", () => {
    clearTimeout(timer);
    closeToast();
    // 先收掉小条再干活：点完 3 秒内马上有反馈，不用等写库
    Promise.resolve()
      .then(() => onAction?.())
      .catch((err) => console.error("撤销失败", err));
  });

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open"));

  active = { el, timer };
}

/**
 * 收起当前小条。
 * @param {boolean} [instant] 立刻拿掉（不播退场动画）—— 被下一条顶掉时用
 */
export function closeToast(instant) {
  if (!active) return;
  const { el, timer } = active;
  active = null;

  clearTimeout(timer);
  if (instant) {
    el.remove();
    return;
  }
  el.classList.remove("is-open");
  setTimeout(() => el.remove(), EXIT_MS);
}
