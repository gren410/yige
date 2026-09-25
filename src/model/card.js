/* ============================================================
   一格 · 卡片模型（单元5）
   任务书 §5.4 卡片结构 + §5.5 标题推导（三级兜底）。

   单元5 只走「文本」这一种字段（先把「填了能存住」这条命脉打通），
   其余 9 种字段类型在单元6 往同一根管子上挂。
   ============================================================ */

export const CARD_SCHEMA_VERSION = 1;

/**
 * 组装一张新卡片。
 * values 是松散键值对（模板不是强制 schema，任务书 §5.4 关键设计）。
 * orphans 一开始就是空对象——换模板时字段对不上的值会移进来，绝不静默丢弃。
 *
 * @param {object} input { id, boxId, templateId, values, manualOrder }
 */
export function makeCard({ id, boxId, templateId, values = {}, manualOrder = 1 }) {
  const now = new Date().toISOString();
  return {
    id,
    boxId,
    templateId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    manualOrder,
    values: { ...values },
    orphans: {},
    schemaVersion: CARD_SCHEMA_VERSION,
  };
}

/** 值是否算「有内容」（空串、空数组、null 都算没有） */
function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true; // 数字 0、勾选 false 都算「有值」，不能当空
}

/**
 * 去掉 Markdown 标记：取首行，去掉 # * ` > 等行首标记与行内标记。
 * （单元6a 起 field.js 显示多行文本摘要时也复用这个函数。）
 */
export function plainText(text) {
  const firstLine = String(text).split(/\r?\n/)[0] || "";
  return firstLine
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s{0,3}>\s?/, "")
    .replace(/^\s{0,3}[-*+]\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim();
}

/** 长文本取「首行前 30 字」当标题 */
function longTextTitle(text) {
  const line = plainText(text);
  const chars = [...line];
  return chars.length > 30 ? chars.slice(0, 30).join("") + "…" : line;
}

/**
 * 卡片标题推导（任务书 §5.5 三级兜底）：
 *   1 模板配了 titleField 且该字段非空 → 用它
 *   2 否则按 fields 顺序取第一个非空文本字段（长文本取首行前 30 字，去 Markdown）
 *   3 全空 → 「未命名」
 *
 * @param {object} card     卡片
 * @param {object} template 该卡片所属模板（可缺，缺了直接走第 2/3 级兜底）
 */
export function cardTitle(card, template) {
  const values = (card && card.values) || {};
  const fields = (template && template.fields) || [];

  // 一级：模板指定的标题字段
  const key = template && template.titleField;
  if (key && hasValue(values[key])) {
    const field = fields.find((f) => f.key === key);
    return field && field.type === "longtext"
      ? longTextTitle(values[key])
      : String(values[key]).trim();
  }

  // 二级：字段顺序里第一个非空文本字段
  for (const f of fields) {
    if (f.type !== "text" && f.type !== "longtext") continue;
    if (!hasValue(values[f.key])) continue;
    return f.type === "longtext" ? longTextTitle(values[f.key]) : String(values[f.key]).trim();
  }

  /* 三级：全空 → 「未命名」（任务书 §5.5）。
     例外：模板里**一个文本字段都没有**时（比如一张只有计时 / 清单字段的卡），
     卡片本来就没有文字标题可写，全叫「未命名」在盒子列表里根本认不出谁是谁，
     改用模板名（如「计时」）。有文本字段的模板口径不变。
     （9d 曾按 layout.skin === "tool" 判断；2026-09-24 工具卡整块删掉后改看
       「有没有文本字段」—— 对这类卡效果一样，还不依赖那个已删的设置。） */
  const hasTextField = fields.some((f) => f.type === "text" || f.type === "longtext");
  if (!hasTextField && template && template.name) return String(template.name);
  return "未命名";
}
