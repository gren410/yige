/* ============================================================
   一格 · 清单（第 12 种字段类型，单元9g）
   用户要的东西：一列小事，每件前面一个圈，点一下算做完，再点一下取消。

   === 值长什么样 ===
   和计时同一种形状 —— 一个格子里装「一列小对象」，一条 = 一件小事：
     [
       { id: "d_1a2b", text: "写周报",  done: false },
       { id: "d_3c4d", text: "发邮件",  done: true  }
     ]

   为什么 id 要存在数据里（和计时同款理由）：
     认人用。删掉第 2 条、给第 3 条打勾，都靠它对准是哪一条；
     靠「第几行」认人的话，删一条后面的全错位。
   done 存 true/false（不是 0/1）：让人打开 JSON 一眼看懂。

   这一层全是纯计算，不碰 DOM、不碰库 —— 所以能直接用 node 跑断言。
   ============================================================ */

/** 一条清单里最长能写多少字（和单行文本字段一个量级即可） */
export const TODO_TEXT_MAX = 60;

/**
 * 造一个条内不重复的编号。
 * 只在这一格内部用来认人，不进任何数据结构约定，短就够了。
 */
function newEntryId(existing) {
  const used = new Set((existing || []).map((e) => e && e.id));
  for (let i = 0; i < 50; i++) {
    const id = "d_" + Math.random().toString(16).slice(2, 6).padEnd(4, "0");
    if (!used.has(id)) return id;
  }
  return "d_" + Date.now().toString(16).slice(-4);
}

/** 空白的一条：界面在「什么都还没写」时先摆这么一条出来（只摆在界面上，不落库） */
export function blankEntry(existing = []) {
  return { id: newEntryId(existing), text: "", done: false };
}

/* ---------- 规整 ---------- */

/**
 * 一条的规整。
 * 完全空的（没写字、也没勾过）返回 null —— 由调用方丢掉，
 * 这样「界面上摆着一条空行但用户没动」不会往库里写垃圾。
 *
 * 勾过但没写字的那条**要留下**：勾本身就是一条信息（「这事我做了，懒得写名」）。
 */
export function normalizeEntry(raw, existing = []) {
  if (!raw || typeof raw !== "object") return null;

  const text = String(raw.text == null ? "" : raw.text).trim();
  const done = !!raw.done;

  if (!text && !done) return null;

  /* 编号在这一格里必须唯一（删除、打勾都靠它认人）。
     数据里撞号了（手改过、从别处拷来的）就换一个新的，别让两条共用一个号。 */
  const used = new Set(existing.map((e) => e && e.id).filter(Boolean));
  const given = String(raw.id || "").trim();

  return {
    id: given && !used.has(given) ? given : newEntryId(existing),
    text,
    done,
  };
}

/** 整列的规整（去空条、去重编号、顺手补上缺的 id） */
export function normalizeEntries(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    const entry = normalizeEntry(item, out);
    if (entry) out.push(entry);
  }
  return out;
}

/** 这一列里做完了几条 */
export function doneCount(value) {
  const list = Array.isArray(value) ? value.filter(Boolean) : [];
  let n = 0;
  for (const e of list) if (e.done) n++;
  return n;
}

/* ---------- 显示 ---------- */

/**
 * 卡片列表下面那行小字：3 条 · 已完成 1
 * 只有一条时不报「1 条」（用户拍板：条数和进度两条话说的是同一件事，重复）；
 * 一条都没做完时只报条数，做完 0 条的那种进度没人关心。
 */
export function todoProgress(value) {
  const list = Array.isArray(value) ? value.filter(Boolean) : [];
  if (!list.length) return "";

  const parts = [];
  if (list.length > 1) parts.push(`${list.length} 条`);

  const done = doneCount(list);
  if (done) parts.push(`已完成 ${done}`);

  return parts.join(" · ");
}
