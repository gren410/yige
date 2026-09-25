/* ============================================================
   一格 · 字段录入控件（单元6a；6b 图片；9e 计时；9g 清单）
   任务书 §5.1 的 10 种类型 + 用户后加的 timer / todo，每种配一个控件：
     text/link   → 单行输入框      number → 数字输入框 + 单位
     longtext    → 多行输入框      date   → 系统日期选择器
     check       → 开关            select → 一排胶囊（单选）
     multi       → 胶囊多选 / 自由标签
     rating      → 星星（再点一下取消）
     image       → 缩略图网格 + 加号（真正取图在 card-detail.js）
     timer       → 一列「内容 + 开始/结束」（单元9e）
     todo        → 一列「圈 + 内容」（单元9g）

   iOS 硬要求（任务书 §10）：
     · 所有输入框字号 ≥ 16px（样式里统一给，聚焦时页面不会被放大）
     · 能少弹键盘就少弹：日期用系统选择器、勾选用开关、单选多选用胶囊

   图片控件只负责「画出来」和「读回去」，真正的存取在 media/image.js，
   选图动作（弹系统选择器）在 card-detail.js —— 那里拿得到用户手势。

   计时控件同理只负责画和读：点开始/结束的**交互**在 card-detail.js（它管保存），
   所以「只改一行的显示」这种半渲染也放在这里导出，免得两边各画一套对不上。

   计时这一格的排布（单元9f 用户拍板）：**编辑视角倒着画**（「＋加一条」在最上面，
   事例从上往下是 3、2、1），事例多了不用滑到底才能加。
   库里存的顺序始终是 1、2、3 —— 靠 .fd-timer 上的 data-order="desc" 记着
   「这是倒着画的」，readTimerEntries 读回时照着转正。
   千万别把这个标记和反转去掉：漏了的话每存一次顺序就翻一次。
   浏览视角那边（card-view.js）是正着画的，不认这个标记。
   ============================================================ */

import {
  MAX_IMAGES,
  fillImage,
  imageList,
  imageValue,
  isLocalImageValue,
  localImageId,
} from "../media/image.js";
import {
  TIMER_TEXT_MAX,
  blankEntry,
  formatEntryTime,
  isRunning,
  normalizeEntries,
  timerSummary,
} from "../model/timer.js";
import {
  TODO_TEXT_MAX,
  blankEntry as blankTodo,
  normalizeEntries as normalizeTodos,
  todoProgress,
} from "../model/todo.js";
import { escapeHtml } from "../util/dom.js";

/* ---------- 输入框的值格式转换 ---------- */

/** "2026-09-23T20:11:00.000Z" → input[type=date] 要的 "2026-09-23" */
function toDateInputValue(value, withTime) {
  if (!value) return "";
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return "";
  const datePart = `${m[1]}-${m[2]}-${m[3]}`;
  if (!withTime) return datePart;
  if (!(m[4] || m[5])) return `${datePart}T00:00`;
  return `${datePart}T${m[4]}:${m[5]}`;
}

/** 单行/多行输入框统一的属性拼装 */
function inputAttrs(field) {
  const attrs = [`data-key="${escapeHtml(field.key)}"`];
  if (field.type === "text" && field.maxLength) {
    attrs.push(`maxlength="${Number(field.maxLength)}"`);
  }
  return attrs.join(" ");
}

/* ---------- 各种控件的 HTML ---------- */

function textControl(field, value) {
  return `<input class="fd-input" type="text" ${inputAttrs(field)}
    value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || "填点什么…")}"
    autocomplete="off" enterkeyhint="done">`;
}

function longTextControl(field, value) {
  return `<textarea class="fd-input fd-textarea" ${inputAttrs(field)} rows="5"
    placeholder="${escapeHtml(field.placeholder || "写点什么…")}">${escapeHtml(value)}</textarea>`;
}

function linkControl(field, value) {
  return `<input class="fd-input" type="url" inputmode="url" ${inputAttrs(field)}
    value="${escapeHtml(value)}" placeholder="https://" autocomplete="off">`;
}

function numberControl(field, value) {
  const unit = field.unit ? String(field.unit) : "";
  const isPrefix = /^[¥$€£₩₹]$/.test(unit);
  const shown = value === null || value === undefined || value === "" ? "" : String(value);
  /* 用 inputmode 而不是 type=number：iPhone 的数字键盘没有「完成」键，
     type=number 还会把非法输入静默丢掉，用户会以为没输进去。 */
  return `<div class="fd-number">
    ${unit && isPrefix ? `<span class="fd-unit">${escapeHtml(unit)}</span>` : ""}
    <input class="fd-input fd-input-num" type="text" inputmode="decimal" ${inputAttrs(field)}
      value="${escapeHtml(shown)}" placeholder="0" autocomplete="off">
    ${unit && !isPrefix ? `<span class="fd-unit">${escapeHtml(unit)}</span>` : ""}
  </div>`;
}

function dateControl(field, value) {
  const type = field.withTime ? "datetime-local" : "date";
  return `<input class="fd-input" type="${type}" ${inputAttrs(field)}
    value="${escapeHtml(toDateInputValue(value, field.withTime))}">`;
}

function checkControl(field, value) {
  return `<label class="fd-switch">
    <input type="checkbox" ${inputAttrs(field)}${value ? " checked" : ""}>
    <span class="fd-switch-track" aria-hidden="true"><span class="fd-switch-knob"></span></span>
  </label>`;
}

function selectControl(field, value) {
  const options = Array.isArray(field.options) ? field.options : [];
  const current = value == null ? "" : String(value);
  const chips = options
    .map(
      (o) => `<button type="button" class="fd-chip" data-value="${escapeHtml(o)}"
        aria-pressed="${current === String(o) ? "true" : "false"}">${escapeHtml(o)}</button>`
    )
    .join("");
  return `<div class="fd-chips" data-key="${escapeHtml(field.key)}" role="radiogroup"
    aria-label="${escapeHtml(field.label || field.key)}">${chips}</div>`;
}

function multiControl(field, value) {
  const selected = Array.isArray(value) ? value.map(String) : [];
  const options = Array.isArray(field.options) ? field.options : null;

  /* 有预设选项（如任务清单的「工作 / 生活 / 学习 / 杂事」）→ 胶囊多选 */
  if (options) {
    const chips = options
      .map(
        (o) => `<button type="button" class="fd-chip" data-value="${escapeHtml(o)}"
          aria-pressed="${selected.indexOf(String(o)) !== -1 ? "true" : "false"}">${escapeHtml(o)}</button>`
      )
      .join("");
    return `<div class="fd-chips" data-key="${escapeHtml(field.key)}" data-multi="1"
      role="group" aria-label="${escapeHtml(field.label || field.key)}">${chips}</div>`;
  }

  /* 没预设选项（如日记/观影的「标签」）→ 自己打标签，回车添加 */
  const tags = selected
    .map(
      (t) => `<span class="fd-tag" data-value="${escapeHtml(t)}">${escapeHtml(t)}<button
        type="button" class="fd-tag-del" aria-label="删除标签 ${escapeHtml(t)}">×</button></span>`
    )
    .join("");
  return `<div class="fd-multi" data-key="${escapeHtml(field.key)}">
    <div class="fd-tags" data-role="tags">${tags}</div>
    <input class="fd-input fd-tag-input" type="text" data-role="tag-input"
      placeholder="输入后回车添加" autocomplete="off" enterkeyhint="done">
  </div>`;
}

function ratingControl(field, value) {
  const max = Number(field.max) || 5;
  const n = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
  const stars = [];
  for (let i = 1; i <= max; i++) {
    stars.push(`<button type="button" class="fd-star" data-value="${i}"
      aria-pressed="${i <= n ? "true" : "false"}"
      aria-label="${i} 颗星">★</button>`);
  }
  return `<div class="fd-rating" data-key="${escapeHtml(field.key)}" data-value="${n}"
    role="group" aria-label="${escapeHtml(field.label || "评分")}">${stars.join("")}</div>`;
}

function imageControl(field, value) {
  const all = imageList(field, value);
  const shown = all.filter(isLocalImageValue).map(localImageId);

  /* 不是本地图片的值（H5 之后会是云端路径）H1 画不出来，
     但绝不能顺手丢掉 —— 挂在 data-keep 上，读回时原样拼回去。 */
  const keep = all.filter((v) => !isLocalImageValue(v));

  const max = MAX_IMAGES;
  /* 有值就不给加号：单张字段若已经挂着云端路径（画不出来但存在），
     也不能让用户再加一张把它顶掉。 */
  const canAdd = field.multiple ? shown.length < max : all.length === 0;

  const cells = shown
    .map(
      (id) => `<div class="fd-img" data-asset="${escapeHtml(id)}">
        <img class="fd-img-pic" alt="" decoding="async">
        <button type="button" class="fd-img-del" aria-label="删除这张图片"></button>
      </div>`
    )
    .join("");

  const add = canAdd
    ? `<button type="button" class="fd-img-add" aria-label="添加图片"
        ><span class="fd-img-plus" aria-hidden="true"></span></button>`
    : "";

  /* 多张的字段才显示「已放几张」，单张字段显示这个纯属噪音 */
  const count = field.multiple
    ? `<div class="fd-img-count">${shown.length} / ${max}</div>`
    : "";

  return `<div class="fd-images" data-key="${escapeHtml(field.key)}"
    data-multiple="${field.multiple ? "1" : "0"}" data-max="${max}"
    data-keep="${escapeHtml(JSON.stringify(keep))}">
    <div class="fd-img-grid">${cells}${add}</div>
    ${count}
  </div>`;
}

/* ---------- 计时（单元9e） ----------

   一条记录占两行，手机上才不会跟文字框抢地方：
     1  [做什么………………]  [ 开始 ]     ← 点「开始」→ 按钮原地变「结束」（位置不跳）
        09:30-10:15，用时 00:45  [×]  ← 时间小字：小一号 + 次要色 + 等宽数字
   时间和内容用两种字重区分，扫一眼就能把「做什么」和「花了多久」分开。
   按钮只有一枚、宽度固定：文字框的宽度全程不变。
   ------------------------------------------------------------------ */

/** 界面上先摆的那一条空行：只摆在界面上，用户没动就不会进库 */
function entriesForControl(value) {
  const list = normalizeEntries(value);
  return list.length ? list : [blankEntry()];
}

/**
 * 一列计时行的 HTML。
 * @param {Array}  entries
 * @param {object} [opts]
 *   canDel:false  只画不删（整格只有一条空行时用）
 *   reverse:true  倒着画。编辑视角用（单元9f）：最新的排最上面，事例多了不用滑到底。
 *                 序号仍是数据里的真实序号，所以从上往下看到的是 3、2、1。
 */
function timerRowsHtml(entries, opts = {}) {
  const list = entries && entries.length ? entries : [blankEntry()];
  const canDel = opts.canDel !== false;

  const numbered = list.map((e, i) => ({ e, no: i + 1 }));
  const ordered = opts.reverse ? numbered.slice().reverse() : numbered;

  return ordered
    .map(({ e, no }) => {
      const running = isRunning(e);
      const time = formatEntryTime(e);
      return `
      <div class="fd-timer-row" data-role="row" data-id="${escapeHtml(e.id)}"
        data-start="${escapeHtml(e.start || "")}" data-end="${escapeHtml(e.end || "")}">
        <div class="fd-timer-main">
          <span class="fd-timer-no" aria-hidden="true">${no}</span>
          <input class="fd-input fd-timer-text" type="text" maxlength="${TIMER_TEXT_MAX}"
            value="${escapeHtml(e.text)}" placeholder="做什么…" autocomplete="off" enterkeyhint="done">
          <button type="button" class="fd-timer-btn${running ? " is-stop" : ""}"
            data-role="toggle">${running ? "结束" : "开始"}</button>
          ${
            canDel
              ? `<button type="button" class="fd-timer-del" data-role="del"
                  aria-label="删掉第 ${no} 条">×</button>`
              : ""
          }
        </div>${
          /* 下面那层只在真的有时刻可显示时才画。
             没点过开始的那条就干干净净一行 —— 摆一层只放个「×」的空白，
             既白占高度又显得空荡（「×」已经挪进上面那一行了）。 */
          time
            ? `
        <div class="fd-timer-sub">
          <span class="fd-timer-time${running ? " is-running" : ""}">${escapeHtml(time)}</span>
        </div>`
            : ""
        }
      </div>`;
    })
    .join("");
}

/**
 * 一列计时行的 HTML（对外：加了一条 / 删了一条之后整列重画时用）。
 * 整格只有一条空行时不给「×」—— 没东西可删，摆个删除键会让人以为点一下能清空这格。
 * @param {object} [opts] { reverse:true 倒着画（编辑视角） }
 */
export function timerListHtml(entries, opts = {}) {
  const list = entries && entries.length ? entries : [blankEntry()];
  const loneBlank = list.length === 1 && !list[0].text && !list[0].start;
  return timerRowsHtml(list, { canDel: !loneBlank, reverse: opts.reverse === true });
}

function timerControl(field, value) {
  const list = entriesForControl(value);
  const sum = timerSummary(list);
  /* 整格只有一条空行时不摆「×」（和 timerListHtml 同一条规矩，
     两处必须一致：初次渲染走这里、加/删之后重画走那边，判断不一样就会出现
     「进来时有个孤零零的×、点一下加一条又没了」这种前后不一）。 */
  const loneBlank = list.length === 1 && !list[0].text && !list[0].start;

  /* 编辑视角的排布（单元9f 用户拍板）：
     「＋加一条」摆在最上面、事例倒着排（3、2、1）——
     事例多了不用滑到底才能加，一进来看到的就是新增入口和最新那条。
     库里存的顺序仍是 1、2、3：data-order="desc" 只是告诉读回时该转个向。 */
  return `<div class="fd-timer" data-key="${escapeHtml(field.key)}" data-order="desc">
    <button type="button" class="fd-timer-add" data-role="add">
      <span class="fd-timer-plus" aria-hidden="true"></span>加一条
    </button>
    <div class="fd-timer-list" data-role="list">${timerRowsHtml(list, {
      canDel: !loneBlank,
      reverse: true,
    })}</div>
    <div class="fd-timer-sum"${sum ? "" : " hidden"}>${escapeHtml(sum)}</div>
  </div>`;
}

/**
 * 从界面上一列计时行里把数据读回来（用户在打字的那份就是它）。
 * 时刻挂在每行的 data-start / data-end 上 —— 改一行只动属性，不用重画整列。
 *
 * 编辑视角是倒着画的（data-order="desc"，从上往下是 3、2、1），
 * 所以读回后要转正再交出去。**这一转不能漏**：漏了的话每保存一次顺序就翻一次，
 * 来回切几次视角，事例次序就乱了。
 */
export function readTimerEntries(wrap) {
  if (!wrap) return [];
  const list = Array.prototype.map.call(wrap.querySelectorAll(".fd-timer-row"), (row) => {
    const input = row.querySelector(".fd-timer-text");
    return {
      id: row.dataset.id || "",
      text: input ? input.value : "",
      start: row.dataset.start || "",
      end: row.dataset.end || "",
    };
  });
  return wrap.dataset.order === "desc" ? list.reverse() : list;
}

/**
 * 只重画一行（点开始/结束时用）。
 * 不整列重画是关键：用户可能刚在某个框里打了字、光标还在那儿，
 * 整列重画会把光标和输入法状态弄丢。
 *
 * 「时刻那一层」是按需要现挂现摘的（没点开始就没有那一层），
 * 所以这里不能假设它已经存在 —— 现摘比整列重画便宜得多。
 */
export function paintTimerRow(row) {
  if (!row) return;
  const start = row.dataset.start || "";
  const end = row.dataset.end || "";
  const running = !!start && !end;

  const btn = row.querySelector(".fd-timer-btn");
  if (btn) {
    btn.textContent = running ? "结束" : "开始";
    btn.classList.toggle("is-stop", running);
  }

  const text = formatEntryTime({ start, end });
  let sub = row.querySelector(".fd-timer-sub");

  if (!text) {
    if (sub) sub.remove(); // 又被清空了（重来一轮）→ 整层收掉，那行又回到干净的一层
    return;
  }

  if (!sub) {
    sub = document.createElement("div");
    sub.className = "fd-timer-sub";
    row.appendChild(sub);
  }

  let timeEl = sub.querySelector(".fd-timer-time");
  if (!timeEl) {
    timeEl = document.createElement("span");
    timeEl.className = "fd-timer-time";
    sub.appendChild(timeEl);
  }
  timeEl.textContent = text;
  timeEl.classList.toggle("is-running", running);
}

/** 刷一下最下面那行「几条 · 合计」（加/删/结束之后调用） */
export function paintTimerSummary(wrap) {
  if (!wrap) return;
  const el = wrap.querySelector(".fd-timer-sum");
  if (!el) return;
  const text = timerSummary(normalizeEntries(readTimerEntries(wrap)));
  el.textContent = text;
  el.hidden = !text;
}

/* ---------- 清单（单元9g） ----------

   一条占一行，和计时同一种排法（一行一条、不抢高度）：
     ( ) [写周报………………]  [×]
     (✓) [写周报………………]  [×]      ← 勾上：圈变绿底白钩、字变灰加删除线
   圈在左边、贴着文字，和纸上打勾的习惯一致；「×」在最右端，和计时同位置。
   ------------------------------------------------------------------ */

/** 界面上先摆的那一条空行：只摆在界面上，用户没动就不会进库 */
function entriesForTodo(value) {
  const list = normalizeTodos(value);
  return list.length ? list : [blankTodo()];
}

/**
 * 一列清单行的 HTML。顺序就是数据里的顺序（**不做倒序**）：
 * 清单是步骤，1、2、3 本身有意义，倒过来看就别扭了。
 *
 * @param {Array}  entries
 * @param {object} [opts] { canDel:false 只画不删（整格只有一条空行时用） }
 */
function todoRowsHtml(entries, opts = {}) {
  const list = entries && entries.length ? entries : [blankTodo()];
  const canDel = opts.canDel !== false;

  return list
    .map((e, i) => {
      const no = i + 1;
      return `
      <div class="fd-todo-row" data-role="row" data-id="${escapeHtml(e.id)}"
        data-done="${e.done ? "1" : "0"}">
        <button type="button" class="fd-todo-circle" data-role="check"
          aria-pressed="${e.done ? "true" : "false"}"
          aria-label="第 ${no} 条${e.done ? "已完成，点一下取消" : "未完成，点一下算做完"}"></button>
        <input class="fd-input fd-todo-text" type="text" maxlength="${TODO_TEXT_MAX}"
          value="${escapeHtml(e.text)}" placeholder="要做什么…" autocomplete="off" enterkeyhint="done">
        ${
          canDel
            ? `<button type="button" class="fd-todo-del" data-role="del"
                aria-label="删掉第 ${no} 条">×</button>`
            : ""
        }
      </div>`;
    })
    .join("");
}

/** 整格是不是只有一条什么都没写的空行（这种不给「×」—— 没东西可删） */
function loneBlankTodo(list) {
  return list.length === 1 && !list[0].text && !list[0].done;
}

/**
 * 一列清单行的 HTML（对外：加了一条 / 删了一条之后整列重画时用）。
 * 判断空行那条规矩必须和 todoControl 里完全一致：两处不一致就会出现
 * 「进来时有个孤零零的×、点一下加一条又没了」这种前后不一。
 */
export function todoListHtml(entries) {
  const list = entries && entries.length ? entries : [blankTodo()];
  return todoRowsHtml(list, { canDel: !loneBlankTodo(list) });
}

function todoControl(field, value) {
  const list = entriesForTodo(value);
  const sum = todoProgress(list);

  return `<div class="fd-todo" data-key="${escapeHtml(field.key)}">
    <button type="button" class="fd-todo-add" data-role="add">
      <span class="fd-todo-plus" aria-hidden="true"></span>加一条
    </button>
    <div class="fd-todo-list" data-role="list">${todoRowsHtml(list, {
      canDel: !loneBlankTodo(list),
    })}</div>
    <div class="fd-todo-sum"${sum ? "" : " hidden"}>${escapeHtml(sum)}</div>
  </div>`;
}

/**
 * 从界面上一列清单行里把数据读回来（用户在打字的那份就是它）。
 * 「勾没勾」挂在每行的 data-done 上 —— 勾一下只动属性，不用重画整列。
 * 顺序按界面上的先后（正序），不用转。
 */
export function readTodoEntries(wrap) {
  if (!wrap) return [];
  return Array.prototype.map.call(wrap.querySelectorAll(".fd-todo-row"), (row) => {
    const input = row.querySelector(".fd-todo-text");
    return {
      id: row.dataset.id || "",
      text: input ? input.value : "",
      done: row.dataset.done === "1",
    };
  });
}

/**
 * 只改一行的「勾没勾」（点圈时用）。
 * 不整列重画：用户可能刚在某个框里打了字、光标还在那儿。
 * 视觉上「圈变实、字变灰划线」全靠 CSS 认 data-done，所以这里只翻属性 + 无障碍标签。
 */
export function paintTodoRow(row) {
  if (!row) return;
  const done = row.dataset.done === "1";

  const circle = row.querySelector(".fd-todo-circle");
  if (circle) {
    circle.setAttribute("aria-pressed", done ? "true" : "false");
    /* 序号从界面上现数：圈本身没写第几，读屏的人得听得出来是哪一条 */
    const rows = row.parentNode ? row.parentNode.querySelectorAll(".fd-todo-row") : [];
    const at = Array.prototype.indexOf.call(rows, row);
    if (at >= 0) {
      circle.setAttribute(
        "aria-label",
        `第 ${at + 1} 条${done ? "已完成，点一下取消" : "未完成，点一下算做完"}`
      );
    }
  }
}

/** 刷一下最下面那行「几条 · 已完成几」（勾/加/删之后调用） */
export function paintTodoSummary(wrap) {
  if (!wrap) return;
  const el = wrap.querySelector(".fd-todo-sum");
  if (!el) return;
  const text = todoProgress(normalizeTodos(readTodoEntries(wrap)));
  el.textContent = text;
  el.hidden = !text;
}

/* ---------- 对外：渲染 ---------- */

/**
 * 生成一个字段的录入控件 HTML。
 * @param {object} field 字段定义
 * @param {*} value      当前值（undefined 表示用该类型的空值）
 */
export function renderControl(field, value) {
  const v = value === undefined ? "" : value;
  switch (field.type) {
    case "longtext":
      return longTextControl(field, v);
    case "link":
      return linkControl(field, v);
    case "number":
      return numberControl(field, v);
    case "date":
      return dateControl(field, v);
    case "check":
      return checkControl(field, v);
    case "select":
      return selectControl(field, v);
    case "multi":
      return multiControl(field, v);
    case "rating":
      return ratingControl(field, v);
    case "image":
      return imageControl(field, v);
    case "timer":
      return timerControl(field, v);
    case "todo":
      return todoControl(field, v);
    case "text":
    case "relation":
    default:
      return textControl(field, v);
  }
}

/* ---------- 对外：读取 ---------- */

/* ---------- 对外：把图片真正显示出来 ---------- */

/**
 * 给控件里所有图片格子补上真实图片。
 * renderControl 是同步返回 HTML 的，而取图是异步的，
 * 所以画完之后必须再补这一步（未补之前格子是空的，不会闪破图）。
 * @param {HTMLElement} root 渲染出来的容器（一般传 .fd-control 或整页）
 */
export function hydrateImages(root) {
  if (!root) return Promise.resolve();
  const tasks = [];
  for (const cell of root.querySelectorAll(".fd-img[data-asset]")) {
    const img = cell.querySelector(".fd-img-pic");
    if (img && !img.getAttribute("src")) tasks.push(fillImage(img, cell.dataset.asset));
  }
  return Promise.all(tasks);
}

/**
 * 从一行字段的 DOM 里把值读回来（原始值，交给 normalizeValue 规整）。
 * @param {HTMLElement} row   该字段的 .field-row
 * @param {object} field
 */
export function readControl(row, field) {
  const box = row.querySelector(".fd-control") || row;

  switch (field.type) {
    case "check": {
      const el = box.querySelector("input[type=checkbox]");
      return !!(el && el.checked);
    }
    case "select": {
      const on = box.querySelector('.fd-chip[aria-pressed="true"]');
      return on ? on.dataset.value : "";
    }
    case "multi": {
      const multi = box.querySelector(".fd-multi");
      if (multi) {
        return Array.prototype.map.call(
          multi.querySelectorAll(".fd-tags .fd-tag"),
          (t) => t.dataset.value
        );
      }
      return Array.prototype.map.call(
        box.querySelectorAll('.fd-chip[aria-pressed="true"]'),
        (c) => c.dataset.value
      );
    }
    case "rating": {
      const el = box.querySelector(".fd-rating");
      return el ? Number(el.dataset.value) || 0 : 0;
    }
    case "image": {
      const wrap = box.querySelector(".fd-images");
      if (!wrap) return undefined;

      /* 界面上现在摆着的这几张 */
      const shown = Array.prototype.map
        .call(wrap.querySelectorAll(".fd-img"), (el) => el.dataset.asset || "")
        .filter(Boolean)
        .map(imageValue);

      /* 加上画不出来但必须保住的旧值（H5 的云端路径） */
      let keep = [];
      try {
        const parsed = JSON.parse(wrap.dataset.keep || "[]");
        if (Array.isArray(parsed)) keep = parsed;
      } catch (err) {
        keep = [];
      }

      const merged = keep.concat(shown);
      return field.multiple ? merged : merged.length ? merged[0] : "";
    }
    case "timer":
      return readTimerEntries(box.querySelector(".fd-timer[data-key]"));
    case "todo":
      return readTodoEntries(box.querySelector(".fd-todo[data-key]"));
    default: {
      const el = box.querySelector("[data-key]");
      return el ? el.value : "";
    }
  }
}
