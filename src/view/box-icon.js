/* ============================================================
   一格 · 盒子图标生成器（单元3；单元10 接深色模式）
   ★严格按任务书 §9.3 实现，改动前先回看原文。

   画布 120 × 108（宽÷高 = 1.11），圆角 10，无描边。
   viewBox="-10 -18 140 138"：左右各留 10 给落影横向扩散，
   上方留 18 给卡片探头，下方留 12 给落影。

   四层叠加，顺序不可换：
     1 盒身底色       rect 0 0 120 108 rx10（浅色＝基础色本身，不提亮）
     2 后沿内腔       覆盖 y 0→20（内腔影色 = 盒身色 × 0.84）
     3 卡片           故意画长到 y −13，只上两角圆角 8
     4 前沿面板       从 y 20 盖回来 → 读出「卡片插在盒里」

   三种色不由这里直接算 —— 统一交给 util/color.js 的 bodyPalette()，
   因为它还要负责 §9.6 的深色模式（深色下盒身色换成降饱和版本）。
   ============================================================ */

import { bodyPalette } from "../util/color.js";
import { escapeHtml } from "../util/dom.js";
import { prefersDark } from "./theme.js";

/* 三条 path 原样取自任务书。层3 的 -5 = 卡片顶端(−13) + 圆角(8)，
   写成 5 会让弧的弦长超过直径（19.7 > 2×8），圆角会变形。 */
const PATH_CAVITY = "M0 10 A10 10 0 0 1 10 0 H110 A10 10 0 0 1 120 10 V20 H0 Z";
const PATH_CARD = "M21 -5 A8 8 0 0 1 29 -13 H91 A8 8 0 0 1 99 -5 V30 H21 Z";
const PATH_FRONT = "M0 20 H120 V98 A10 10 0 0 1 110 108 H10 A10 10 0 0 1 0 98 Z";

/* 名称区 = 前沿面板 y 20→108，文字中心 y = 64 */
const NAME_CENTER_Y = 64;
/* 盒内文字可用宽度（120 单位宽 − 左右各 5 单位留白）。
   实测汉字实际宽度比「1 个字 = 1 倍字号」的估算略宽约 2.4%，
   留 5 单位（iPhone 上约 4px/边）才能保证「一行 5 个字」不贴边、不溢出。 */
const TEXT_MAX_WIDTH = 110;

/* 参考渲染宽度：iPhone 一行 3 个盒子时每格约 115px（393px 视口实测）。
   字号一律按盒子**实际渲染宽度**换算成 SVG 单位，所以 iPhone 与
   Windows 各自适配，而不是写死 px。 */
export const REF_CELL_WIDTH = 115;
const VIEWBOX_WIDTH = 140; // viewBox="-10 -18 140 138" 的宽度

/** 期望视觉字号(px) → 当前渲染宽度下的 SVG 字号(单位) */
function toUserUnits(px, cellWidth) {
  return (px * VIEWBOX_WIDTH) / cellWidth;
}

/** 单个字符占的宽度（以字号为单位）：中日韩字宽 ≈ 1.0，其他 ≈ 0.55 */
function charWidth(ch) {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1.0 : 0.55;
}

function measureText(text, size) {
  let w = 0;
  for (const ch of text) w += charWidth(ch) * size;
  return w;
}

/** 只有**原样确实放不下**时才用省略号；先看原样，再试「少一个字换放得下」 */
function ellipsize(text, size, maxWidth) {
  if (measureText(text, size) <= maxWidth) return text; // ← 原样放得下就绝不删字
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    if (measureText(chars.join("") + "…", size) <= maxWidth) return chars.join("") + "…";
  }
  return "…";
}

/* ============================================================
   名称排版规则（唯一真相，改这里就够）
     · 字号只有两种：19px（短名）/ 17px（长名），不缩不放
     · 1–4 字  → 19px；这一行放不下才退到 17px
     · 5 字以上 → 17px；一行放得下就一行，放不下就平均折两行
     · 最多完整显示 10 个字；超过则只留 10 个字位，最后一位是省略号
   ============================================================ */
const FONT_SHORT = 19; // 短名（≤4 字）字号（视觉 px）
const FONT_LONG = 17; // 长名（≥5 字）字号（视觉 px）
const SHORT_MAX_CHARS = 4;
const VISIBLE_MAX_CHARS = 10;

/** 两行时按字数平均分（5 字 → 3+2，6 字 → 3+3，7 字 → 4+3），两行都不至于过长 */
function splitTwoLines(chars) {
  const half = Math.ceil(chars.length / 2);
  return [chars.slice(0, half).join(""), chars.slice(half).join("")];
}

/**
 * 名称排版：返回 { lines, fontSize }
 * fontSize 是 SVG 用户单位；换算成视觉 px 为 fontSize × cellWidth / 140。
 */
function layoutName(name, cellWidth) {
  const chars = [...name];
  // 超过 10 字：只留 10 个字位，末位换成省略号（省略号占位，不额外多挤掉一个字）
  const glyphs =
    chars.length > VISIBLE_MAX_CHARS
      ? [...chars.slice(0, VISIBLE_MAX_CHARS - 1), "…"]
      : chars;

  if (chars.length <= SHORT_MAX_CHARS) {
    const size = toUserUnits(FONT_SHORT, cellWidth);
    if (measureText(name, size) <= TEXT_MAX_WIDTH) return { lines: [name], fontSize: size };
    // 极窄屏兜底：19px 一行实在塞不下 → 改走 17px（字号仍只有这两种）
  }

  const size = toUserUnits(FONT_LONG, cellWidth);
  const joined = glyphs.join("");
  if (measureText(joined, size) <= TEXT_MAX_WIDTH) return { lines: [joined], fontSize: size };

  // 一行放不下 → 平均折两行；万一某行仍超出（极窄屏）才兜底省略
  return {
    lines: splitTwoLines(glyphs).map((l) => ellipsize(l, size, TEXT_MAX_WIDTH)),
    fontSize: size,
  };
}

// 每个图标的 <filter> 需要唯一 id（颜色不同），生成时递增
let filterSeq = 0;

/**
 * 生成一个盒子图标的 SVG 字符串。
 * @param {object} box   盒子（需要 name / color / cardCount）
 * @param {object} opts  { cellWidth: 该格子实际渲染宽度(px), cardCount }
 */
export function boxIconSvg(box, opts = {}) {
  const cellWidth = opts.cellWidth || REF_CELL_WIDTH;
  const cardCount = opts.cardCount ?? box.cardCount ?? 0;

  const body = box.color;                     // 基础色（存库的那个）
  /* 浅色下 body = 基础色本身、cavity = 基础色 × 0.84、card = +白 72%；
     深色下起点换成降饱和的盒身色（§9.6），派生关系一模一样。
     内腔影一律重算，不用库里存的 shadowColor —— 它只是同一条公式的结果，
     而深色模式下起点不同，存下来的那份就不对了。 */
  const palette = bodyPalette(body, prefersDark());
  const cavity = palette.cavity;              // 内腔影色
  const card = palette.card;                  // 卡片色
  const surface = palette.body;               // 这一模式下真正的盒身色
  const textColor = palette.text;             // 按相对亮度自动判定深/浅字
  const filterId = `yige-box-shadow-${++filterSeq}`;

  const name = layoutName(box.name || "", cellWidth);
  const countSize = toUserUnits(13, cellWidth);

  /* 名称（+ 数量）在名称区内垂直居中 */
  let textSvg = "";
  if (name.lines.length === 1) {
    // 一行：名称下方显示卡片数量（13px，opacity 0.5）
    const lineH = name.fontSize * 1.2;
    const gap = toUserUnits(4, cellWidth);
    const blockH = lineH + gap + countSize * 1.2;
    const top = NAME_CENTER_Y - blockH / 2;
    const nameY = top + name.fontSize * 0.82;
    const countY = top + lineH + gap + countSize * 0.82;
    textSvg = `
    <text x="60" y="${nameY.toFixed(1)}" text-anchor="middle" fill="${textColor}"
          font-size="${name.fontSize.toFixed(1)}" font-weight="500">${escapeHtml(name.lines[0])}</text>
    <text x="60" y="${countY.toFixed(1)}" text-anchor="middle" fill="${textColor}"
          font-size="${countSize.toFixed(1)}" opacity="0.5">${escapeHtml(cardCount)}</text>`;
  } else {
    // 两行：空间不足，不显示数量
    const lineH = name.fontSize * 1.15;
    const top = NAME_CENTER_Y - (lineH * 2) / 2;
    const y1 = top + name.fontSize * 0.82;
    const y2 = top + lineH + name.fontSize * 0.82;
    textSvg = `
    <text x="60" y="${y1.toFixed(1)}" text-anchor="middle" fill="${textColor}"
          font-size="${name.fontSize.toFixed(1)}" font-weight="500">${escapeHtml(name.lines[0])}</text>
    <text x="60" y="${y2.toFixed(1)}" text-anchor="middle" fill="${textColor}"
          font-size="${name.fontSize.toFixed(1)}" font-weight="500">${escapeHtml(name.lines[1])}</text>`;
  }

  return `<svg class="box-icon" viewBox="-10 -18 140 138" role="img"
      aria-label="${escapeHtml(box.name || "盒子")}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- 盒身落影：颜色锚定内腔影色，dy 3 / stdDeviation 4 / 0.32 -->
      <filter id="${filterId}" x="-25%" y="-25%" width="150%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="${cavity}" flood-opacity="0.32"/>
      </filter>
    </defs>
    <!-- 1 盒身 -->
    <rect x="0" y="0" width="120" height="108" rx="10" fill="${surface}" filter="url(#${filterId})"/>
    <!-- 2 后沿内腔 -->
    <path d="${PATH_CAVITY}" fill="${cavity}"/>
    <!-- 3 卡片（故意画长，纯色无渐变） -->
    <path d="${PATH_CARD}" fill="${card}"/>
    <!-- 4 前沿面板盖回来 → 插入感由遮挡产生 -->
    <path d="${PATH_FRONT}" fill="${surface}"/>
    ${textSvg}
  </svg>`;
}
