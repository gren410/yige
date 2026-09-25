/* ============================================================
   一格 · 图片存取（单元6b）
   任务书 §11 把「压缩 / WebP / 按内容编号去重 / 云端路径」整体放在 H5。
   这里只做 H1 需要的最小一套：把用户选的图原样收进来、能显示出来、能去掉。

   卡片里存的是「本地图片编号」，形如  local:img_1a2b3c4d
   图片本体存在 IndexedDB 的 assets 仓里，不进卡片 JSON ——
   否则卡片会变成一大坨乱码，违反任务书 §1「明文优先、可直接读」。
   （H5 上云时把 local:xxx 换成 assets/img/<h2>/<sha>.webp 即可。）
   ============================================================ */

import { db } from "../storage/db.js";
import { newImageId } from "../util/id.js";

const PREFIX = "local:";

/** 一个字段最多放几张图（任务书 §11：内联图片单卡上限 5 张） */
export const MAX_IMAGES = 5;

/* ---------- 编号 ↔ 卡片里存的值 ---------- */

/** 编号 → 卡片里存的值 */
export function imageValue(assetId) {
  return PREFIX + assetId;
}

/** 这个值是不是本地图片（H5 之后还会有云端路径，那时另走一路） */
export function isLocalImageValue(value) {
  return typeof value === "string" && value.indexOf(PREFIX) === 0;
}

/** 卡片里的值 → 编号（不是本地图片就返回空串） */
export function localImageId(value) {
  return isLocalImageValue(value) ? value.slice(PREFIX.length) : "";
}

/** 把字段值统一成数组，单张字段也当数组处理，控件里少写一堆分支 */
export function imageList(field, value) {
  if (field && field.multiple) return Array.isArray(value) ? value : [];
  return value ? [value] : [];
}

/* ---------- 存 ---------- */

/**
 * 收下用户选的一张图。
 * H1 原样存、不压缩 —— 压缩是 H5 的活，届时会连 EXIF 方向一起处理
 * （任务书 §11：canvas 压缩不读 EXIF，iPhone 竖拍会躺倒）。
 * @param {File|Blob} file
 * @returns {Promise<string>} 图片编号
 */
export async function saveImageFile(file) {
  const id = newImageId();
  const blob = file instanceof Blob ? file : new Blob([file]);
  await db.put("assets", {
    id,
    blob,
    name: file && file.name ? String(file.name) : "",
    type: blob.type || "",
    size: blob.size || 0,
    createdAt: new Date().toISOString(),
  });
  return id;
}

/* ---------- 取（给 <img> 用） ---------- */

/* 同一张图只生成一个临时地址：在详情页进进出出也不会越积越多 */
const urlCache = new Map();

/** 编号 → 能直接塞给 <img> 的临时地址（取不到返回空串） */
export async function imageUrl(assetId) {
  if (!assetId) return "";
  if (urlCache.has(assetId)) return urlCache.get(assetId);
  const rec = await db.get("assets", assetId);
  if (!rec || !rec.blob) return "";
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(assetId, url);
  return url;
}

/**
 * 把临时地址填进一个 <img>。
 * 取不到（图片记录被清了）就把格子标成 is-missing，界面上显示占位而不是破图。
 */
export async function fillImage(imgEl, assetId) {
  const url = await imageUrl(assetId);
  if (!url) {
    imgEl.removeAttribute("src");
    if (imgEl.parentElement) imgEl.parentElement.classList.add("is-missing");
    return false;
  }
  imgEl.src = url;
  return true;
}

/** 离开卡片详情页时调用：把临时地址还回去，别一直占着内存 */
export function releaseImageUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
