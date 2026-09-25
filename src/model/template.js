/* ============================================================
   一格 · 模板模型（单元9a 建；单元9b 加布局项与约束三项）
   任务书 §5.2：模板 = 字段定义数组 + 布局配置。
     布局级（模板编辑器要暴露）：coverField / listFields / density
     约束级（只做三项）：default（默认值）/ required（必填开关）/ min·max（数值与日期范围）
     不做唯一性约束、不做自定义校验表达式。

   这里放的全是「模板自己的规矩」，一行卡片数据都不碰。三条口径：
   · 改字段名（label）只改显示 —— 卡片认的是字段的 key，所以改名、调顺序
     都不会影响已经填好的内容。
   · 字段的 key 一旦生成就不再变（它是数据认人的依据），由 newFieldKey 造。
   · 删字段只从模板里去掉；卡片 values 里那个键原样留在库里
     （任务书 §6.5「不匹配的移入 orphans，绝不静默丢弃」—— H1 先留原地，
     孤儿数据的展示界面属后续阶段）。
   ============================================================ */

import { FIELD_TYPE_LABELS } from "./field.js";

export const TEMPLATE_SCHEMA_VERSION = 1;

/**
 * 模板编辑器里能选的后端类型（画界面的顺序）。
 * 不含 relation：任务书 §5.1 明确「relation 不实现 UI，遇到按普通字符串降级显示」。
 * timer 是单元9e 加的第 11 种（用户追加的需求，任务书里没有）。
 */
export const EDITABLE_TYPES = [
  "text",
  "longtext",
  "number",
  "date",
  "check",
  "select",
  "multi",
  "rating",
  "image",
  "link",
  "timer",
  "todo",
];

/** 新建单选字段时先给两个占位选项（选项为空的单选没法用） */
const SEED_OPTIONS = ["选项一", "选项二"];

/* ============================================================
   轻量约束（单元9b · 任务书 §5.2）
   只做三项：default / required / min·max。
   下面这张表说清「哪种类型配得上哪几项」，界面按它决定显示哪几行 ——
   免得出现「图片字段让你填默认值」这种没有意义的设置。
   defaultValue 的取值 = 面板里该用哪种输入形式：
     text   文本框      number 数字框     date   今天 / 指定某天
     check  默认开关    choice 从选项里挑  rating 几颗星
     null   这个类型不设默认值（多选、图片）
   ============================================================ */

export const CONSTRAINT_SUPPORT = {
  text: { defaultValue: "text", required: true, minMax: false },
  longtext: { defaultValue: "text", required: true, minMax: false },
  link: { defaultValue: "text", required: true, minMax: false },
  number: { defaultValue: "number", required: true, minMax: true },
  date: { defaultValue: "date", required: true, minMax: true },
  check: { defaultValue: "check", required: false, minMax: false }, // 开关永远有值，必填没意义
  select: { defaultValue: "choice", required: true, minMax: false },
  rating: { defaultValue: "rating", required: true, minMax: false },
  multi: { defaultValue: null, required: true, minMax: false },
  image: { defaultValue: null, required: true, minMax: false },
  /* 计时（单元9e）：一列记录，谈不上「默认值」；上下限也没意义。 */
  timer: { defaultValue: null, required: true, minMax: false },
  /* 清单（单元9g）：同上，一列条目，既不设默认值也没有上下限。 */
  todo: { defaultValue: null, required: true, minMax: false },
};

/** 某个字段能配哪些约束（认不出来的类型给最宽松的一套） */
export function constraintSupport(field) {
  return (
    CONSTRAINT_SUPPORT[(field && field.type) || ""] || {
      defaultValue: "text",
      required: true,
      minMax: false,
    }
  );
}

/* ---------- 字段 key ---------- */

/**
 * 造一个模板内不重复的字段 key（f_ + 4 位十六进制）。
 * 只是模板内部的编号，不进卡片数据结构的约定，短就够了。
 */
function newFieldKey(existing) {
  const used = new Set(existing.map((f) => f.key));
  for (let i = 0; i < 50; i++) {
    const key = "f_" + Math.random().toString(16).slice(2, 6).padEnd(4, "0");
    if (!used.has(key)) return key;
  }
  return "f_" + Date.now().toString(16).slice(-4);
}

/* ---------- 新建字段 ---------- */

/**
 * 按类型造一个新字段。每种类型只带它「必需」的参数，
 * 可选参数（默认值 / 必填 / 上下限）等 9b 再说 —— 不提前写用不上的东西。
 * @param {string} type     字段类型
 * @param {Array}  existing 现有字段（用来避开重复的 key）
 */
export function blankField(type, existing = []) {
  const base = { key: newFieldKey(existing), label: "新字段", type };

  switch (type) {
    case "longtext":
      return { ...base, maxImages: 5 };
    case "number":
      return { ...base, unit: "", decimals: 0 };
    case "date":
      return { ...base, withTime: false };
    case "select":
      return { ...base, options: SEED_OPTIONS.slice() };
    case "multi":
      return { ...base, options: null }; // null = 不预设，允许自己打标签
    case "rating":
      return { ...base, max: 5 };
    case "image":
      return { ...base, multiple: false };
    default:
      return base;
  }
}

/* ---------- 选项文本 ↔ 数组 ---------- */

/** 「一行一个」的文本 → 数组（去空行、去重，保持输入顺序） */
export function linesToOptions(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const s = line.trim();
    if (s && out.indexOf(s) === -1) out.push(s);
  }
  return out;
}

/** 数组 → 「一行一个」的文本（填进面板里的多行输入框） */
export function optionsToLines(options) {
  return (Array.isArray(options) ? options : []).join("\n");
}

/* ---------- 约束三项的规整（单元9b） ---------- */

/** "YYYY-MM-DD" 的粗校验（宽松 schema，不追究是不是真实存在的日期） */
function isIsoDay(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * 默认值收成该类型该有的样子。
 * 收不出来（空的 / 不合规）就返回 undefined —— 表示「不预填」，
 * 这样新建卡片时不会往 values 里塞一个没意义的空值。
 */
function coerceDefault(field, raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;

  switch (field.type) {
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case "date": {
      if (raw === "today") return "today"; // 哨兵：新建卡片时填当天（任务书 §5.2）
      const s = String(raw).trim();
      return isIsoDay(s) ? s : undefined;
    }
    case "check":
      return Boolean(raw);
    case "rating": {
      const n = Math.round(Number(raw));
      const top = Math.max(3, Math.min(10, Math.round(Number(field.max) || 5)));
      return Number.isFinite(n) ? Math.max(1, Math.min(top, n)) : undefined;
    }
    case "select": {
      const s = String(raw).trim();
      const options = Array.isArray(field.options) ? field.options : [];
      // 选项里已经删掉的那个值不留 —— 否则新卡片会带着一个选不中的默认值
      return s && options.indexOf(s) >= 0 ? s : undefined;
    }
    case "text":
    case "longtext":
    case "link":
      return String(raw);
    default:
      return undefined;
  }
}

/** 上下限收成该类型该有的样子：数字类型要数字，日期类型要 "YYYY-MM-DD" / "today" */
function coerceBound(field, raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (field.type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (field.type === "date") {
    if (raw === "today" || raw === "今天") return "today";
    const s = String(raw).trim();
    return isIsoDay(s) ? s : undefined;
  }
  return undefined;
}

/* ---------- 规整 ---------- */

/**
 * 单个字段的规整：补齐该类型必需的参数、清掉不该留的空值。
 * 认不出来的参数（placeholder / default / required / min / max …）一律原样保留，
 * 免得「改个名字」把别的东西顺手抹掉。
 */
export function normalizeField(field) {
  const type = EDITABLE_TYPES.indexOf(field.type) >= 0 ? field.type : "text";
  const out = { ...field, type };

  out.key = String(out.key || "").trim() || newFieldKey([]);
  out.label = String(out.label || "").trim() || FIELD_TYPE_LABELS[type] || "字段";

  switch (type) {
    case "longtext": {
      const n = Math.round(Number(out.maxImages));
      out.maxImages = Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 5;
      break;
    }
    case "number": {
      out.unit = String(out.unit || "").trim();
      if (!out.unit) delete out.unit; // 空单位不留痕迹（formatValue 会当成没有）
      const d = Math.round(Number(out.decimals));
      out.decimals = Number.isFinite(d) && d > 0 ? Math.min(4, d) : 0;
      break;
    }
    case "date":
      out.withTime = !!out.withTime;
      break;
    case "select": {
      const options = (Array.isArray(out.options) ? out.options : [])
        .map((o) => String(o).trim())
        .filter(Boolean);
      out.options = options.length ? options : SEED_OPTIONS.slice();
      break;
    }
    case "multi": {
      const options = (Array.isArray(out.options) ? out.options : [])
        .map((o) => String(o).trim())
        .filter(Boolean);
      out.options = options.length ? options : null;
      break;
    }
    case "rating": {
      const m = Math.round(Number(out.max));
      out.max = Number.isFinite(m) ? Math.max(3, Math.min(10, m)) : 5;
      break;
    }
    case "image":
      out.multiple = !!out.multiple;
      break;
    default:
      break;
  }

  /* 约束三项（单元9b）：只规整这个类型用得上的。
     用不上的类型不去动 min / max —— 万一哪个类型自己有别的含义，
     也遵守上面那条「不随手抹掉」的口径。 */
  const support = constraintSupport(out);

  if (support.required) out.required = !!out.required;

  if (support.minMax) {
    out.min = coerceBound(out, out.min);
    out.max = coerceBound(out, out.max);
    if (out.min === undefined) delete out.min;
    if (out.max === undefined) delete out.max;

    // 两头都填了却写反了 → 顺手调正（比报错友好，用户不用管方向）
    const bothNum = typeof out.min === "number" && typeof out.max === "number";
    const bothDay =
      typeof out.min === "string" &&
      isIsoDay(out.min) &&
      typeof out.max === "string" &&
      isIsoDay(out.max);
    if ((bothNum || bothDay) && out.min > out.max) {
      const t = out.min;
      out.min = out.max;
      out.max = t;
    }
  }

  if (support.defaultValue) {
    const d = coerceDefault(out, out.default);
    if (d === undefined) delete out.default;
    else out.default = d;
  }

  return out;
}

/**
 * 整份模板的规整。
 * 顺手做三件「改字段后必须跟着变」的善后（都不碰卡片数据）：
 *   · 标题字段被删掉了 → titleField 置 null，卡片标题退回 card.js 的三级兜底
 *   · 列表显示项里若含已删掉的字段 key → 去掉（listSummary 本来也会跳过）
 *   · 封面字段指向的字段不在了 → 置 null
 * @param {object} tpl    模板
 * @param {boolean} [touch] 是否顺手更新 updatedAt（写库时才需要）
 */
export function normalizeTemplate(tpl, touch = false) {
  const out = { ...tpl };

  out.schemaVersion = TEMPLATE_SCHEMA_VERSION;
  out.fields = (Array.isArray(out.fields) ? out.fields : []).map(normalizeField);

  const keys = new Set(out.fields.map((f) => f.key));

  const layout = { ...(out.layout || {}) };
  layout.coverField = keys.has(layout.coverField) ? layout.coverField : null;

  /* 列表显示项按字段在模板里的顺序排 ——
     这样「列表小字」的顺序跟卡片详情页从上到下一致，用户能预期。
     顺手把已删掉的字段 key 滤掉（listSummary 本来也会跳过）。 */
  const chosen = new Set(Array.isArray(layout.listFields) ? layout.listFields : []);
  layout.listFields = out.fields.map((f) => f.key).filter((k) => chosen.has(k));

  /* 卡片形态（单元9d 的 layout.skin「普通卡片 / 工具卡」）已按用户要求整块删掉：
     删它的理由是「进浏览再点编辑也一样方便」，那层额外入口不值得。
     老模板里如果还留着 skin 这个键，这里**故意原样保留** —— 已经没有代码再读它，
     顺手抹掉反而多一处动数据的地方（沿用「绝不静默丢弃」的一贯做法）。 */
  layout.density = layout.density === "compact" ? "compact" : "loose";
  out.layout = layout;

  if (out.titleField && !keys.has(out.titleField)) out.titleField = null;

  if (touch) out.updatedAt = new Date().toISOString();
  return out;
}

/* ---------- 增删改序 ---------- */

/** 字段上移/下移一格；越界或找不到就原样返回一份拷贝 */
export function moveField(fields, index, delta) {
  const next = fields.slice();
  const to = index + delta;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}

/** 删一个字段（顺手处理标题字段的善后） */
export function removeField(tpl, key) {
  return {
    ...tpl,
    fields: (tpl.fields || []).filter((f) => f.key !== key),
    titleField: tpl.titleField === key ? null : tpl.titleField,
  };
}

/* ---------- 给界面看的小字 ---------- */

/** 字段行右侧那个摘要：类型 + 该类型最要紧的一个参数 + 约束标记 */
export function fieldParamSummary(field) {
  const name = FIELD_TYPE_LABELS[field.type] || field.type;
  let base = name;

  switch (field.type) {
    case "select": {
      const n = (field.options || []).length;
      base = n ? `${name} · ${n} 个选项` : name;
      break;
    }
    case "multi": {
      const n = (field.options || []).length;
      base = n ? `${name} · ${n} 个选项` : `${name} · 自由填写`;
      break;
    }
    case "number":
      base = field.unit ? `${name} · ${field.unit}` : name;
      if (field.min !== undefined || field.max !== undefined) {
        base += ` · ${rangeText(field)}`;
      }
      break;
    case "rating":
      base = `${name} · 满分 ${Math.round(Number(field.max) || 5)}`;
      break;
    case "image":
      base = field.multiple ? `${name} · 可多张` : `${name} · 单张`;
      break;
    case "date":
      base = field.withTime ? `${name} · 带时间` : name;
      if (field.min !== undefined || field.max !== undefined) {
        base += ` · ${rangeText(field)}`;
      }
      break;
    default:
      break;
  }

  const marks = [];
  if (field.required) marks.push("必填");
  if (field.default !== undefined && field.default !== null && field.default !== "")
    marks.push("有默认值");

  return marks.length ? `${base} · ${marks.join(" · ")}` : base;
}

/** 上下限的人话（例：「1 ~ 5」「≥ 2026-01-01」） */
export function rangeText(field) {
  const lo = field.min;
  const hi = field.max;
  const fmt = (v) => (v === "today" ? "今天" : String(v));
  if (lo !== undefined && hi !== undefined) return `${fmt(lo)} ~ ${fmt(hi)}`;
  if (lo !== undefined) return `≥ ${fmt(lo)}`;
  return `≤ ${fmt(hi)}`;
}

/* ============================================================
   布局项（单元9b 的 coverField / listFields / density）
   ============================================================ */

/**
 * 松紧度（任务书 §5.2 的 layout.density）：宽松 / 紧凑，认不出来一律当「宽松」。
 * 两处都读它 —— 盒内卡片列表（单元9b）和卡片详情页的字段区（单元9f）。
 * 浏览视角**故意不跟**它：用户拍板「浏览不管设置宽松还是紧凑，都按宽松显示」，
 * 一屏里条目多的时候紧凑版挤得看不清。所以别拿它去调 .cv-* 的样式。
 */
export function densityOf(tpl) {
  return tpl && tpl.layout && tpl.layout.density === "compact" ? "compact" : "loose";
}

/** 能当卡片标题的字段：标题得是一句像名字的话，图片 / 勾选 / 多选当标题很怪 */
const TITLE_TYPES = ["text", "longtext", "link", "select", "number", "date"];

export function titleCandidates(tpl) {
  return (tpl.fields || []).filter((f) => TITLE_TYPES.indexOf(f.type) >= 0);
}

/** 封面只能取图片字段（封面卡片视图属 H3，这里先把配置存下来） */
export function coverCandidates(tpl) {
  return (tpl.fields || []).filter((f) => f.type === "image");
}

/** 类型的人话说明（面板里换类型时给一句，免得选错） */
export const TYPE_HINT = {
  text: "短内容，比如片名、书名",
  longtext: "长内容，比如正文、备注",
  number: "只收数字，可以带单位",
  date: "用系统日期选择器",
  check: "一个开关，只有开和关",
  select: "从你定好的几个选项里选一个",
  multi: "可以选多个，也可以自己打标签",
  rating: "点星星打分",
  image: "可以放图片（最多 5 张）",
  link: "一个网址",
  timer: "左边写做什么，右边点开始 / 结束，自动记时间并算用时",
  todo: "一列小事，点一下算做完，再点一下取消",
};
