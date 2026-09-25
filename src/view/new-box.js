/* ============================================================
   一格 · 新建盒子（单元4）
   任务书 H1 验收项：能新建盒子 —— 选模板、选颜色（自动分配未使用的色）、填名字。

   面板里就三样东西：名字 / 模板 / 颜色。
   颜色默认高亮「12 色板里第一个还没被用过的色」，用户可改（但不给自由取色，
   任务书 §15 明确禁止，自选极易调出脏色）。
   ============================================================ */

import { BOX_COLORS, pickUnusedColor } from "../model/colors.js";
import { createBox } from "../storage/dao.js";
import { escapeHtml } from "../util/dom.js";
import { openSheet } from "./sheet.js";

const NAME_MAX = 30;

/** 模板副标题：几个字段 + 前三个字段名，让用户知道这模板能记什么 */
function templateSummary(tpl) {
  const labels = (tpl.fields || []).slice(0, 3).map((f) => f.label);
  const more = (tpl.fields || []).length > labels.length ? " …" : "";
  return `${(tpl.fields || []).length} 个字段 · ${labels.join(" · ")}${more}`;
}

/**
 * 打开「新建盒子」面板。
 * @param {object}   opts
 * @param {Array}    opts.templates     可选模板（＝现有全部模板）
 * @param {string[]} opts.usedColorKeys 已被占用的色（用于自动配色）
 * @param {Function} opts.onCreated     创建成功后的回调（主界面用它刷新网格）
 */
export function openNewBox({ templates = [], usedColorKeys = [], onCreated } = {}) {
  // 表单状态（闭包内维护，onConfirm 里读）
  const autoColor = pickUnusedColor(usedColorKeys);
  let colorKey = autoColor.key;
  let templateId = templates[0] ? templates[0].id : "";

  openSheet({
    title: "新建盒子",
    confirmText: "创建",

    render(body, api) {
      body.innerHTML = `
        <div class="nb-section">
          <label class="nb-label" for="nb-name">名字</label>
          <input id="nb-name" class="nb-input" type="text" maxlength="${NAME_MAX}"
                 placeholder="比如：读书笔记" autocomplete="off" enterkeyhint="done">
        </div>

        <div class="nb-section">
          <div class="nb-label">模板</div>
          <div class="nb-tpl-list">
            ${templates
              .map(
                (t, i) => `
              <label class="nb-tpl">
                <input type="radio" name="nb-template" value="${escapeHtml(t.id)}"${i === 0 ? " checked" : ""}>
                <span class="nb-tpl-text">
                  <span class="nb-tpl-name">${escapeHtml(t.name)}</span>
                  <span class="nb-tpl-sub">${escapeHtml(templateSummary(t))}</span>
                </span>
              </label>`
              )
              .join("")}
          </div>
        </div>

        <div class="nb-section">
          <div class="nb-label">颜色<span class="nb-hint">已自动挑了一个没用过的</span></div>
          <div class="nb-colors">
            ${BOX_COLORS.map(
              (c) => `
              <button type="button" class="nb-color" data-key="${c.key}" style="--c:${c.hex}"
                      aria-label="${escapeHtml(c.name)}" aria-pressed="${c.key === colorKey}"></button>`
            ).join("")}
          </div>
        </div>`;

      const input = body.querySelector("#nb-name");

      // 名字为空时不允许创建（避免建出无名盒子）
      function syncConfirm() {
        api.setConfirmEnabled(input.value.trim().length > 0);
      }
      input.addEventListener("input", syncConfirm);
      syncConfirm();

      // 模板选择
      body.querySelectorAll('input[name="nb-template"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          if (radio.checked) templateId = radio.value;
        });
      });

      // 颜色选择
      body.querySelectorAll(".nb-color").forEach((btn) => {
        btn.addEventListener("click", () => {
          colorKey = btn.dataset.key;
          body.querySelectorAll(".nb-color").forEach((b) => {
            b.setAttribute("aria-pressed", String(b.dataset.key === colorKey));
          });
        });
      });
    },

    async onConfirm(api) {
      // 从面板里读最终名字（render 里的输入值）
      const input = document.querySelector(".sheet-body #nb-name");
      const name = (input ? input.value : "").trim();
      if (!name) return;

      const tpl = templates.find((t) => t.id === templateId);
      await createBox({
        name,
        templateId,
        colorKey,
        // 新盒子的皮肤/松紧度先跟所选模板走（任务书 §5.3 的字段，H3 才会用到）
        skin: tpl?.layout?.skin || "paper",
        density: tpl?.layout?.density || "loose",
      });

      api.close();
      await onCreated?.();
    },
  });
}
