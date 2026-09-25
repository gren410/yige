/* ============================================================
   一格 · DOM 小工具（单元3）
   所有要拼进 innerHTML / SVG 的用户内容都必须先转义
   （任务书 §3.3：字段可能含 `<`）。
   ============================================================ */

const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 把任意值转成安全的 HTML/SVG 文本 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}
