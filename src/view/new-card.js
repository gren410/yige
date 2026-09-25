/* ============================================================
   一格 · 新建卡片（单元5；单元6a 补上模板默认值；单元9e 补上「没有文字字段」的模板）
   面板里只有一个输入框（= 模板的标题字段）—— 建卡要快。
   其余字段进详情页再填（单元6a 起详情页已经铺开全部字段）。

   新建时会按模板里的 default 预填（任务书附录 A）：
   观影记录 → 观看日期=今天、评分=3 星、状态=已看。
   没写 default 的字段不预填，values 里保持干净。

   标题字段怎么挑（单元9e）：模板指定的（得是个能写字的类型）→ 否则第一个
   「能自由写字的」文本字段 → 都没有就不问。
   最后这种是「一个文本字段都没有」的模板：比如一张只有计时字段的卡片，
   本来也没什么标题好填，直接建一张空的进去填（不用为了建卡先硬写一句话）。

   为什么只认文本 / 正文 / 网址（不认日期 / 数字 / 单选）：
   这个框是个纯文本框，往里打的字会写进那个字段。日期、数字、单选各有自己的
   控件和取值规矩，拿文本框去填它们等于写坏数据 —— 而且卡片标题（card.js 的
   二级兜底）本来也只看文本字段，问日期也变不成标题。
   ============================================================ */

import { initialValues } from "../model/field.js";
import { createCard } from "../storage/dao.js";
import { escapeHtml } from "../util/dom.js";
import { openSheet } from "./sheet.js";

const TITLE_MAX = 60;

/** 适合当这个输入框的类型：能自由写字的 */
const TITLE_INPUT_TYPES = ["text", "longtext", "link"];

/**
 * 打开「新建卡片」面板。
 * @param {object}   opts
 * @param {object}   opts.box        要往哪个盒子加卡
 * @param {object}   opts.template   该盒的模板（取标题字段的标签）
 * @param {Function} opts.onCreated  创建成功后回调（盒内页面用它刷新列表）
 */
export function openNewCard({ box, template, onCreated } = {}) {
  const fields = (template && template.fields) || [];
  const wanted = template && template.titleField;
  const named = wanted ? fields.find((f) => f.key === wanted) : null;
  const writable = fields.filter((f) => TITLE_INPUT_TYPES.indexOf(f.type) >= 0);

  const titleField =
    (named && TITLE_INPUT_TYPES.indexOf(named.type) >= 0 ? named : null) ||
    writable[0] ||
    null;
  const key = titleField ? titleField.key : "";
  const label = titleField ? titleField.label || "标题" : "";

  openSheet({
    title: "新建卡片",
    confirmText: "添加",

    render(body, api) {
      body.innerHTML = titleField
        ? `<div>
             <label class="nb-label" for="nc-title">${escapeHtml(label)}</label>
             <input id="nc-title" class="nb-input" type="text" maxlength="${TITLE_MAX}"
                    placeholder="填点什么…" autocomplete="off" enterkeyhint="done">
           </div>`
        : `<p class="nb-note">这张模板没有能写标题的字段，直接点「添加」就行。</p>`;

      const input = body.querySelector("#nc-title");

      // 一字未填就不允许添加（任务书 §8.2：空白卡不做草稿箱，直接不要）；
      // 没有标题字段可填时不需要拦，直接就能建。
      function sync() {
        api.setConfirmEnabled(!titleField || !!(input && input.value.trim().length > 0));
      }

      if (input) {
        input.addEventListener("input", sync);
        /* 自动聚焦：电脑上直接就能打字。
           注意 iOS 要求聚焦发生在用户手势里，这里晚了一拍，手机上有时候
           不会自动弹出键盘，点一下输入框就行（不影响功能）。 */
        requestAnimationFrame(() => input.focus());
      }
      sync();
    },

    async onConfirm(api) {
      const input = document.querySelector(".sheet-body #nc-title");
      const text = (input ? input.value : "").trim();
      if (titleField && !text) return;

      await createCard({
        boxId: box.id,
        templateId: box.templateId,
        values: initialValues(template, text ? { [key]: text } : {}),
      });

      api.close();
      await onCreated?.();
    },
  });
}
