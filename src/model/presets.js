/* ============================================================
   一格 · 预设数据（单元2）
   任务书附录 A：三个预设模板（日记 / 任务清单 / 观影记录），
   JSON 与任务书一致；默认盒子颜色按「天蓝 / 绿 / 橙」分配。
   ============================================================ */

import { cavityColor } from "../util/color.js";

/** 三个预设模板（附录 A 原文） */
export const PRESET_TEMPLATES = [
  {
    id: "tpl_diary",
    name: "日记",
    schemaVersion: 1,
    titleField: "title",
    fields: [
      { key: "title", label: "标题", type: "text" },
      { key: "date", label: "日期", type: "date", withTime: false, default: "today" },
      { key: "mood", label: "心情", type: "select", options: ["很好", "不错", "一般", "低落", "烦躁"] },
      { key: "weather", label: "天气", type: "select", options: ["晴", "多云", "阴", "雨", "雪", "风"] },
      { key: "tags", label: "标签", type: "multi", options: null },
      { key: "body", label: "正文", type: "longtext", maxImages: 5 },
    ],
    layout: { coverField: null, listFields: ["date", "mood", "weather"], skin: "paper", density: "loose" },
  },
  {
    id: "tpl_todo",
    name: "任务清单",
    schemaVersion: 1,
    titleField: "title",
    fields: [
      { key: "title", label: "任务", type: "text" },
      { key: "done", label: "完成", type: "check", default: false },
      { key: "due", label: "截止", type: "date", withTime: false },
      { key: "priority", label: "优先级", type: "select", options: ["高", "中", "低"], default: "中" },
      { key: "list", label: "清单", type: "multi", options: ["工作", "生活", "学习", "杂事"] },
      { key: "note", label: "备注", type: "longtext", maxImages: 5 },
    ],
    layout: { coverField: null, listFields: ["done", "due", "priority"], skin: "paper", density: "compact" },
  },
  {
    id: "tpl_movie",
    name: "观影记录",
    schemaVersion: 1,
    titleField: "title",
    fields: [
      { key: "title", label: "片名", type: "text" },
      { key: "date", label: "观看日期", type: "date", withTime: false, default: "today" },
      { key: "rating", label: "评分", type: "rating", max: 5, default: 3 },
      { key: "status", label: "状态", type: "select", options: ["想看", "在看", "已看"], default: "已看" },
      { key: "tags", label: "标签", type: "multi", options: null },
      { key: "review", label: "短评", type: "longtext", maxImages: 5 },
      { key: "poster", label: "海报", type: "image", multiple: false },
    ],
    layout: { coverField: "poster", listFields: ["date", "rating", "status"], skin: "paper", density: "loose" },
  },
];

/* 默认盒子（附录 A 表格）：颜色 = 天蓝 / 绿 / 橙（12 色板基础色），
   shadowColor 由公式计算（基础色 × 0.84），不手抄。 */

/* createdAt 依次递增 1 秒：三个预设盒子原本是同一毫秒创建的，
   排序没有先后依据（曾导致显示顺序与附录 A 的书写顺序不一致）。
   显式错开之后，「日记 → 任务清单 → 观影记录」的顺序就是确定的。 */
function makeBox(id, name, templateId, colorKey, color, group, createdMs) {
  const now = new Date(createdMs).toISOString();
  return {
    id,
    name,
    templateId,
    colorKey,
    color,
    shadowColor: cavityColor(color),
    tags: [],
    favorite: false,
    encrypted: false, // 任务书：该字段从第一版必须存在
    enc: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    lastOpenedAt: null,
    group,
    groupPresets: [],
    view: "stream",
    density: "loose",
    skin: "paper",
    manualOrder: false,
  };
}

export function presetBoxes() {
  const base = Date.now();
  const rows = [
    ["bx_diary", "日记", "tpl_diary", "sky", "#4DA3FF", {
      field: "date", granularity: "month",
      sort: [{ field: "date", dir: "desc" }], hideEmpty: true, expand: "first",
    }],
    ["bx_todo", "任务清单", "tpl_todo", "green", "#3ED598", {
      field: "done", granularity: null,
      sort: [{ field: "due", dir: "asc" }], hideEmpty: false, expand: "all",
    }],
    ["bx_movie", "观影记录", "tpl_movie", "orange", "#FFA34A", {
      field: "date", granularity: "month",
      sort: [{ field: "date", dir: "desc" }], hideEmpty: true, expand: "first",
    }],
  ];
  // 顺序即数组顺序，时间各错开 1 秒
  return rows.map((r, i) => makeBox(r[0], r[1], r[2], r[3], r[4], r[5], base + i * 1000));
}
