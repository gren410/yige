/* ============================================================
   一格 · 计时（第 11 种字段类型，单元9e）
   用户要的东西：左边写做什么，右边点「开始 / 结束」，点完自动记下当前时间，
   两个都点过就算出用时。示例：1.事例（09:30-10:15，用时 00:45）

   === 值长什么样 ===
   计时字段存的是「一列小对象」，一条记录 = 一件事：
     {
       id:    "t_1a2b",                      // 条内编号（只在这一格里用）
       text:  "读文档",                       // 用户写的内容
       start: "2026-09-24T01:30:00.000Z",    // 点「开始」的时刻（完整时间戳）
       end:   null                            // 点「结束」的时刻；null = 还在计时中
     }

   为什么存完整时间戳而不是 "09:30"：
     · 用时靠两个时刻相减算，跨天（23:50 → 00:10）自然就是对的，不用特判；
     · 用户要求「跨天不显示日期」，那是**显示**的事（formatEntryTime 只取时分），
       跟存什么无关。存的越全，将来算统计越有余地。
   为什么 end 用 null 而不是空串：空串和「没点过」分不开，null 才是明确的「还没结束」。

   这一层的函数全是纯计算，不碰 DOM、不碰库 —— 所以能直接用 node 跑断言。
   ============================================================ */

import { pad2 } from "../util/format.js";

/** 一条计时记录里最长能写多少字（和单行文本字段一个量级即可） */
export const TIMER_TEXT_MAX = 60;

/**
 * 造一个条内不重复的编号。
 * 只是这一格内部用来认人的（删/改某一条时用），不进任何数据结构的约定，短就够了。
 */
function newEntryId(existing) {
  const used = new Set((existing || []).map((e) => e && e.id));
  for (let i = 0; i < 50; i++) {
    const id = "t_" + Math.random().toString(16).slice(2, 6).padEnd(4, "0");
    if (!used.has(id)) return id;
  }
  return "t_" + Date.now().toString(16).slice(-4);
}

/** 空白的一条：界面在「什么都还没记」时先摆这么一条出来（只摆在界面上，不落库） */
export function blankEntry(existing = []) {
  return { id: newEntryId(existing), text: "", start: null, end: null };
}

/* ---------- 规整 ---------- */

/** 能当时刻用的字符串 → 标准 ISO；认不出来的返回 null */
function isoOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v !== "string") return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * 一条记录的规整。
 * 完全空的（没写字、也没点过开始）返回 null —— 由调用方丢掉，
 * 这样「界面上摆了条空行但用户没动」不会往库里写垃圾。
 */
export function normalizeEntry(raw, existing = []) {
  if (!raw || typeof raw !== "object") return null;

  const text = String(raw.text == null ? "" : raw.text).trim();
  const start = isoOrNull(raw.start);
  /* 没开始就谈不上结束：先点「结束」是不可能的，出现了说明数据坏过，直接丢掉 */
  const end = start ? isoOrNull(raw.end) : null;

  if (!text && !start) return null;

  /* 编号在这一格里必须唯一（删除、改某一条都靠它认人）。
     数据里撞号了（手改过、或者从别处拷来的）就换一个新的，别让两条共用一个号。 */
  const used = new Set(existing.map((e) => e && e.id).filter(Boolean));
  const given = String(raw.id || "").trim();

  return {
    id: given && !used.has(given) ? given : newEntryId(existing),
    text,
    start,
    end,
  };
}

/** 整列记录的规整（去空、去重编号、顺手补上缺的 id） */
export function normalizeEntries(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    const entry = normalizeEntry(item, out);
    if (entry) out.push(entry);
  }
  return out;
}

/* ---------- 判定 ---------- */

/** 正在计时：点了开始、还没点结束 */
export function isRunning(entry) {
  return !!(entry && entry.start && !entry.end);
}

/** 一条记录算得出来的用时（毫秒）；没结束或时间坏掉返回 null */
export function durationMs(entry) {
  if (!entry || !entry.start || !entry.end) return null;
  const a = new Date(entry.start).getTime();
  const b = new Date(entry.end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, b - a); // 时钟往回跳过的机器上也不出现负数
}

/* ---------- 显示 ---------- */

/** 时刻 → "09:30"（按本地时区取，任务书 §10 的「不差一天」口径同款） */
export function formatClock(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 用时 → "00:45"。
 * 用户口径：精确到小时分钟，**跨天不显示日期** —— 所以超过 24 小时就在小时位上继续涨
 * （25:10 就是 25 小时 10 分），一眼能看出「这天跨过去了」，但不会多出一个日期。
 * 不到 1 分钟的四舍五入到 1 分钟以内（按秒算，所以 40 秒会显示 00:01 而不是 00:00）。
 */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 60000));
  if (!Number.isFinite(total)) return "";
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/**
 * 一条记录的「时间那段」：09:30-10:15，用时 00:45 / 11:00- 计时中
 * 拼出来是给括号里用的（调用方自己加括号）。
 */
export function formatEntryTime(entry) {
  if (!entry || !entry.start) return "";
  const from = formatClock(entry.start);
  if (!entry.end) return `${from}- 计时中`;
  const to = formatClock(entry.end);
  const dur = durationMs(entry);
  return dur === null ? `${from}-${to}` : `${from}-${to}，用时 ${formatDuration(dur)}`;
}

/**
 * 整格的合计用时（只算已经结束的那些）。
 * 计时中的那条不能算 —— 它的用时还没定下来，算进去就是个一直涨的数。
 */
export function totalMs(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let sum = 0;
  for (const e of list) {
    const d = durationMs(e);
    if (d !== null) sum += d;
  }
  return sum;
}

/**
 * 卡片列表下面那行小字：2 条 · 合计 00:45
 * 挑的是「有几条」和「一共多久」—— 用计时的人最想知道的就是这个。
 *
 * 条数只在**多于一条**时才说（用户拍板）：一条的时候写「1 条 · 1 条计时中」
 * 是同一件事说了两遍，听着像有两条。所以
 *   1 条计时中        → 「1 条计时中」
 *   1 条已结束        → 「合计 00:45」
 *   3 条（1 条在跑）  → 「3 条 · 合计 01:25 · 1 条计时中」
 */
export function timerSummary(value) {
  const list = Array.isArray(value) ? value.filter(Boolean) : [];
  if (!list.length) return "";

  const parts = [];
  if (list.length > 1) parts.push(`${list.length} 条`);

  const done = list.filter((e) => durationMs(e) !== null);
  if (done.length) parts.push(`合计 ${formatDuration(totalMs(list))}`);

  const running = list.filter(isRunning).length;
  if (running) parts.push(`${running} 条计时中`);
  return parts.join(" · ");
}
