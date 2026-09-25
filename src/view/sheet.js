/* ============================================================
   一格 · 底部弹出面板（单元4）
   iOS 习惯：内容从底部滑上来，上面压一层半透明遮罩。
   收起方式三种：点遮罩 / 点左上「取消」/ 按 Esc（电脑）。

   这个文件只做「容器」——面板里放什么由调用方给（render 回调）。
   动效曲线用任务书 §8.5 指定的 cubic-bezier(0.32, 0.72, 0, 1)。
   ============================================================ */

import { escapeHtml } from "../util/dom.js";

let active = null; // 同一时间只允许一个面板

/**
 * 打开面板。
 * @param {object}   opts
 * @param {string}   opts.title       面板标题
 * @param {string}   opts.confirmText 右下按钮文字（默认「完成」）
 * @param {Function} opts.render      渲染面板内容：render(bodyEl, api)
 * @param {Function} opts.onConfirm   点右下按钮时执行：onConfirm(api)，可 await
 * @returns api 对象：{ close, setConfirmEnabled, setConfirmText }
 */
export function openSheet({ title, confirmText = "完成", render, onConfirm } = {}) {
  closeSheet();

  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay";
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || "")}">
      <div class="sheet-head">
        <button type="button" class="sheet-btn sheet-cancel">取消</button>
        <span class="sheet-title">${escapeHtml(title || "")}</span>
        <button type="button" class="sheet-btn sheet-confirm">${escapeHtml(confirmText)}</button>
      </div>
      <div class="sheet-body"></div>
    </div>`;

  const bodyEl = overlay.querySelector(".sheet-body");
  const confirmBtn = overlay.querySelector(".sheet-confirm");

  const api = {
    close: () => closeSheet(),
    setConfirmEnabled(on) {
      confirmBtn.disabled = !on;
    },
    setConfirmText(text) {
      confirmBtn.textContent = text;
    },
    confirm: () => confirmBtn.click(),
  };

  // 点遮罩关闭（点面板内部不关）
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSheet();
  });
  overlay.querySelector(".sheet-cancel").addEventListener("click", () => closeSheet());

  confirmBtn.addEventListener("click", async () => {
    if (confirmBtn.disabled) return;
    confirmBtn.disabled = true; // 防连点（重复提交）
    try {
      await onConfirm?.(api);
    } catch (err) {
      console.error("操作失败", err);
      confirmBtn.disabled = false;
    }
  });

  render?.(bodyEl, api);

  document.body.appendChild(overlay);
  document.body.classList.add("sheet-open");
  active = overlay;

  // 入场动画：先挂载再改 class，transition 才会跑
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  const onKey = (e) => {
    if (e.key === "Escape") closeSheet();
  };
  document.addEventListener("keydown", onKey);
  overlay._onKey = onKey;

  return api;
}

/** 关闭当前面板（没有则什么都不做） */
export function closeSheet() {
  if (!active) return;
  const overlay = active;
  active = null;

  document.removeEventListener("keydown", overlay._onKey);
  document.body.classList.remove("sheet-open");
  overlay.classList.remove("is-open");

  // 等退场动画走完再移除节点（与 CSS transition 时长一致）
  setTimeout(() => overlay.remove(), 300);
}
