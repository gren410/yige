/* ============================================================
   一格 · 极简状态容器（单元2）
   任务书 §3.3：订阅-通知模式，不引入框架。
   state 里放界面需要的数据；任何修改走 set() → 通知订阅者重渲染。
   ============================================================ */

const listeners = new Set();

export const state = {
  boxes: [],      // 盒子列表（已按收藏/创建时间排好）
  templates: [],  // 模板列表
  cards: [],      // 当前打开盒子里的卡片（单元5）
  route: { name: "home" }, // 当前在哪一页：home（盒子陈列）/ box（盒内）
  ready: false,   // 数据是否已从 IndexedDB 载入
  templateShared: 1, // 进模板编辑页前查好的「这个模板有几个盒子在用」（单元9a）
};

/** 注册渲染回调；返回取消订阅函数 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 批量更新 state 并通知（浅合并） */
export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}
