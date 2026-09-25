/* ============================================================
   一格 · 12 色板（单元4）
   任务书 §9.2：
   - 配色由 12 色板驱动，颜色存十六进制字符串（不存枚举名）
   - 新建盒子时自动分配一个「当前未被使用」的色
   - 每个盒子独立选色、随时可改；不做自由取色
   - 这里只写「基础色」（＝盒身色，ratio = 0 不提亮）。
     内腔影色 / 卡片色一律由 util/color.js 的公式算，绝不手抄。

   色板顺序＝任务书附录 A 默认盒子的分配顺序（天蓝 → 绿 → 橙 → …）。
   注：3 个预设盒子的色值写在 model/presets.js（单元2 已验收），
   与本表前三个一致（天蓝 / 绿 / 橙）。
   ============================================================ */

export const BOX_COLORS = [
  { key: "sky", name: "天蓝", hex: "#4DA3FF" },
  { key: "green", name: "绿", hex: "#3ED598" },
  { key: "orange", name: "橙", hex: "#FFA34A" },
  { key: "pink", name: "粉", hex: "#FF6F9C" },
  { key: "yellow", name: "黄", hex: "#FFD24A" },
  { key: "indigo", name: "靛", hex: "#7C8CFF" },
  { key: "red", name: "红", hex: "#FF6058" },
  { key: "purple", name: "紫", hex: "#A98BFF" },
  { key: "peach", name: "桃", hex: "#FF8F6B" },
  { key: "cyan", name: "青", hex: "#45CCE8" },
  { key: "mint", name: "薄荷", hex: "#2ED3B2" },
  { key: "slate", name: "灰蓝", hex: "#94A3B8" },
];

/** 按 key 取色板项（找不到时回落到第一个，保证永不返回空） */
export function colorByKey(key) {
  return BOX_COLORS.find((c) => c.key === key) || BOX_COLORS[0];
}

/**
 * 自动分配一个还没被用过的色。
 * @param {string[]} usedKeys 已被占用的 colorKey 列表
 * 12 色用完时按「已有盒子数 ÷ 12 取余」循环复用，不会出现无颜色可用。
 */
export function pickUnusedColor(usedKeys = []) {
  const used = new Set(usedKeys);
  const free = BOX_COLORS.find((c) => !used.has(c.key));
  if (free) return free;
  return BOX_COLORS[usedKeys.length % BOX_COLORS.length];
}
