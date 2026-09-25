/* ============================================================
   一格 · 短 id 生成（单元2）
   任务书 §4.1：短 id，避免过长路径。
   格式：前缀 + 6 位十六进制（约 1600 万组合，个人自用足够；
   同毫秒碰撞概率极低，同步层还有 id 去重兜底）。
   ============================================================ */

const HEX = "0123456789abcdef";

function randomHex(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += HEX[bytes[i] & 0xf];
  return out;
}

/** 盒子 id：bx_xxxxxx */
export function newBoxId() {
  return "bx_" + randomHex(6);
}

/** 模板 id：tpl_xxxxxx */
export function newTemplateId() {
  return "tpl_" + randomHex(6);
}

/** 卡片 id：c_xxxxxx */
export function newCardId() {
  return "c_" + randomHex(6);
}

/** 图片 id：img_xxxxxxxx（单元6b；图片数量可能上百，用 8 位更稳） */
export function newImageId() {
  return "img_" + randomHex(8);
}
