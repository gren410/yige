/* ============================================================
   一格 · 模板编辑器（单元9a 建；单元9b 补布局区与约束三项）
   任务书 H1 验收项：「模板编辑器可用：能自由增删字段、改字段类型、配布局项」。

   9a 做字段的增 / 删 / 改类型 / 改名 / 调顺序；
   9b 补两块：
     · 布局区（任务书 §5.2）：封面取哪个字段 / 列表里显示哪几项 /
       卡片标题用哪个字段 / 松紧度。
       （9d 曾在这里加过「卡片形态」开关，2026-09-24 按用户要求整块删掉：
        用户觉得「先浏览、再点编辑」本来就够快，多一层形态设置不值。）
     · 约束三项（轻量级）：default 默认值 / required 必填 / min·max 数值与日期范围。
       **只提醒不拦人** —— 卡片是自动保存的，硬拦会让人退不出去。

   入口：盒内页右上角「⋯」。第 3 层（主界面 → 盒内 → 模板），
   正好卡在任务书 §8.1 的「层级 ≤ 3」。

   三条硬约束：
   ① 页面里维护一份「草稿」，所有改动先落在草稿上，点「完成」或离开时才落库。
   ② 落库后**绝不 setState**（会重画本页、把草稿冲掉），只让 main.js 就地更新
      内存里那份模板 —— 和卡片详情的自动保存同一个套路。离开触发的那次
      路由变化自己会重画成盒内页，那时读到的就是新模板。
   ③ 破坏性改动各给一次确认：删字段、换类型（换类型可能让已填内容显示不出来）。
   ============================================================ */

import { FIELD_TYPE_LABELS } from "../model/field.js";
import {
  EDITABLE_TYPES,
  TYPE_HINT,
  blankField,
  constraintSupport,
  coverCandidates,
  fieldParamSummary,
  linesToOptions,
  moveField,
  normalizeField,
  normalizeTemplate,
  optionsToLines,
  removeField,
  titleCandidates,
} from "../model/template.js";
import { setLeaveGuard } from "../router.js";
import { escapeHtml } from "../util/dom.js";
import { openConfirm } from "./confirm.js";
import { openSheet } from "./sheet.js";
import { showToast } from "./toast.js";

/** 字段名的长度上限：太长在卡片详情里会折行，够用即可 */
const LABEL_MAX = 12;

const ICON = {
  up: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 7l5.5 6.5h-11z" fill="currentColor"/></svg>`,
  down: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 17l-5.5-6.5h11z" fill="currentColor"/></svg>`,
  del: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`,
};

/* ============================================================
   渲染
   ============================================================ */

/**
 * 渲染模板编辑页。
 * @param {object}   opts
 * @param {HTMLElement} opts.app
 * @param {object}   opts.box         所属盒子（返回按钮显示它的名字）
 * @param {object}   opts.template    正在编辑的模板
 * @param {number}   opts.sharedCount 有几个盒子在用这个模板（>1 时给提示）
 * @param {Function} opts.onSave      落库，参数是规整好的新模板；
 *                                    **必须只写库 + 就地改内存，不许 setState**
 * @param {Function} opts.onBack      点返回 / 点完成之后回盒内
 */
export function renderTemplateEditor({
  app,
  box,
  template,
  sharedCount = 1,
  onSave,
  onBack,
}) {
  // 草稿：深拷贝一份，改动全落在这里；顺带规整一遍（补参数 / 清失效的布局项）
  let draft = normalizeTemplate(JSON.parse(JSON.stringify(template)));
  let dirty = false;

  app.innerHTML = `
    <header class="page-header tpl-head">
      <button type="button" class="back-btn">
        <span class="back-arrow" aria-hidden="true">‹</span><span>${escapeHtml(box.name || "一格")}</span>
      </button>
      <div class="tpl-head-row">
        <h1 class="page-title">模板</h1>
        <button type="button" class="tpl-done-btn">完成</button>
      </div>
    </header>
    <main class="page-main">
      ${
        sharedCount > 1
          ? `<p class="tpl-shared">这个模板还被另外 ${sharedCount - 1} 个盒子用着，改动会一起生效。</p>`
          : ""
      }
      <p class="tpl-sec">字段</p>
      <div class="tpl-card">
        <div class="tpl-fields"></div>
        <button type="button" class="tpl-add">
          <span class="tpl-add-plus" aria-hidden="true"></span>添加字段
        </button>
      </div>
      <p class="tpl-note">字段的顺序就是卡片详情里从上到下的顺序。改名字不影响已经填好的内容；删掉的字段，卡片里填过的内容也还留在库里。</p>

      <p class="tpl-sec">布局</p>
      <div class="tpl-card tpl-layout"></div>
      <p class="tpl-note">布局只管「卡片在列表里长什么样」，不碰卡片里的内容。</p>
    </main>`;

  const fieldsEl = app.querySelector(".tpl-fields");
  const cardEl = app.querySelector(".tpl-card");
  const layoutEl = app.querySelector(".tpl-layout");

  /* ---------- 字段清单 ---------- */

  function renderFields() {
    if (!draft.fields.length) {
      fieldsEl.innerHTML = `<div class="tpl-empty">这个模板还没有字段，点下面的「添加字段」加一个。</div>`;
      renderLayout();
      return;
    }

    fieldsEl.innerHTML = draft.fields
      .map((f, i) => {
        const badge =
          f.key === draft.titleField ? '<span class="tpl-tag">标题</span>' : "";
        return `
        <div class="tpl-field" data-key="${escapeHtml(f.key)}">
          <button type="button" class="tpl-field-main">
            <span class="tpl-field-label"><span class="tpl-field-name">${escapeHtml(
              f.label || f.key
            )}</span>${badge}</span>
            <span class="tpl-field-type">${escapeHtml(fieldParamSummary(f))}</span>
          </button>
          <div class="tpl-ops">
            <button type="button" class="tpl-op tpl-move" data-dir="-1" aria-label="上移"${
              i === 0 ? " disabled" : ""
            }>${ICON.up}</button>
            <button type="button" class="tpl-op tpl-move" data-dir="1" aria-label="下移"${
              i === draft.fields.length - 1 ? " disabled" : ""
            }>${ICON.down}</button>
            <button type="button" class="tpl-op tpl-op-del tpl-del" aria-label="删除字段">${
              ICON.del
            }</button>
          </div>
        </div>`;
      })
      .join("");

    // 布局区里显示着字段名（标题字段 / 列表项 / 封面），字段一改就得跟着刷新
    renderLayout();
  }

  renderFields();

  /* ---------- 布局区（单元9b · 任务书 §5.2 的四项） ---------- */

  function renderLayout() {
    const L = draft.layout || {};
    const nameOf = (key) => {
      const f = draft.fields.find((x) => x.key === key);
      return f ? f.label || f.key : "";
    };
    const listNames = (L.listFields || []).map(nameOf).filter(Boolean);
    const compact = L.density === "compact";

    layoutEl.innerHTML = `
      <button type="button" class="tpl-row" data-layout="title">
        <span class="tpl-row-name">卡片标题用</span>
        <span class="tpl-row-value">${escapeHtml(
          nameOf(draft.titleField) || "自动（取第一段文字）"
        )}</span>
        <span class="tpl-row-arrow" aria-hidden="true">›</span>
      </button>
      <button type="button" class="tpl-row" data-layout="list">
        <span class="tpl-row-name">列表小字显示</span>
        <span class="tpl-row-value">${escapeHtml(
          listNames.length ? listNames.join(" · ") : "不显示"
        )}</span>
        <span class="tpl-row-arrow" aria-hidden="true">›</span>
      </button>
      <button type="button" class="tpl-row" data-layout="cover">
        <span class="tpl-row-name">封面取图</span>
        <span class="tpl-row-value">${escapeHtml(nameOf(L.coverField) || "不用封面")}</span>
        <span class="tpl-row-arrow" aria-hidden="true">›</span>
      </button>
      <div class="tpl-row tpl-row-static">
        <span class="tpl-row-name">松紧度</span>
        <span class="tpl-seg">
          <button type="button" class="tpl-seg-btn" data-density="loose"
            aria-pressed="${compact ? "false" : "true"}">宽松</button>
          <button type="button" class="tpl-seg-btn" data-density="compact"
            aria-pressed="${compact ? "true" : "false"}">紧凑</button>
        </span>
      </div>`;
  }

  layoutEl.addEventListener("click", (e) => {
    const seg = e.target.closest(".tpl-seg-btn");
    if (seg) {
      const d = seg.dataset.density === "compact" ? "compact" : "loose";
      if (draft.layout.density !== d) {
        draft.layout = { ...draft.layout, density: d };
        dirty = true;
        renderLayout();
      }
      return;
    }

    const row = e.target.closest(".tpl-row[data-layout]");
    if (!row) return;
    if (row.dataset.layout === "title") pickTitleField();
    else if (row.dataset.layout === "list") pickListFields();
    else if (row.dataset.layout === "cover") pickCoverField();
  });

  /** 卡片标题取自哪个字段（任务书 §5.2 的 titleField） */
  function pickTitleField() {
    const cands = titleCandidates(draft);
    if (!cands.length) {
      showToast({ message: "模板里还没有能当标题的文字字段" });
      return;
    }
    openPickSheet({
      title: "卡片标题用哪个字段",
      hint: "卡片列表里那行大字就取它。选「自动」时取卡片里第一段有内容的文字。",
      items: [{ value: "", label: "自动（取第一段文字）" }].concat(
        cands.map((f) => ({ value: f.key, label: f.label || f.key }))
      ),
      selected: draft.titleField ? [draft.titleField] : [],
      allowEmpty: true,
      onDone(values) {
        draft.titleField = values[0] || null;
        dirty = true;
        renderLayout();
      },
    });
  }

  /** 列表小字显示哪几项（多选；顺序跟字段顺序走） */
  function pickListFields() {
    if (!draft.fields.length) {
      showToast({ message: "先加一个字段吧" });
      return;
    }
    openPickSheet({
      title: "列表小字显示哪几项",
      hint: "盒内列表每张卡片下面那行小字。空着的项会自动跳过。",
      items: draft.fields.map((f) => ({ value: f.key, label: f.label || f.key })),
      multi: true,
      allowEmpty: true,
      selected: draft.layout.listFields || [],
      onDone(values) {
        // 按字段顺序排好，免得小字的顺序跟详情页从上到下对不上
        const order = draft.fields.map((f) => f.key);
        draft.layout = {
          ...draft.layout,
          listFields: order.filter((k) => values.indexOf(k) >= 0),
        };
        dirty = true;
        renderLayout();
      },
    });
  }

  /** 封面取哪个字段（只能挑图片字段；封面卡片视图属 H3，这里先把配置存下来） */
  function pickCoverField() {
    const cands = coverCandidates(draft);
    if (!cands.length) {
      showToast({ message: "模板里还没有图片字段" });
      return;
    }
    openPickSheet({
      title: "封面取哪张图",
      hint: "等卡片有了封面样式，就用这个字段里的图。",
      items: [{ value: "", label: "不用封面" }].concat(
        cands.map((f) => ({ value: f.key, label: f.label || f.key }))
      ),
      selected: draft.layout.coverField ? [draft.layout.coverField] : [],
      allowEmpty: true,
      onDone(values) {
        draft.layout = { ...draft.layout, coverField: values[0] || null };
        dirty = true;
        renderLayout();
      },
    });
  }

  /**
   * 挑字段用的通用面板。
   * @param {object}   o
   * @param {string}   o.title
   * @param {string}  [o.hint]
   * @param {Array}    o.items     [{ value, label }]
   * @param {boolean} [o.multi]    多选（默认单选）
   * @param {string[]} o.selected  已选项
   * @param {boolean} [o.allowEmpty] 允许一项都不选
   * @param {Function} o.onDone    选好了，参数是 value 数组
   */
  function openPickSheet({ title, hint, items, multi, selected, allowEmpty, onDone }) {
    let cur = (selected || []).slice();

    openSheet({
      title,
      confirmText: "完成",

      render(body, api) {
        body.innerHTML = `
          ${hint ? `<p class="tpl-pick-hint">${escapeHtml(hint)}</p>` : ""}
          <div class="tpl-pick" role="${multi ? "group" : "radiogroup"}">
            ${items
              .map(
                (it) => `<button type="button" class="tpl-pick-item${
                  cur.indexOf(it.value) >= 0 ? " is-on" : ""
                }" data-value="${escapeHtml(it.value)}">
                  <span class="tpl-pick-label">${escapeHtml(it.label)}</span>
                  <span class="tpl-pick-check" aria-hidden="true"></span>
                </button>`
              )
              .join("")}
          </div>`;

        const list = body.querySelector(".tpl-pick");
        list.addEventListener("click", (e) => {
          const btn = e.target.closest(".tpl-pick-item");
          if (!btn) return;
          const v = btn.dataset.value;
          const on = cur.indexOf(v) >= 0;

          if (multi) {
            cur = on ? cur.filter((x) => x !== v) : cur.concat([v]);
            btn.classList.toggle("is-on", !on);
          } else {
            // 单选：再点一下同一个 = 取消（允许「不选」）
            cur = on && allowEmpty ? [] : [v];
            Array.prototype.forEach.call(list.querySelectorAll(".tpl-pick-item"), (b) =>
              b.classList.toggle("is-on", cur.indexOf(b.dataset.value) >= 0)
            );
          }
          api.setConfirmEnabled(multi || allowEmpty || cur.length > 0);
        });

        api.setConfirmEnabled(multi || allowEmpty || cur.length > 0);
      },

      onConfirm() {
        onDone(cur);
      },
    });
  }

  /* ---------- 增 / 改 / 删 / 排序 ---------- */

  cardEl.addEventListener("click", (e) => {
    const row = e.target.closest(".tpl-field");
    const key = row ? row.dataset.key : "";

    // 删除
    if (e.target.closest(".tpl-del")) {
      askRemove(key);
      return;
    }

    // 上移 / 下移
    const mv = e.target.closest(".tpl-move");
    if (mv) {
      const i = draft.fields.findIndex((f) => f.key === key);
      const dir = Number(mv.dataset.dir);
      const to = i + dir;
      if (i >= 0 && to >= 0 && to < draft.fields.length) {
        draft.fields = moveField(draft.fields, i, dir);
        dirty = true;
        renderFields();
      }
      return;
    }

    // 添加字段
    if (e.target.closest(".tpl-add")) {
      openFieldEditor(-1);
      return;
    }

    // 点一行 → 编辑
    if (e.target.closest(".tpl-field-main") && row) {
      const i = draft.fields.findIndex((f) => f.key === key);
      if (i >= 0) openFieldEditor(i);
    }
  });

  /** 删字段：先确认，并且不允许把模板删空 */
  async function askRemove(key) {
    const index = draft.fields.findIndex((f) => f.key === key);
    if (index < 0) return;

    if (draft.fields.length <= 1) {
      showToast({ message: "模板至少要留 1 个字段" });
      return;
    }

    const label = draft.fields[index].label || key;
    const ok = await openConfirm({
      title: "删除这个字段？",
      message: `「${label}」会从模板里去掉。卡片里已经填过的内容不会丢，只是不再显示。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;

    draft = normalizeTemplate(removeField(draft, key));
    dirty = true;
    renderFields();
  }

  /* ---------- 字段编辑面板 ---------- */

  /**
   * 打开字段编辑面板。
   * 面板里改的是一份**临时副本**，点右上「完成」才写回草稿，取消就整份丢弃。
   * @param {number} index 现有字段的下标；-1 表示新增
   */
  function openFieldEditor(index) {
    const isNew = index < 0;
    const origin = isNew ? blankField("text", draft.fields) : draft.fields[index];
    const originType = origin.type;

    let work = JSON.parse(JSON.stringify(origin));
    if (isNew) work.label = ""; // 新增时名字空着，让用户自己写

    /* 面板的 body 元素，onConfirm 里还要用它把参数收回来 */
    let bodyEl = null;

    openSheet({
      title: isNew ? "添加字段" : "编辑字段",
      confirmText: isNew ? "添加" : "完成",

      render(body, api) {
        bodyEl = body;
        body.innerHTML = `
          <div class="nb-section">
            <label class="nb-label" for="tf-label">名字<span class="nb-hint">卡片上显示的就是它</span></label>
            <input id="tf-label" class="nb-input" type="text" maxlength="${LABEL_MAX}"
                   value="${escapeHtml(work.label)}" placeholder="比如：导演"
                   autocomplete="off" enterkeyhint="done">
          </div>

          <div class="nb-section">
            <div class="nb-label">类型</div>
            <div class="tf-types">
              ${EDITABLE_TYPES.map(
                (t) => `<button type="button" class="tf-type" data-type="${t}"
                  aria-pressed="${t === work.type}">${escapeHtml(FIELD_TYPE_LABELS[t])}</button>`
              ).join("")}
            </div>
            <div class="tf-hint">${escapeHtml(TYPE_HINT[work.type] || "")}</div>
            <div class="tf-warn"${isNew || work.type === originType ? " hidden" : ""}>
              换了类型，卡片里已经填过的内容可能显示不出来（数据不会丢）。
            </div>
          </div>

          <div class="nb-section tf-params"></div>

          <div class="nb-section tf-cons"></div>`;

        const labelEl = body.querySelector("#tf-label");

        /* 面板里任何输入都先收回来，再决定「完成」能不能点 */
        function sync() {
          readBack();
          api.setConfirmEnabled(isValid());
          const warn = body.querySelector(".tf-opt-warn");
          if (warn) {
            warn.hidden = !(work.type === "select" && linesToOptions(valueOf(".tf-options")).length === 0);
          }
          // 日期默认值选「固定某一天」时才露出日期框
          const dd = body.querySelector(".tf-def-date");
          const dv = body.querySelector(".tf-def-dateval");
          if (dd && dv) dv.hidden = dd.value !== "fixed";
        }

        function readBack() {
          work.label = labelEl.value.trim();
          collectParams(body, work);
        }

        function valueOf(sel) {
          const el = body.querySelector(sel);
          return el ? el.value : "";
        }

        function isValid() {
          if (!work.label) return false;
          if (work.type === "select" && linesToOptions(valueOf(".tf-options")).length === 0) return false;
          return true;
        }

        renderParams(body, work);

        // 换类型：先收回当前参数，再按新类型重画参数区
        body.querySelector(".tf-types").addEventListener("click", (e) => {
          const btn = e.target.closest(".tf-type");
          if (!btn) return;
          const next = btn.dataset.type;
          if (next === work.type) return;

          readBack();
          work = retype(work, next);

          body.querySelectorAll(".tf-type").forEach((b) => {
            b.setAttribute("aria-pressed", String(b.dataset.type === next));
          });
          body.querySelector(".tf-hint").textContent = TYPE_HINT[next] || "";
          // 新建的字段还没被任何卡片用过，这个提醒对它没意义
          body.querySelector(".tf-warn").hidden = isNew || next === originType;

          renderParams(body, work);
          sync();
        });

        body.addEventListener("input", sync);
        body.addEventListener("change", sync);

        labelEl.focus();
        sync();
      },

      async onConfirm(api) {
        const labelEl = bodyEl && bodyEl.querySelector("#tf-label");
        if (labelEl) work.label = labelEl.value.trim();
        collectParams(bodyEl, work);

        if (!work.label) {
          api.setConfirmEnabled(false); // 名字空着不算数，按钮保持禁用
          return;
        }

        const next = normalizeField(work);
        const prevHasTitle = !!(draft.titleField && draft.fields.some((f) => f.key === draft.titleField));
        const prevHasText = draft.fields.some((f) => f.type === "text" || f.type === "longtext");

        if (isNew) {
          draft.fields = draft.fields.concat(next);
          /* 模板里一个文本字段都没有（比如标题字段被删过）时把新加的这个顶上，
             免得卡片标题永远退化成「未命名」 */
          if (!prevHasTitle && !prevHasText && (next.type === "text" || next.type === "longtext")) {
            draft.titleField = next.key;
          }
        } else {
          draft.fields = draft.fields.map((f, i) => (i === index ? next : f));
        }

        dirty = true;
        renderFields();
        api.close();
      },
    });
  }

  /** 把面板里当前的值收回 work（readBack / onConfirm 共用；两处必须同一套字段） */
  function collectParams(body, work) {
    if (!body) return;

    const options = body.querySelector(".tf-options");
    if (options) work.options = linesToOptions(options.value);

    const unit = body.querySelector(".tf-unit");
    if (unit) work.unit = unit.value.trim();

    const max = body.querySelector(".tf-max"); // 评分的「最高几颗星」
    if (max) work.max = Number(max.value) || 5;

    const decimals = body.querySelector(".tf-decimals");
    if (decimals) work.decimals = Math.max(0, Math.round(Number(decimals.value) || 0));

    const maxImages = body.querySelector(".tf-maximages");
    if (maxImages) work.maxImages = Math.max(0, Math.round(Number(maxImages.value) || 0));

    const withTime = body.querySelector(".tf-withtime");
    if (withTime) work.withTime = withTime.checked;

    const multiple = body.querySelector(".tf-multiple");
    if (multiple) work.multiple = multiple.checked;

    readConstraints(body, work);
  }

  /**
   * 收回「约束」三项（单元9b）。
   * 注意每一项都要能表达「不设」 —— 空字符串 / 空选项一律当成「清掉」，
   * 这样用户把默认值删空，库里那条 default 就真的没了（而不是留个空串）。
   */
  function readConstraints(body, work) {
    /* 默认值 */
    const dText = body.querySelector(".tf-def-text");
    if (dText) {
      const v = dText.value.trim();
      if (v) work.default = v;
      else delete work.default;
    }

    const dNum = body.querySelector(".tf-def-number");
    if (dNum) {
      const v = dNum.value.trim();
      if (v !== "" && Number.isFinite(Number(v))) work.default = Number(v);
      else delete work.default;
    }

    const dCheck = body.querySelector(".tf-def-check");
    if (dCheck) {
      if (dCheck.value === "") delete work.default;
      else work.default = dCheck.value === "1";
    }

    const dDate = body.querySelector(".tf-def-date");
    if (dDate) {
      if (dDate.value === "today") work.default = "today";
      else if (dDate.value === "fixed") {
        const dv = body.querySelector(".tf-def-dateval");
        const v = dv ? dv.value.trim() : "";
        if (v) work.default = v;
        else delete work.default;
      } else delete work.default;
    }

    const dChoice = body.querySelector(".tf-def-choice");
    if (dChoice) {
      if (dChoice.value) work.default = dChoice.value;
      else delete work.default;
    }

    const dRating = body.querySelector(".tf-def-rating");
    if (dRating) {
      if (dRating.value === "") delete work.default;
      else work.default = Number(dRating.value);
    }

    /* 必填 */
    const req = body.querySelector(".tf-required");
    if (req) work.required = req.checked;

    /* 上下限 */
    const rmin = body.querySelector(".tf-range-min");
    if (rmin) {
      const v = rmin.value.trim();
      if (v === "") delete work.min;
      else work.min = work.type === "number" ? Number(v) : v;
    }

    const rmax = body.querySelector(".tf-range-max");
    if (rmax) {
      const v = rmax.value.trim();
      if (v === "") delete work.max;
      else if (work.type === "number") work.max = Number(v);
      else work.max = v;
    }
  }

  /* ---------- 按类型画「额外设置」 ---------- */

  function renderParams(body, work) {
    const box = body.querySelector(".tf-params");
    let html = "";

    switch (work.type) {
      case "select":
      case "multi":
        html = `
          <label class="nb-label" for="tf-options">选项<span class="nb-hint">一行一个${
            work.type === "multi" ? "，留空＝可以自己打标签" : ""
          }</span></label>
          <textarea id="tf-options" class="nb-input tf-options" rows="4"
            placeholder="比如：
想看
在看
已看">${escapeHtml(optionsToLines(work.options))}</textarea>
          ${
            work.type === "select"
              ? `<div class="tf-opt-warn"${
                  (work.options || []).length ? " hidden" : ""
                }>单选至少要有 1 个选项。</div>`
              : ""
          }`;
        break;

      case "number":
        html = `
          <label class="nb-label" for="tf-unit">单位<span class="nb-hint">可留空</span></label>
          <input id="tf-unit" class="nb-input tf-unit" type="text" maxlength="4"
                 value="${escapeHtml(work.unit || "")}" placeholder="分钟 / ¥ / 公里" autocomplete="off">
          <label class="nb-label" for="tf-decimals">小数位<span class="nb-hint">0 ＝ 只留整数</span></label>
          <input id="tf-decimals" class="nb-input tf-decimals" type="text" inputmode="numeric"
                 value="${escapeHtml(String(work.decimals || 0))}" placeholder="0" autocomplete="off">`;
        break;

      case "longtext":
        html = `
          <label class="nb-label" for="tf-maximages">正文里最多可插几张图<span class="nb-hint">0 ~ 5</span></label>
          <input id="tf-maximages" class="nb-input tf-maximages" type="text" inputmode="numeric"
                 value="${escapeHtml(String(work.maxImages === undefined ? 5 : work.maxImages))}"
                 placeholder="5" autocomplete="off">
          <div class="tf-none">正文里的插图要等图片上云那一阶段，这里先把上限定好。</div>`;
        break;

      case "rating":
        html = `
          <label class="nb-label" for="tf-max">最高几颗星</label>
          <input id="tf-max" class="nb-input tf-max" type="text" inputmode="numeric"
                 value="${escapeHtml(String(work.max || 5))}" placeholder="5" autocomplete="off">`;
        break;

      case "date":
        html = switchRow("tf-withtime", "显示到几点几分", !!work.withTime);
        break;

      case "image":
        html = switchRow("tf-multiple", "可以放多张（最多 5 张）", !!work.multiple);
        break;

      default:
        html = `<div class="tf-none">这个类型没有别的设置。</div>`;
    }

    box.innerHTML = html;
    renderCons(body, work);
  }

  /* ---------- 按类型画「约束」区（单元9b） ---------- */

  /**
   * 约束三项：默认值 / 必填 / 上下限。
   * 只画这个类型用得上的那几行（见 template.js 的 CONSTRAINT_SUPPORT）。
   */
  function renderCons(body, work) {
    const el = body.querySelector(".tf-cons");
    const support = constraintSupport(work);
    const rows = [];

    if (support.defaultValue) {
      rows.push(`
        <div class="tf-row tf-row-stack">
          <span class="tf-row-title">默认值<span class="nb-hint">新建卡片时自动填上</span></span>
          ${defaultControl(work, support.defaultValue)}
        </div>`);
    } else {
      rows.push(`<div class="tf-none">这个类型暂不设默认值。</div>`);
    }

    if (support.required) {
      rows.push(switchRow("tf-required", "必填（空着时提醒一下）", !!work.required));
    }

    if (support.minMax) {
      const isDay = work.type === "date";
      const attrs = isDay ? 'type="text"' : 'type="text" inputmode="decimal"';
      const ph = isDay ? "2026-01-01 / 今天" : "最小";
      rows.push(`
        <div class="tf-row tf-row-stack">
          <span class="tf-row-title">范围<span class="nb-hint">可留空${
            isDay ? "，写「今天」＝随当天变" : ""
          }</span></span>
          <div class="tf-range">
            <input class="nb-input tf-range-min" ${attrs}
                   value="${escapeHtml(boundText(work.min))}" placeholder="${ph}" autocomplete="off">
            <span class="tf-range-sep" aria-hidden="true">~</span>
            <input class="nb-input tf-range-max" ${attrs}
                   value="${escapeHtml(boundText(work.max))}" placeholder="${ph}" autocomplete="off">
          </div>
        </div>`);
    }

    el.innerHTML = `
      <div class="nb-label">约束<span class="nb-hint">只提醒，不拦你</span></div>
      ${rows.join("")}
      <p class="tf-cons-note">默认值只对以后新建的卡片生效，已经存在的卡片不会被改动。</p>`;
  }

  /** 默认值的输入形式按类型给（text / number / check / date / choice / rating） */
  function defaultControl(work, kind) {
    const cur = work.default;

    switch (kind) {
      case "number":
        return `<input class="nb-input tf-def-number" type="text" inputmode="decimal"
          value="${escapeHtml(cur === undefined ? "" : String(cur))}"
          placeholder="留空＝不预填" autocomplete="off">`;

      case "check":
        return selectOf(
          "tf-def-check",
          [
            { value: "", label: "不预填" },
            { value: "1", label: "新建时默认打开" },
            { value: "0", label: "新建时默认关闭" },
          ],
          cur === undefined ? "" : cur ? "1" : "0"
        );

      case "date": {
        const mode = cur === "today" ? "today" : cur ? "fixed" : "";
        const fixed = cur && cur !== "today" ? String(cur) : "";
        return `${selectOf(
          "tf-def-date",
          [
            { value: "", label: "不预填" },
            { value: "today", label: "新建时填「今天」" },
            { value: "fixed", label: "固定某一天…" },
          ],
          mode
        )}
          <input class="nb-input tf-def-dateval" type="date" value="${escapeHtml(fixed)}"${
            mode === "fixed" ? "" : " hidden"
          }>`;
      }

      case "choice":
        return selectOf(
          "tf-def-choice",
          [{ value: "", label: "不预填" }].concat(
            (work.options || []).map((o) => ({ value: o, label: o }))
          ),
          cur === undefined ? "" : String(cur)
        );

      case "rating": {
        const top = Math.max(3, Math.min(10, Math.round(Number(work.max) || 5)));
        const items = [{ value: "", label: "不预填" }];
        for (let i = 1; i <= top; i++) items.push({ value: String(i), label: `${i} 颗星` });
        return selectOf("tf-def-rating", items, cur === undefined ? "" : String(cur));
      }

      case "text":
      default:
        return `<input class="nb-input tf-def-text" type="text" maxlength="40"
          value="${escapeHtml(cur === undefined ? "" : String(cur))}"
          placeholder="留空＝不预填" autocomplete="off">`;
    }
  }

  /** 一个朴素的下拉框（约束区里全是「从几项里挑一个」） */
  function selectOf(cls, items, current) {
    return `<select class="nb-input ${cls}">${items
      .map(
        (it) =>
          `<option value="${escapeHtml(it.value)}"${
            it.value === current ? " selected" : ""
          }>${escapeHtml(it.label)}</option>`
      )
      .join("")}</select>`;
  }

  /** 上下限进输入框时把 "today" 写成「今天」（人看得懂，也能原样读回来） */
  function boundText(v) {
    if (v === undefined || v === null) return "";
    return v === "today" ? "今天" : String(v);
  }

  function switchRow(cls, text, on) {
    return `<div class="tf-row">
      <span>${escapeHtml(text)}</span>
      <label class="fd-switch">
        <input type="checkbox" class="${cls}"${on ? " checked" : ""}>
        <span class="fd-switch-track" aria-hidden="true"><span class="fd-switch-knob"></span></span>
      </label>
    </div>`;
  }

  /* ---------- 落库 ---------- */

  /**
   * 把草稿存掉。
   * 成功 → true；失败 → 保留 dirty 让下次再试，并且**不打断用户**（不弹窗）。
   */
  async function commit() {
    if (!dirty) return true;
    try {
      const next = normalizeTemplate(draft, true);
      await onSave?.(next);
      draft = normalizeTemplate(next); // 与库里那份保持一致
      dirty = false;
      return true;
    } catch (err) {
      console.error("保存模板失败", err);
      showToast({ message: "模板没保存成功，请再试一次" });
      return false;
    }
  }

  /* 任务书 §8.2 的精神：离开页面别丢东西。
     模板页三条离开路径（返回按钮 / 左缘右滑 / 电脑后退）都会先跑这个守卫。 */
  setLeaveGuard(() => commit());

  app.querySelector(".back-btn").addEventListener("click", () => onBack?.());

  const doneBtn = app.querySelector(".tpl-done-btn");
  doneBtn.addEventListener("click", async () => {
    if (doneBtn.disabled) return;
    doneBtn.disabled = true;
    try {
      if (await commit()) await onBack?.();
    } finally {
      doneBtn.disabled = false;
    }
  });
}

/* ============================================================
   小工具
   ============================================================ */

/**
 * 换类型：保留 key 和名字，参数取新类型的骨架；
 * 原来就有、新类型也用得上的参数（比如切走再切回来）原样留着。
 */
function retype(work, type) {
  const fresh = blankField(type, []);
  const out = { key: work.key, label: work.label, type };

  for (const k of Object.keys(fresh)) {
    if (k === "key" || k === "label" || k === "type") continue;
    /* min / max 在不同类型里含义不同（评分里是「满分几颗星」，数字/日期里是范围），
       换类型一律按新类型的骨架来，不沿用旧值，免得张冠李戴。 */
    if (k === "min" || k === "max") {
      out[k] = fresh[k];
      continue;
    }
    out[k] = work[k] === undefined || work[k] === null ? fresh[k] : work[k];
  }

  /* 约束三项不跨类型沿用：换类型等于换了一套语义，
     旧默认值和旧范围对新类型通常没意义，一律重来（用户在面板里重设）。 */
  delete out.default;
  delete out.required;
  if (!constraintSupport(out).minMax) {
    delete out.min;
    delete out.max;
  }

  return out;
}
