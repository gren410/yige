/* ============================================================
   一格 · 显示格式化（单元6a）
   把存起来的值变成给人看的文字：日期、数字（带单位）。
   任务书 §5.1：单位靠 number 的 unit 表达（"分钟" / "¥"），
   所以「时长」「金额」不需要单独的类型。
   ============================================================ */

/** 两位补零 */
export function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * 今天的日期（本地时区），格式 "YYYY-MM-DD"。
 * 必须用本地时间而不是 UTC —— 用 toISOString() 在晚上会差一天。
 */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * 日期显示。
 * 存的可能是 "2026-08-14"（纯日期）或完整 ISO 字符串（带时间）。
 * 带时间的按本地时区换算，避免出现"差一天"。
 *
 * @param {string} value     日期值
 * @param {boolean} withTime 是否显示到分钟
 */
export function formatDate(value, withTime = false) {
  if (!value) return "";
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return s;

  const hasTime = !!(m[4] || m[5]);
  let datePart;

  if (hasTime) {
    const d = new Date(s);
    datePart = Number.isNaN(d.getTime())
      ? `${m[1]}-${m[2]}-${m[3]}`
      : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    if (withTime && !Number.isNaN(d.getTime())) {
      return `${datePart} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    return datePart;
  }

  datePart = `${m[1]}-${m[2]}-${m[3]}`;
  return datePart;
}

/** 千分位（"1234.5" → "1,234.5"） */
export function groupThousands(text) {
  const neg = String(text).startsWith("-");
  const body = neg ? String(text).slice(1) : String(text);
  const [int, frac] = body.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + (frac ? "." + frac : "");
}

/** 货币符号：这类单位写在数字前面，其余（"分钟" / "kg"）写在后面 */
const CURRENCY_PREFIX = /^[¥$€£₩₹]$/;

/**
 * 数字显示。unit 是任务书 §5.1 里 number 类型的特有参数。
 * @param {*} value
 * @param {object} opts { decimals, unit, grouping }
 */
export function formatNumber(value, { decimals = null, unit = "", grouping = true } = {}) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);

  let body =
    decimals === null || decimals === undefined ? String(n) : n.toFixed(decimals);
  if (grouping) body = groupThousands(body);

  if (!unit) return body;
  return CURRENCY_PREFIX.test(unit) ? `${unit}${body}` : `${body} ${unit}`;
}

/**
 * 链接显示：去掉协议前缀，太长就截断（详情页里点得动，列表里只做展示）。
 */
export function shortUrl(value, max = 32) {
  const s = String(value || "").trim();
  if (!s) return "";
  const bare = s.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const chars = [...bare];
  return chars.length > max ? chars.slice(0, max).join("") + "…" : bare;
}
