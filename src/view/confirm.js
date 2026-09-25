/* ============================================================
   一格 · 居中确认弹窗（单元8）
   任务书 §8.5：「破坏性操作二次确认 + danger 样式」。

   为什么单独做一个、不复用底部面板（sheet.js）：
   iOS 上「从底部滑上来」是用来装内容和表单的；问「你确定要删吗」用的是
   屏幕正中的小方框。删除是这个应用里唯一不可逆的动作（30 天后数据真没了），
   弹窗的样子必须让人一眼意识到「这不是普通的输入面板」。

   用法（拿一个 true/false，最顺手）：
     const ok = await openConfirm({ title: "删除这张卡片？", confirmText: "删除", danger: true });
     if (!ok) return;

   关闭方式三种：点「取消」/ 点弹窗外面 / 按 Esc（电脑）。
   ============================================================ */

import { escapeHtml } from "../util/dom.js";

let active = null; // 同一时间只允许一个

/**
 * 打开确认弹窗。
 * @param {object} opts
 * @param {string}  opts.title        标题（一句问话）
 * @param {string}  [opts.message]    补充说明，可省
 * @param {string}  [opts.confirmText] 右边按钮文字，默认「确定」
 * @param {string}  [opts.cancelText]  左边按钮文字，默认「取消」
 * @param {boolean} [opts.danger]      是不是破坏性操作（按钮变红）
 * @returns {Promise<boolean>} 点确定 → true；取消 / 点外面 / Esc → false
 */
export function openConfirm({
  title,
  message = "",
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
} = {}) {
  closeConfirm();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm" role="alertdialog" aria-modal="true"
           aria-labelledby="confirm-title"${message ? ' aria-describedby="confirm-msg"' : ""}
           tabindex="-1">
        <div class="confirm-body">
          <div class="confirm-title" id="confirm-title">${escapeHtml(title || "")}</div>
          ${message ? `<div class="confirm-msg" id="confirm-msg">${escapeHtml(message)}</div>` : ""}
        </div>
        <div class="confirm-actions">
          <button type="button" class="confirm-btn confirm-cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="confirm-btn confirm-ok${danger ? " is-danger" : ""}">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;

    const dialog = overlay.querySelector(".confirm");

    /** 收场：先让调用方拿到答案，再播退场动画 */
    function finish(answer) {
      if (active !== entry) return; // 已经被关过了，别再答一次
      active = null;
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("confirm-open");
      overlay.classList.remove("is-open");
      setTimeout(() => overlay.remove(), 240);
      resolve(answer);
    }

    const entry = { finish };

    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
    };

    // 点弹窗外面 = 取消（点弹窗内部不关）
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });
    overlay.querySelector(".confirm-cancel").addEventListener("click", () => finish(false));
    overlay.querySelector(".confirm-ok").addEventListener("click", () => finish(true));

    document.body.appendChild(overlay);
    document.body.classList.add("confirm-open");
    active = entry;

    // 入场动画：先挂载再改 class，transition 才会跑
    requestAnimationFrame(() => overlay.classList.add("is-open"));

    document.addEventListener("keydown", onKey);

    /* 焦点给弹窗本身而不是按钮：
       ① 放在「确定」上，电脑上顺手一个回车就把东西删了，太危险；
       ② 放在弹窗上（无外框）键盘的 Esc / Tab 依然正常 */
    dialog.focus();
  });
}

/** 关掉当前弹窗（没有则什么都不做）。离开页面时兜底用 ——
 *  走的是同一条收场路径，等待中的那个 Promise 会拿到「取消」，不会永远挂着。 */
export function closeConfirm() {
  if (!active) return;
  active.finish(false);
}
