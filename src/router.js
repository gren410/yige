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

/* 我们自己往历史里压了几层（home 为 0）。它只是个**估计值**，用来给
   goHome 一次退干净、免得历史里堆一堆无用记录。
   ★ 判断「该去哪个页面」只看记录内容，不看这个 depth（见下方 popstate）——
   否则刷新后内存归零、而历史还在，两本账就会错位。 */
let depth = 0;

/* 把「当前这一条历史记录」改写成本次会话的起点（主界面）。
   刷新后浏览器停在刷新前那条上，据为己有，免得它变成一颗地雷。
   （刷新后那一条若还写着 yige:"box"，下次后退会退到一个已经不存在的上下文里。） */
if (window.history && typeof window.history.replaceState === "function") {
  window.history.replaceState({ yige: "home" }, "");
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
    window.history.pushState({ ...entry }, "");
  }
  depth += 1;
}

/* 读「浏览器当前停在哪一条历史记录」。
   它带着我们 push 时写进去的 yige / boxId 等，所以比内存里的 depth 可靠 ——
   depth 刷新就归零，而这条记录跟着浏览器走。 */
function currentEntry() {
  const st = window.history && window.history.state;
  return st && st.yige ? st : null;
}

/** 这一条记录处在第几层（home=0 / box=1 / card·template=2）。
    用来在 depth 不可靠时补算出该退几层 —— 它由记录内容决定，刷新不影响。 */
function levelOf(entry) {
  if (!entry || !entry.yige || entry.yige === "home") return 0;
  return entry.yige === "box" ? 1 : 2;
}

/* 正在「一次退回主界面」的标记。
   退历史会触发 popstate，而 popstate 会按落地的记录重设路由 ——
   退到位（落到 home 记录）之前，不许它把路由又设回中间层。 */
let homing = false;

/** 回主界面（从任意一层都能一次到底） */
export async function goHome() {
  await beforeLeave();

  const back = Math.max(depth, levelOf(currentEntry()));
  if (route().name !== "home") setState({ route: { name: "home" } });
  if (back <= 0) return;

  /* 一次退 back 层。注意：go(-n) 只发一次 popstate（落在最终那条上），
     所以 popstate 里的 homing 分支最多跑到一次，不会来回跳。 */
  homing = true;
  window.history.go(-back);
  depth = 0;
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
  // ★ 判断「能不能走浏览器后退」不看 depth（刷新后它会归零、于是这里会
  //   只改路由不动历史 —— 界面回到了盒内，但历史仍停在卡片那条上，
  //   下一次系统左滑就退到卡片，看着像「返回没生效」）。
  //   改成看**当前这条历史记录自己**：它是我们 push 的 card/template，
  //   前面必然还有一条（box 或 home），直接 back() 就对了。
  const cur = currentEntry();
  const canGoBack = cur ? cur.yige === "card" || cur.yige === "template"
                        : depth > 0;
  if (canGoBack) {
    window.history.back(); // popstate 会把路由设回 box
    return;
  }
  setState({ route: { name: "box", boxId: r.boxId } });
}

/* 电脑端浏览器后退 / 系统返回（含 iPhone 左缘右滑）→ 按记录自己带着的信息恢复页面。
   同样要先等守卫（这一段还发生在重画之前，所以详情页的值还读得到）。

   ★ 这里的原则是「**按记录内容尽力恢复**」，而不是「认不出就一律回主界面」。

   为什么会这样改（2026-09-25 用户实测）：
     自建手势撤掉之后，iPhone 上的左缘右滑完全由系统接管 —— 系统手势就是
     浏览器后退，会退到历史栈里的**任意一层**，包括刷新前留下的旧记录、
     以及浏览器自己加的那种没有我们标记的记录。
     早先的写法是「session 对不上就一律回主界面」，于是用户每滑一次都被
     按回主界面（「不管跳转几次，左滑都会回到主界面」）；而系统的历史位置
     还在继续往前，就出现「继续左滑依旧有界面出现，只是显示的是主界面」——
     路由和历史两本账彻底错位。

   现在：
     · 记录带着 yige 标记 → 按标记去对应页面（**不区分是不是本次会话**）。
       刷新前留下的 box / card / template 记录同样能正确恢复，不会退过头。
     · 记录没有标记（浏览器自己产生的、或从别的网页进来的那一页）→ 回主界面。
       depth 一并归零。

   depth 从此只是个「我们大概压了几层」的估计值，用来给 goHome 一次退干净；
   **判断去哪一页只看记录内容，不看 depth**，这样刷新前后都不会错位。 */
window.addEventListener("popstate", async (e) => {
  await beforeLeave();

  const st = e.state;
  const usable = !!(st && st.yige); // 只认「有没有我们的标记」，不再挑剔会话编号

  /* goHome() 发起的「一次到底」正在退的路上：
     路由已经设成 home 了，这里就别再按落地记录改回去 ——
     否则会退到中间层（比如从 home 又跳回 box），看着像是没退干净。 */
  if (homing) {
    homing = false;
    depth = 0;
    if (route().name !== "home") setState({ route: { name: "home" } });
    return;
  }

  if (!usable) {
    // 不是我们压进去的记录（浏览器自己的、或别的站点带来的）→ 主界面
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
