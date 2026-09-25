/* ============================================================
   一格 · 字段模型（单元6a；单元9e 加第 11 种「计时」；单元9g 加第 12 种「清单」）
   任务书 §5.1 的 10 种字段类型 + 用户后加的 timer / todo，全部集中在这一张表里：
     录入（默认值）→ 规整（存成什么）→ 判空 → 显示（变成什么文字）

   字段定义本身就是模板里的一段 JSON（松散 schema，任务书 §5.4），
   所以这里所有函数都只依赖 field.type 和它的特有参数：
     text    maxLength                  string
     longtext maxImages:5               string（Markdown）
     number  unit/decimals/min/max      number
     date    withTime:boolean           "YYYY-MM-DD" 或 ISO
     check   —                          boolean
     select  options:string[]           string
     multi   options:string[]|null      string[]
     rating  max:5                      number
     image   multiple:boolean           string | string[]
     link    —                          string(URL)
     timer   —                          {id,text,start,end}[]（单元9e，见 model/timer.js）
     todo    —                          {id,text,done}[]（单元9g，见 model/todo.js）
   另：relation（卡片互链）不实现 UI，按普通字符串降级显示（任务书 §5.1）。
   ============================================================ */

import { plainText } from "./card.js";
import { normalizeEntries, timerSummary } from "./timer.js";
import { normalizeEntries as normalizeTodos, todoProgress } from "./todo.js";
import { formatDate, formatNumber, shortUrl, todayISO } from "../util/format.js";

/** 给模板编辑器用的人话名称（单元9 会用上） */
export const FIELD_TYPE_LABELS = {
  text: "单行文本",
  longtext: "多行文本",
  number: "数字",
  date: "日期",
  check: "勾选",
  select: "单选",
  multi: "多选",
  rating: "评分",
  image: "图片",
  link: "链接",
  timer: "计时",
  todo: "清单",
  relation: "关联",
};

/** 全部可实现 UI 的类型（任务书 §5.1 表格顺序） */
export const FIELD_TYPE_KEYS = Object.keys(FIELD_TYPE_LABELS);

/** 多选/图片这类「多值」字段 */
function isMultiValued(field) {
  return field.type === "multi" || (field.type === "image" && field.multiple);
}

/* ============================================================
   一、默认值
   ============================================================ */

/**
 * 字段的默认值（来自模板里的 `default`）。
 * 没写 default 定义时返回 undefined —— 表示「不预填」，
 * 这样新卡片的 values 里不会塞一堆用不上的空字段。
 *
 * date 的默认值支持写字符串 "today"，表示当天（任务书附录 A 就这么用）。
 */
export function defaultValue(field, now = new Date()) {
  const d = field.default;

  if (field.type === "date") {
    if (d === "today") return todayISO(now);
    return typeof d === "string" && d ? d : undefined;
  }

  if (d === undefined) return undefined;

  switch (field.type) {
    case "number": {
      const n = Number(d);
      return Number.isFinite(n) ? n : undefined;
    }
    case "rating":
      return clampRating(d, field.max);
    case "multi":
      return Array.isArray(d) ? dedupe(d) : undefined;
    case "image":
      return field.multiple ? [] : "";
    case "check":
      return Boolean(d); // false 也是有效默认值（待办默认「未完成」）
    default:
      return d;
  }
}

/**
 * 新建卡片时的初始 values：先放 seed（如用户填的标题），
 * 再把模板里有 default 的字段补上。
 */
export function initialValues(template, seed = {}, now = new Date()) {
  const out = { ...seed };
  for (const f of (template && template.fields) || []) {
    if (out[f.key] !== undefined) continue;
    const d = defaultValue(f, now);
    if (d !== undefined) out[f.key] = d;
  }
  return out;
}

/* ============================================================
   二、规整（控件读回来的值 → 存进数据的值）
   ============================================================ */

function dedupe(list) {
  const out = [];
  for (const v of list) {
    const s = String(v == null ? "" : v).trim();
    if (s && out.indexOf(s) === -1) out.push(s);
  }
  return out;
}

function clampRating(raw, max) {
  const top = Number(max) || 5;
  const n = Math.round(Number(raw) || 0);
  return Math.max(0, Math.min(top, n));
}

/**
 * 把控件的原始取值规整成「该类型的标准值」。
 * @param {object} field 字段定义
 * @param {*} raw        控件读回来的值
 */
export function normalizeValue(field, raw) {
  switch (field.type) {
    case "number": {
      if (raw === "" || raw === null || raw === undefined) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case "check":
      return Boolean(raw);
    case "rating":
      return clampRating(raw, field.max);
    case "multi":
      return dedupe(Array.isArray(raw) ? raw : []);
    case "image":
      return field.multiple ? dedupe(Array.isArray(raw) ? raw : []) : String(raw || "");
    case "timer":
      /* 计时是一列小对象（单元9e）：去空条、补编号、把时刻收成标准 ISO */
      return normalizeEntries(raw);
    case "todo":
      /* 清单同样是一列小对象（单元9g）：去空条、补编号、勾选收成 true/false */
      return normalizeTodos(raw);
    case "date":
      return typeof raw === "string" ? raw.trim() : "";
    case "text":
    case "longtext":
    case "link":
    case "select":
    case "relation":
    default:
      return String(raw == null ? "" : raw).trim();
  }
}

/* ============================================================
   三、判空
   ============================================================ */

/**
 * 这个值算不算「空」。
 * 注意：勾选 false、数字 0 都算「有值」——不能当空处理，
 * 否则「已完成=false」会被当成没填。（与 card.js 的标题兜底口径一致。）
 */
export function isBlank(field, value) {
  if (value === null || value === undefined) return true;
  if (field.type === "number") return false; // 0 是有值
  if (isMultiValued(field)) return !Array.isArray(value) || value.length === 0;
  /* 计时（单元9e）：一列记录，一条都没有才算空。
     只写了内容、还没点过开始的那条也算「有值」—— 用户确实往里写了东西。 */
  if (field.type === "timer") return !Array.isArray(value) || value.length === 0;
  /* 清单（单元9g）：同上，一条都没有才算空。
     只勾过、没写字的那条也算「有值」—— 勾本身就是一条信息。 */
  if (field.type === "todo") return !Array.isArray(value) || value.length === 0;
  if (field.type === "check" || field.type === "rating") return false;
  return String(value).trim().length === 0;
}

/* ============================================================
   三之二、轻量约束（单元9b）
   任务书 §5.2 只做三项：default（默认值）/ required（必填）/ min·max（数值与日期范围）。
   这两件事都**只用来提醒，不拦人** —— 卡片是自动保存、没有「保存」按钮，
   硬拦会把人困在详情页里退不出去。
   ============================================================ */

/** 标了必填却空着 */
export function isMissing(field, value) {
  return !!field.required && isBlank(field, value);
}

/** 把日期值收成能比较的 "YYYY-MM-DD"（带时间的按本地时区取日期部分） */
function dayOf(value) {
  const s = String(value == null ? "" : value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return "";
  if (!m[4] && !m[5]) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? `${m[1]}-${m[2]}-${m[3]}` : todayISO(d);
}

/** 上下限里的 "today" 解析成当天 */
function boundDay(bound, now) {
  if (bound === "today") return todayISO(now);
  return typeof bound === "string" ? dayOf(bound) : "";
}

/**
 * 越界检查：返回一句人话，没问题返回 null。
 * 只认 number 和 date 的 min / max（任务书 §5.2 的原话是「数值与日期范围」）。
 */
export function constraintIssue(field, value, now = new Date()) {
  /* 空的不用报越界。
     注意要单独挡一下空字符串：number 的「空」本来是 null，但控件刚清空时
     可能读回 ""，而 Number("") 是 0 —— 不挡的话一清空就跳「不能小于 5」。 */
  if (value === null || value === undefined || value === "") return null;
  if (isBlank(field, value)) return null;

  if (field.type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const show = (v) => formatNumber(v, { decimals: field.decimals, unit: field.unit || "" });
    if (typeof field.min === "number" && n < field.min) return `不能小于 ${show(field.min)}`;
    if (typeof field.max === "number" && n > field.max) return `不能大于 ${show(field.max)}`;
    return null;
  }

  if (field.type === "date") {
    const day = dayOf(value);
    if (!day) return null;
    const lo = boundDay(field.min, now);
    const hi = boundDay(field.max, now);
    if (lo && day < lo) return `不能早于 ${lo}`;
    if (hi && day > hi) return `不能晚于 ${hi}`;
    return null;
  }

  return null;
}

/* ============================================================
   四、显示（值 → 一行文字）
   ============================================================ */

/**
 * 把值变成给人看的一行文字（卡片列表小字、未来的卡片正面都用它）。
 * 空值返回 ""，调用方自己决定跳过还是显示占位。
 *
 * @param {object} field 字段定义
 * @param {*} value
 * @param {object} opts  { longtextChars: 摘要字数上限 }
 */
export function formatValue(field, value, opts = {}) {
  if (value === null || value === undefined) return "";
  const maxChars = opts.longtextChars || 40;

  switch (field.type) {
    case "date":
      return formatDate(value, !!field.withTime);

    case "number":
      return formatNumber(value, {
        decimals: field.decimals,
        unit: field.unit || "",
      });

    case "check":
      return value ? "已完成" : "未完成";

    case "rating": {
      const n = clampRating(value, field.max);
      return n > 0 ? "★".repeat(n) : "";
    }

    case "multi": {
      const arr = Array.isArray(value) ? value : [];
      if (!arr.length) return "";
      const head = arr.slice(0, 3).join("、");
      return arr.length > 3 ? `${head} 等 ${arr.length} 项` : head;
    }

    case "image": {
      if (field.multiple) {
        const n = Array.isArray(value) ? value.length : 0;
        return n ? `${n} 张图片` : "";
      }
      return value ? "有图" : "";
    }

    case "link":
      return shortUrl(value);

    case "timer":
      /* 一行小字放不下整列，就给「几条、一共多久」（单元9e） */
      return timerSummary(value);

    case "todo":
      /* 同上：给「几条、做完几条」（单元9g） */
      return todoProgress(value);

    case "longtext": {
      const line = plainText(value);
      const chars = [...line];
      return chars.length > maxChars ? chars.slice(0, maxChars).join("") + "…" : line;
    }

    case "select":
    case "text":
    case "relation":
    default:
      return String(value);
  }
}

/**
 * 卡片列表里那行小字：按模板 layout.listFields 逐项格式化，
 * 空值自动跳过，用 " · " 连接。
 * 例：观影记录 → "2026-08-14 · ★★★★ · 已看"
 */
export function listSummary(card, template) {
  const fields = (template && template.fields) || [];
  const keys = (template && template.layout && template.layout.listFields) || [];
  const values = (card && card.values) || {};
  const parts = [];

  for (const key of keys) {
    const f = fields.find((x) => x.key === key);
    if (!f) continue;
    const text = formatValue(f, values[key]);
    if (text) parts.push(text);
  }
  return parts.join(" · ");
}
