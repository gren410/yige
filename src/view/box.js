/* ============================================================
   一格 · 盒内页面（单元5；单元6a 给卡片行加字段小字；单元9a 加「⋯」模板入口）
   点进盒子后看到的东西：左上返回、盒子名大标题 + 右侧「⋯ 模板」「＋ 新建卡片」、
   下面是该盒的卡片流。

   任务书 §8.1：返回按钮固定在左上角，箭头 + 上一层名称。
   卡片行 = 标题 + 一行小字；小字内容由模板的 layout.listFields 决定
   （观影记录就是「2026-08-14 · ★★★★ · 已看」），空值自动跳过。
   ============================================================ */

import { cardTitle } from "../model/card.js";
import { listSummary } from "../model/field.js";
import { densityOf } from "../model/template.js";
import { escapeHtml } from "../util/dom.js";

/**
 * 渲染盒内页面。直接把内容写进 app 容器，点击事件由 main.js 统一委托。
 * @param {object}   opts
 * @param {HTMLElement} opts.app      容器（#app）
 * @param {object}   opts.box          当前盒子
 * @param {object}   opts.template     该盒用的模板（标题兜底 + 列表小字）
 * @param {Array}    opts.cards        该盒的卡片（已排好序）
 * @param {Function} opts.onBack       点返回
 * @param {Function} opts.onNewCard    点「＋」新建卡片
 * @param {Function} opts.onEditTemplate 点「⋯」编辑这个盒子用的模板
 */
export function renderBoxPage({
  app,
  box,
  template,
  cards = [],
  onBack,
  onNewCard,
  onEditTemplate,
}) {
  const rows = cards
    .map((c) => {
      const sub = listSummary(c, template);
      return `
      <div class="card-row" data-card-id="${escapeHtml(c.id)}" role="button" tabindex="0">
        <div class="card-row-title">${escapeHtml(cardTitle(c, template))}</div>
        ${sub ? `<div class="card-row-sub">${escapeHtml(sub)}</div>` : ""}
      </div>`;
    })
    .join("");

  const body = rows
    ? `<div class="card-list ${densityClass(template)}">${rows}</div>`
    : `
      <div class="empty-state">
        <div>这个盒子还是空的</div>
        <div class="empty-state-sub">点右上角「＋」添加第一张卡片</div>
      </div>`;

  app.innerHTML = `
    <header class="page-header box-head">
      <button type="button" class="back-btn">
        <span class="back-arrow" aria-hidden="true">‹</span><span>一格</span>
      </button>
      <div class="box-head-row">
        <h1 class="page-title">${escapeHtml(box.name || "盒子")}</h1>
        <div class="box-head-ops">
          <button type="button" class="tpl-btn" aria-label="编辑模板" title="编辑模板">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="5" cy="12" r="1.9" fill="currentColor"></circle>
              <circle cx="12" cy="12" r="1.9" fill="currentColor"></circle>
              <circle cx="19" cy="12" r="1.9" fill="currentColor"></circle>
            </svg>
          </button>
          <button type="button" class="add-card-btn" aria-label="新建卡片"></button>
        </div>
      </div>
    </header>
    <main class="page-main">${body}</main>`;

  app.querySelector(".back-btn").addEventListener("click", () => onBack?.());
  app.querySelector(".add-card-btn").addEventListener("click", () => onNewCard?.());
  app.querySelector(".tpl-btn").addEventListener("click", () => onEditTemplate?.());
}

/**
 * 松紧度（单元9b · 任务书 §5.2 的 layout.density）：
 * 宽松 / 紧凑，只影响盒内列表的行距和内边距。宽松＝原来的样子。
 */
function densityClass(template) {
  return densityOf(template) === "compact" ? "card-list-compact" : "card-list-loose";
}
