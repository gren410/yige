/* ============================================================
   一格 · 色彩计算（单元2；单元10 加深色模式）
   任务书 §9.2：三层色全部由基础色派生，公式计算、绝不手抄。
   - 盒身色 = 基础色本身（ratio = 0，不提亮）
   - 内腔影色 = 基础色 × 0.84（锚定基础色，不锚定盒身色）
   - 卡片色 = 盒身色 + 白 × 72%
   每通道独立计算，结果取整并夹到 0–255。

   任务书 §9.6：深色下盒身色改用「降饱和版本」——
   在当前盒身色上叠 8% 黑、去 15% 饱和，避免亮色块在暗底上刺眼。
   三种色的**派生关系两种模式完全一致**，只是深色下换了个起点
   （起点从「基础色」变成「降饱和后的盒身色」），这样层次感不会变。
   ============================================================ */

/** "#RRGGBB" → [r, g, b] */
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** [r, g, b] → "#RRGGBB"（整体大写，三层色格式统一，将来同步比对才不会误判不同） */
export function rgbToHex([r, g, b]) {
  const to2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return ("#" + to2(r) + to2(g) + to2(b)).toUpperCase();
}

/** 提亮：c' = c + (255 − c) × ratio */
export function tint(hex, ratio) {
  return rgbToHex(hexToRgb(hex).map((c) => c + (255 - c) * ratio));
}

/** 加深：c' = c × factor */
export function shade(hex, factor) {
  return rgbToHex(hexToRgb(hex).map((c) => c * factor));
}

/** 内腔影色：基础色 × 0.84 */
export function cavityColor(baseHex) {
  return shade(baseHex, 0.84);
}

/** 卡片色：盒身色 + 白 72% */
export function cardColor(bodyHex) {
  return tint(bodyHex, 0.72);
}

/** WCAG 相对亮度（0–1） */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度（1–21）：两色之间，谁亮谁暗不影响结果 */
export function contrast(aHex, bHex) {
  const la = luminance(aHex);
  const lb = luminance(bHex);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_DARK = "#1C1C1E";
const TEXT_LIGHT = "#FFFFFF";

/**
 * 盒身上的文字用深色还是浅色 —— **挑对比度更高的那个**。
 *
 * 任务书 §9.2 只说「按盒身相对亮度自动判定」，没说阈值。
 * 早先用的是「亮度 > 0.4 就用近黑字」这条经验阈值，实测下来它对一批
 * 中等偏亮的颜色判歪了：天蓝/粉/靛/红/紫/灰蓝这几个盒身会拿到**白字**，
 * 对比度只有 2.4~3.5，远低于 WCAG AA 要求的 4.5 —— 字糊在底色上。
 * （用户 2026-09-25 拍板：「第一件按你的来」。）
 *
 * 改成直接比较两个候选色的对比度、取大的那个：任何底色都不会选错，
 * 也不用再猜阈值。§9.2 那两条候选色（近黑 #1C1C1E / 白 #FFFFFF）原样保留。
 */
export function readableTextOn(bgHex) {
  return contrast(bgHex, TEXT_DARK) >= contrast(bgHex, TEXT_LIGHT)
    ? TEXT_DARK
    : TEXT_LIGHT;
}

/* ---------- 深色模式（单元10，任务书 §9.6） ---------- */

/** [r,g,b] → [h(0–360), s(0–1), l(0–1)] */
function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l]; // 灰色：色相无意义，饱和度为 0
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** [h,s,l] → [r,g,b]（0–255 浮点，交给 rgbToHex 取整） */
function hslToRgb([h, s, l]) {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (hh < 60) rgb = [c, x, 0];
  else if (hh < 120) rgb = [x, c, 0];
  else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c];
  else if (hh < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => (v + m) * 255);
}

/** 去饱和：HSL 空间里把饱和度乘 (1 − amount)。色相与明度不动。 */
export function desaturate(hex, amount = 0.15) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, s * (1 - amount), l]));
}

/** 叠黑：每通道 × (1 − amount) */
export function mixBlack(hex, amount = 0.08) {
  return rgbToHex(hexToRgb(hex).map((c) => c * (1 - amount)));
}

/** 深色模式的盒身色 = 基础色去 15% 饱和、再叠 8% 黑（§9.6 指定的两个数） */
export function darkBodyColor(baseHex) {
  return mixBlack(desaturate(baseHex, 0.15), 0.08);
}

/* 深色下卡片改用「盒身色 + 白 32%」而不是 +72%：
   72% 在暗底上是一块发亮的大白片，刺眼程度和 §9.6 想避免的亮色块一样。
   32% 仍然明显比盒身亮、插一张卡在里面的观感保住了，但不再晃眼。 */
const DARK_CARD_WHITE = 0.32;

/**
 * 一次性拿到画一个盒子需要的四种色。
 * @param {string} baseHex 盒子的基础色（存库的那个）
 * @param {boolean} dark   当前是不是深色模式
 * @returns {{body:string, cavity:string, card:string, text:string}}
 */
export function bodyPalette(baseHex, dark = false) {
  const body = dark ? darkBodyColor(baseHex) : baseHex;
  return {
    body,
    cavity: cavityColor(body),
    card: dark ? tint(body, DARK_CARD_WHITE) : cardColor(body),
    text: readableTextOn(body),
  };
}
