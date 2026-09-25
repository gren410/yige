/* ============================================================
   一格 · 页面切换（单元5 建；单元6a 加「卡片详情」一层；单元7 守卫改成异步；
              单元9a 加「模板编辑」一层）
   任务书 §8.1：
     · 层级 ≤ 3：主界面（盒子陈列）→ 盒内（卡片流）→ 详情（卡片 / 模板）
     · PWA 没有浏览器返回按钮 → 必须自建应用内返回 + 左侧边缘右滑手势
     · 自建返回按钮固定在左上角：箭头 + 上一层名称

   四页：home / box / card / template。
   路由放在 state 里，改路由 = 通知界面重画，不引入任何框架（§3.3）。
   电脑端浏览器的「后退」也能逐层退出（每次进一层 pushState 一条）。

   离开任何一层前都会先跑一次守卫（见下方 beforeLeave）——
   单元7 用它实现任务书 §8.2 的「离开页面立即存」。
   ============================================================ */

import { state, setState } from "./state/store.js";

/** 当前路由 */
export function route() {
  return state.route || { name: "home" };
}

/* 我们自己往历史里压了几层（home 为 0）。用它在「直接回主界面」时
   一次退干净，避免历史里留一堆已经无用的记录。 */
let depth = 0;

/* 本次打开应用的编号。刷新或重开之后，浏览器历史里仍然留着上一次留下的
   记录（还带着上一次的编号），而内存里的 depth 已经清零 —— 两本账对不上，
   退的时候就会多退一步，退到刷新之前那一页。所以要给每次打开发个新编号：
   落到编号对不上的旧记录时，一律当成无效，直接回主界面。 */
const SESSION = "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* 把「当前这一条历史记录」改写成本次会话的起点（主界面）。
   刷新后浏览器停在刷新前那条上，据为己有，免得它变成一颗地雷。 */
if (window.history && typeof window.history.replaceState === "function") {
  window.history.replaceState({ yige: "home", session: SESSION }, "");
}

/* 离开当前页前的守卫（单元7 改造）。
   任务书 §8.2：「输入停止 1 秒自动存本地；离开页面立即存」。
   页面可以被三条路离开：左上返回按钮、左缘右滑、电脑上的浏览器后退 ——
   三条路都会先跑到这里。守卫返回 Promise 时，路由会等它完成再真正离开，
   卡片详情就用它把「还没到 1 秒、没落库的改动」先存掉。 */
let leaveGuard = null;

export function setLeaveGuard(fn) {
  leaveGuard = fn || null;
}

/**
 * 跑一次守卫。守卫只对「这一次离开」负责，跑完即清掉，
 * 免得下次进来还挂着一个属于上一页的守卫。
 * 守卫出错不能把用户困在页面里 —— 记下来，照常放行。
 */
async function beforeLeave() {
  const fn = leaveGuard;
  if (!fn) return;
  leaveGuard = null;
  try {
    await fn();
  } catch (err) {
    console.error("离开前处理失败", err);
  }
}

function push(entry) {
  if (window.history && typeof window.history.pushState === "function") {
    // 每条记录都盖上本次会话的编号，退回时用来辨认「是不是这次的」
    window.history.pushState({ ...entry, session: SESSION }, "");
  }
  depth += 1;
}

/** 回主界面（从任意一层都能一次到底） */
export async function goHome() {
  await beforeLeave();
  if (route().name !== "home") setState({ route: { name: "home" } });
  if (depth > 0) {
    // 退历史会触发 popstate；那时路由已是 home，会被下面的守卫忽略（不会来回跳）
    window.history.go(-depth);
    depth = 0;
  }
}

/** 进某个盒子 */
export function goBox(boxId) {
  setState({ route: { name: "box", boxId } });
  push({ yige: "box", boxId });
}

/** 进某张卡片的详情 */
export function goCard(boxId, cardId) {
  setState({ route: { name: "card", boxId, cardId } });
  push({ yige: "card", boxId, cardId });
}

/** 进某个盒子的模板编辑页（单元9a，和卡片详情同一层） */
export function goTemplate(boxId) {
  setState({ route: { name: "template", boxId } });
  push({ yige: "template", boxId });
}

/** 返回上一层（卡片详情 / 模板 → 盒内；盒内 → 主界面） */
export async function goBack() {
  if (route().name === "home") return;

  // 先把当前页「没存完的改动」处理掉；处理期间页面还在，控件里的值还读得到
  await beforeLeave();

  const r = route(); // 守卫里可能自己改了路由，重新取一次
  if (r.name === "home") return;

  if (r.name === "box") {
    await goHome();
    return;
  }

  // 卡片详情 / 模板编辑 → 盒内
  if (depth > 0) {
    window.history.back(); // popstate 会把路由设回 box
    return;
  }
  setState({ route: { name: "box", boxId: r.boxId } });
}

/* 电脑端浏览器后退 / 系统返回 → 按历史里记录的层级回退。
   同样要先等守卫（这一段还发生在重画之前，所以详情页的值还读得到）。

   两种「不该按记录走」的情况，一律回主界面：
     · 记录没有我们的标记（比如用户从别的网页点进来的那一页）
     · 记录的 session 不是本次的（刷新之前留下的旧账） */
window.addEventListener("popstate", async (e) => {
  await beforeLeave();

  const st = e.state;
  const stale = !st || !st.yige || st.session !== SESSION;

  if (stale) {
    depth = 0;
    if (route().name !== "home") setState({ route: { name: "home" } });
    return;
  }

  depth = Math.max(0, depth - 1);

  if (st.yige === "home") {
    depth = 0;
    if (route().name !== "home") setState({ route: { name: "home" } });
    return;
  }
  if (st.yige === "card") {
    setState({ route: { name: "card", boxId: st.boxId, cardId: st.cardId } });
    return;
  }
  if (st.yige === "template") {
    setState({ route: { name: "template", boxId: st.boxId } });
    return;
  }
  setState({ route: { name: "box", boxId: st.boxId } });
});

/* ---------- 左缘右滑返回（任务书 §8.1） ---------- */

const EDGE_PX = 24; // 起手必须落在屏幕左缘 24px 内，避免和卡片内部滑动打架
const SWIPE_PX = 60; // 横向滑够 60px 才算「返回」
const DIR_LOCK_PX = 10; // 移动够这么多像素，就定下这次手势「是横还是竖」
const DIR_RATIO = 1.5; // 横向位移要至少是纵向的 1.5 倍，才认作「横滑」

let startX = 0;
let startY = 0;
let tracking = false;
let decided = ""; // ""＝还没定 / "h"＝横滑 / "v"＝竖滑

/**
 * 绑定左缘右滑返回。只绑一次（在启动时调用）。
 *
 * 任务书 §8.1 要求「左缘右滑返回」，但 iPhone 上页面也是靠手指上下滑的，
 * 早先版本只看起手位置、抬手才判定，于是「手指贴着左缘往上/下滚」会被
 * 误判成返回（用户实测：「屏幕上下左右过度滑动会触发返回」）。
 * 这里加三道闸，缺一不算：
 *   1 起手在左缘 24px 内；
 *   2 中途裁决方向 —— 先动起来的那 10px 决定这次是横还是竖（iOS 的
 *     地址栏滑动同样会发出 touch 事件，不裁决就分不开）；
 *   3 抬手时横向位移 > 60px，且横向至少是纵向的 1.5 倍。
 * 另外把 touchcancel 也算作结束（系统手势抢走、来电等都会打断），
 * 免得 tracking 卡在 true，下一次滑动被当成上一次的尾巴。
 *
 * @param {HTMLElement} el 绑定目标（一般传 document.body）
 */
export function enableEdgeSwipe(el) {
  el.addEventListener(
    "touchstart",
    (e) => {
      tracking = false;
      decided = "";
      if (route().name === "home") return; // 主界面没有上一层
      const t = e.touches[0];
      // 多指（捏合缩放等）不参与
      if (e.touches.length !== 1) return;
      if (t.clientX > EDGE_PX) return;
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
    },
    { passive: true }
  );

  /* 方向裁决只看一次：定下之后整段手势都不再改主意，
     免得「先横后竖」的弧线在抬手时又蹭回横滑判定。 */
  el.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking || decided) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < DIR_LOCK_PX && Math.abs(dy) < DIR_LOCK_PX) return; // 还没动够
      decided = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
    },
    { passive: true }
  );

  const finish = (e) => {
    if (!tracking) return;
    tracking = false;
    if (decided !== "h") return; // 竖滑 / 没裁决 → 不是返回
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = Math.abs(t.clientY - startY);
    if (dx > SWIPE_PX && dx >= dy * DIR_RATIO) goBack();
  };

  el.addEventListener("touchend", finish, { passive: true });
  el.addEventListener("touchcancel", finish, { passive: true });
}
