/* ============================================================
   一格 · 数据访问层
   业务化的增删改查。
   - 单元2：首次播种 + 列表读取
   - 单元4：新建盒子 + 已用色查询
   - 单元5：卡片列表 + 新建卡片
   - 单元6a：读一张卡 + 改一张卡
   - 单元8：删一张卡（软删除）+ 撤销删除
   - 单元9a：存模板 + 数「有几个盒子在用这个模板」
   （盒子的删除要配合回收站，等后续阶段；图片本体不进卡片 JSON，走 media/image.js。）
   ============================================================ */

import { db } from "./db.js";
import { colorByKey } from "../model/colors.js";
import { makeCard } from "../model/card.js";
import { PRESET_TEMPLATES, presetBoxes } from "../model/presets.js";
import { cavityColor } from "../util/color.js";
import { newBoxId, newCardId } from "../util/id.js";

const SEEDED_KEY = "seeded.v1";

/**
 * 首次打开播种：没有任何模板时，写入 3 个预设模板 + 3 个预设盒子。
 * 用 settings 标记防止重复播种。
 */
export async function seedIfEmpty() {
  const seeded = await db.getSetting(SEEDED_KEY);
  if (seeded) return;
  const tplCount = await db.count("templates");
  if (tplCount === 0) {
    await db.putMany("templates", PRESET_TEMPLATES);
    await db.putMany("boxes", presetBoxes());
  }
  await db.setSetting(SEEDED_KEY, true);
}

/** 全部模板（不含已删除） */
export function listTemplates() {
  return db.getAll("templates").then((list) => list.filter((t) => !t.deletedAt));
}

/** 全部盒子（不含已删除，收藏在前，其余按创建时间） */
export function listBoxes() {
  return db.getAll("boxes").then((list) => list.filter((b) => !b.deletedAt).sort(compareBoxForList));
}

/**
 * 主界面排序：收藏在前 → 创建时间早的在前。
 * 时间相同（同一毫秒播种）时必须还有第三级依据（id），
 * 否则比较函数在相等时返回 1，排序结果不确定。
 */
function compareBoxForList(a, b) {
  if (Boolean(b.favorite) !== Boolean(a.favorite)) return b.favorite ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 按模板 id 找盒子 */
export function getTemplate(id) {
  return db.get("templates", id);
}

/* ---------- 单元9a：改模板 ---------- */

/**
 * 存一份模板（整份覆盖 + 刷新 updatedAt）。
 * 只动 templates 仓 —— 任务书 §5.4：模板只是「视图 + 表单层」，
 * 加字段 / 删字段 / 改类型都不碰任何卡片数据。
 * @param {object} tpl 规整好的模板
 */
export async function saveTemplate(tpl) {
  const next = { ...tpl, updatedAt: new Date().toISOString() };
  await db.put("templates", next);
  return next;
}

/**
 * 有几个盒子在用这个模板（不含已软删除的盒子）。
 * 模板编辑器用它提示「改动会一起生效」。
 */
export async function countBoxesByTemplate(templateId) {
  const boxes = await db.getAll("boxes");
  return boxes.filter((b) => !b.deletedAt && b.templateId === templateId).length;
}

/* ---------- 单元4：新建盒子 ---------- */

/** 已被占用的颜色 key（不含已软删除的盒子）——新建盒子自动配色用 */
export async function usedColorKeys() {
  const boxes = await db.getAll("boxes");
  return boxes.filter((b) => !b.deletedAt).map((b) => b.colorKey).filter(Boolean);
}

/**
 * 新建盒子。字段按任务书 §5.3 填齐（含 encrypted，防止将来加加密要迁移数据）。
 * 颜色只存色板里的基础色 hex；shadowColor 由公式算（基础色 × 0.84），不手抄。
 * @param {object} input { name, templateId, colorKey, skin?, density? }
 * @returns 新建好的盒子对象
 */
export async function createBox({ name, templateId, colorKey, skin = "paper", density = "loose" }) {
  const picked = colorByKey(colorKey);
  const now = new Date().toISOString();

  const box = {
    id: newBoxId(),
    name,
    templateId,
    colorKey: picked.key,
    color: picked.hex,
    shadowColor: cavityColor(picked.hex),
    tags: [],
    favorite: false,
    encrypted: false, // 任务书：该字段从第一版必须存在
    enc: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    lastOpenedAt: null,
    // 分组配置：新盒子先不分组（H3 才用得上）
    group: { field: null, granularity: null, sort: [], hideEmpty: false, expand: "first" },
    groupPresets: [],
    view: "stream",
    density,
    skin,
    manualOrder: false,
  };

  await db.put("boxes", box);
  return box;
}

/**
 * 每个盒子各有多少张卡（不含已软删除的）
 * 返回 { boxId: count }
 */
export async function countCardsByBox() {
  const cards = await db.getAll("cards");
  const counts = {};
  for (const c of cards) {
    if (c.deletedAt) continue;
    counts[c.boxId] = (counts[c.boxId] || 0) + 1;
  }
  return counts;
}

/* ---------- 单元5：卡片 ---------- */

/**
 * 某盒子下的卡片（不含软删除），按创建时间正序 —— 新卡排在列表末尾，
 * 正好落在用户点「＋」的位置下方，建完立刻能看见。
 * （按字段排序、分组是 H3 的事，本单元不做。）
 */
export function listCards(boxId) {
  return db.getAll("cards").then((list) =>
    list
      .filter((c) => !c.deletedAt && c.boxId === boxId)
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
  );
}

/**
 * 新建卡片。
 * manualOrder 取该盒当前最大值 + 1（任务书 §5.4：新卡片追加在末尾）。
 * @param {object} input { boxId, templateId, values }
 */
export async function createCard({ boxId, templateId, values = {} }) {
  const siblings = await listCards(boxId);
  const maxOrder = siblings.reduce((max, c) => Math.max(max, Number(c.manualOrder) || 0), 0);

  const card = makeCard({
    id: newCardId(),
    boxId,
    templateId,
    values,
    manualOrder: maxOrder + 1,
  });
  await db.put("cards", card);
  return card;
}

/* ---------- 单元6a：读一张卡 / 改一张卡 ---------- */

/** 按 id 取一张卡（找不到返回 undefined） */
export function getCard(id) {
  return db.get("cards", id);
}

/**
 * 改一张卡片的字段值。
 * 整份 values 覆盖写入（卡片详情页每次保存都是完整的一份），
 * orphans（换模板时对不上的旧值）原样保留，绝不顺手清掉。
 * @param {string} id
 * @param {object} values 规整好的完整 values
 */
export async function updateCard(id, values) {
  const card = await db.get("cards", id);
  if (!card) return null;

  const next = {
    ...card,
    values: { ...values },
    updatedAt: new Date().toISOString(),
  };
  await db.put("cards", next);
  return next;
}

/* ---------- 单元8：删一张卡 / 撤销删除 ---------- */

/**
 * 删除一张卡。
 * 任务书 §6.7 定的是**软删除**：只写一个「什么时候删的」（deletedAt），
 * 卡片本体一条不动 —— 所以：
 *   · 列表查询（listCards / countCardsByBox）本来就会跳过它，删完立刻看不见
 *   · 「撤销」只要把这个时间清掉即可，不需要重新建卡，位置、时间、内容全都原样
 * 带的图片（assets）故意不删：撤销时图还得在，回收到 30 天后统一清理
 * （任务书 §6.7 的回收站 + 自动清理，H1 没有回收站页面）。
 * @param {string} id
 */
export async function deleteCard(id) {
  const card = await db.get("cards", id);
  if (!card) return null;

  const now = new Date().toISOString();
  const next = { ...card, deletedAt: now, updatedAt: now };
  await db.put("cards", next);
  return next;
}

/**
 * 撤销删除：把 deletedAt 清回去。
 * updatedAt 照样刷新 —— 它标记「这条记录有过改动」，H5 同步云端时靠它找要推的数据。
 * @param {string} id
 */
export async function restoreCard(id) {
  const card = await db.get("cards", id);
  if (!card) return null;

  const next = { ...card, deletedAt: null, updatedAt: new Date().toISOString() };
  await db.put("cards", next);
  return next;
}
