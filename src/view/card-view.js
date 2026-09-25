/* ============================================================
   一格 · 卡片「浏览视角」
   点一张卡片进来，先看到的是这一版：标签和值并排一行、只读。
   点右上「编辑」才变成可填的样子（card-detail.js 里的编辑视角）。

   口径（用户拍板）：
   · 空字段照常占一行，值的位置写「—」
   · 当前卡片标题的来源字段不再重复列一遍（顶部大标题已经是它了）
   · 长文本完整显示（保留换行），图片直接显示缩略图
   · 计时字段摊开成一列「1. 内容（09:30-10:15，用时 00:45）」（单元9e）
   · 清单字段摊开成一列「圈 + 内容」，做完的那条灰掉划线（单元9g）
   · 链接字段先按文字显示；点了跳转留到后面的阶段再定
   · 这里只是「看」，一行都不给改 —— 改东西统一走右上「编辑」

   本文件只负责内容区（.cv-list）的 HTML 和补图；
   页面外壳（返回 / 编辑 / 删除 / 完成）在 card-detail.js 里。
   ============================================================ */

import { fillImage, imageList, isLocalImageValue, localImageId } from "../media/image.js";
import { formatValue, isBlank } from "../model/field.js";
import { formatEntryTime, isRunning, normalizeEntries } from "../model/timer.js";
import { normalizeEntries as normalizeTodos } from "../model/todo.js";
import { escapeHtml } from "../util/dom.js";

/**
 * 当前这张卡的标题实际取自哪个字段（没有则 null）。
 * 它已经在顶部以大字显示，浏览视角里不再重复列一行。
 *
 * 判断顺序和 card.js 的 cardTitle 三级兜底保持一致：
 * 先看模板指定的标题字段，它空了才退到「第一个非空的文本字段」。
 */
export function titleSourceKey(card, template) {
  const values = (card && card.values) || {};
  const fields = (template && template.fields) || [];
  const key = template && template.titleField;
  const named = key ? fields.find((f) => f.key === key) : null;

  if (named && !isBlank(named, values[key])) return key;

  for (const f of fields) {
    if (f.type !== "text" && f.type !== "longtext") continue;
    if (!isBlank(f, values[f.key])) return f.key;
  }
  return null;
}

/**
 * 浏览视角的内容区。
 * @param {object} opts
 * @param {object} opts.card     卡片
 * @param {object} opts.template 模板
 * @param {object} [opts.values] 临时覆盖一份 values（切视角时用内存里最新的那份）
 */
export function browseHtml({ card, template, values }) {
  const fields = (template && template.fields) || [];
  const vals = values || (card && card.values) || {};
  const skip = titleSourceKey({ values: vals }, template);

  const rows = fields
    .filter((f) => f.key !== skip)
    .map((f) => rowHtml(f, vals[f.key]))
    .join("");

  if (!rows) {
    return `<div class="placeholder">${
      fields.length ? "这张卡还没有内容" : "这个模板还没有字段"
    }</div>`;
  }
  return `<div class="cv-list">${rows}</div>`;
}

/* ---------- 一行 ---------- */

function rowHtml(field, value) {
  return `
    <div class="cv-row" data-field-key="${escapeHtml(field.key)}" data-type="${escapeHtml(field.type)}">
      <div class="cv-label">${escapeHtml(field.label || field.key)}</div>
      ${valueHtml(field, value)}
    </div>`;
}

/** 值的位置：不同字段类型有自己的「只看不改」长相 */
function valueHtml(field, value) {
  if (field.type === "image") return imagesHtml(field, value);
  if (field.type === "multi") return chipsHtml(value);
  if (field.type === "timer") return timerHtml(value);
  if (field.type === "todo") return todoHtml(value);
  if (isBlank(field, value)) return noneHtml();

  /* 长文本要完整显示，所以把摘要的截断关掉 */
  const text = formatValue(field, value, { longtextChars: Number.MAX_SAFE_INTEGER });
  if (!text) return noneHtml(); // 0 颗星等「格式化后是空的」情况

  const cls =
    field.type === "longtext"
      ? "cv-value cv-long"
      : field.type === "rating"
        ? "cv-value cv-rating"
        : "cv-value";
  return `<div class="${cls}">${escapeHtml(text)}</div>`;
}

/** 多选：全部摊开成小胶囊（列表小字那种「等 N 项」的省略在这里不要） */
function chipsHtml(value) {
  const arr = (Array.isArray(value) ? value : []).filter((v) => String(v == null ? "" : v).trim());
  if (!arr.length) return noneHtml();
  const cells = arr
    .map((v) => `<span class="cv-chip">${escapeHtml(String(v))}</span>`)
    .join("");
  return `<div class="cv-value cv-chips">${cells}</div>`;
}

/** 图片：一排缩略图，没有删除键也没有加号 */
function imagesHtml(field, value) {
  const list = imageList(field, value).filter((v) => v);
  if (!list.length) return noneHtml();

  const cells = list
    .map((v) => {
      // H1 只有本地图；将来云端路径会走另一套，先给个占位免得是一片破图
      if (!isLocalImageValue(v)) return `<span class="cv-img cv-img-other"></span>`;
      return `<span class="cv-img"><img alt="" data-asset="${escapeHtml(localImageId(v))}"></span>`;
    })
    .join("");

  return `<div class="cv-value cv-images">${cells}</div>`;
}

function noneHtml() {
  return `<div class="cv-value cv-none">—</div>`;
}

/* ---------- 计时（单元9e） ---------- */

/**
 * 计时：一条一行，就是用户给的那个格式 ——
 *   1. 读文档（09:30-10:15，用时 00:45）
 * 内容用正常字，括号里的时间用「小一号 + 次要色 + 等宽数字」，
 * 两种字重分开，「做什么」和「花了多久」一眼能分。
 * 正在计时的那条写「（11:00- 计时中）」并用醒目色，跟已结束的区分开。
 */
function timerHtml(value) {
  const entries = normalizeEntries(value);
  if (!entries.length) return noneHtml();

  const items = entries
    .map((e, i) => {
      const text = e.text
        ? `<span class="cv-timer-text">${i + 1}. ${escapeHtml(e.text)}</span>`
        : `<span class="cv-timer-text cv-timer-blank">${i + 1}. 未写内容</span>`;
      return `<div class="cv-timer-item">${text}${timerTimeHtml(e)}</div>`;
    })
    .join("");

  return `<div class="cv-value cv-timer">${items}</div>`;
}

/** 括号里那一段（没有时刻就不显示括号，免得出现一对空括号） */
function timerTimeHtml(entry) {
  const text = formatEntryTime(entry);
  if (!text) return "";
  const cls = isRunning(entry) ? "cv-timer-time is-running" : "cv-timer-time";
  return `<span class="${cls}">（${escapeHtml(text)}）</span>`;
}

/* ---------- 清单（单元9g） ---------- */

/**
 * 清单：一条一行，顺序就是存的顺序（1、2、3）。
 * 做完的那条**留在原地**灰掉划线（用户拍板）—— 位置不动就还能一眼找到，
 * 也不用多一层「已完成」分组。想改就点右上「编辑」。
 */
function todoHtml(value) {
  const entries = normalizeTodos(value);
  if (!entries.length) return noneHtml();

  const items = entries
    .map(
      (e) => `
      <div class="cv-todo-item${e.done ? " is-done" : ""}">
        <span class="cv-todo-dot" aria-hidden="true"></span>
        <span class="cv-todo-text${e.text ? "" : " cv-todo-blank"}">${
          e.text ? escapeHtml(e.text) : "未写内容"
        }</span>
      </div>`
    )
    .join("");

  return `<div class="cv-value cv-todo">${items}</div>`;
}

/* ---------- 补图 ---------- */

/**
 * 画完再补一步：把缩略图格子填上真实图片。
 * 取图是异步的，赶不上这次渲染；同一张图有临时地址缓存，来回切视角很快。
 */
export async function hydrateBrowse(container) {
  const imgs = Array.prototype.slice.call(container.querySelectorAll("img[data-asset]"));
  for (const img of imgs) {
    await fillImage(img, img.dataset.asset);
  }
}
