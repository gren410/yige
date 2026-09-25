/* ============================================================
   一格 · 入口（单元5 建；单元6a 加卡片详情页；单元6b 加图片；
             单元7 自动保存；单元8 删除卡片；单元9a 模板编辑器；
             单元10 深色模式 + PWA）
   启动流程：连 IndexedDB → 首次播种 → 载入数据 → 按当前所在页渲染。
   四页：home（盒子陈列）/ box（盒内卡片流）/ card（卡片详情）/ template（模板编辑），
   由 router.js 管切换。
   ============================================================ */

import {
  seedIfEmpty,
  listBoxes,
  listTemplates,
  countCardsByBox,
  countBoxesByTemplate,
  usedColorKeys,
  listCards,
  getCard,
  updateCard,
  deleteCard,
  restoreCard,
  saveTemplate,
} from "./storage/dao.js";
import { releaseImageUrls } from "./media/image.js";
import { cardTitle } from "./model/card.js";
import { state, setState, subscribe } from "./state/store.js";
import { boxIconSvg, REF_CELL_WIDTH } from "./view/box-icon.js";
import { openNewBox } from "./view/new-box.js";
import { renderBoxPage } from "./view/box.js";
import { openNewCard } from "./view/new-card.js";
import { renderCardDetail } from "./view/card-detail.js";
import { renderTemplateEditor } from "./view/template-editor.js";
import { openConfirm, closeConfirm } from "./view/confirm.js";
import { closeSheet } from "./view/sheet.js";
import { showToast } from "./view/toast.js";
import { watchSystemTheme } from "./view/theme.js";
import { registerServiceWorker, maybeShowHomeScreenHint } from "./view/pwa.js";
import {
  goBox,
  goCard,
  goTemplate,
  goBack,
  goHome,
  route,
  enableEdgeSwipe,
  setLeaveGuard,
} from "./router.js";
import { escapeHtml } from "./util/dom.js";

const app = document.getElementById("app");

/* 记住上一次渲染用的格子宽度，避免「测量 → 重渲染」死循环 */
let lastCellWidth = 0;

/**
 * 读当前网格格子的实际渲染宽度。
 * 任务书 §9.3 要求名称字号按实际渲染宽度算，所以先渲染结构量一次，
 * 再按量到的宽度重画图标。
 */
function measureCellWidth() {
  const cell = app.querySelector(".box-cell");
  if (!cell) return 0;
  const w = cell.getBoundingClientRect().width;
  return w > 0 ? w : 0;
}

/* ---------- 主界面：盒子陈列 ---------- */

function renderHome() {
  const cellWidth = lastCellWidth || REF_CELL_WIDTH;
  const counts = state.cardCounts || {};

  const cells = state.boxes
    .map(
      (b) => `
      <div class="box-cell" data-box-id="${escapeHtml(b.id)}">
        ${boxIconSvg(b, { cellWidth, cardCount: counts[b.id] || 0 })}
      </div>`
    )
    .join("");

  /* 新建入口：与盒子同尺寸的一格虚线「+」（不遮挡内容，盒子多了也在末尾排队） */
  const addCell = `
      <div class="box-cell box-cell-add" role="button" tabindex="0" aria-label="新建盒子">
        <div class="add-box">
          <span class="add-box-plus" aria-hidden="true"></span>
          <span class="add-box-text">新建盒子</span>
        </div>
      </div>`;

  app.innerHTML = `
    <header class="page-header"><h1 class="page-title">一格</h1></header>
    <main class="page-main">
      <div class="box-grid">${cells}${addCell}</div>
    </main>`;

  // 首次渲染时量出真实格子宽度；与假设值不同就按真实值重画一次
  const real = measureCellWidth();
  if (real && Math.abs(real - lastCellWidth) > 0.5) {
    lastCellWidth = real;
    renderHome();
  }
}

/* ---------- 公共 ---------- */

function templateOf(box) {
  return state.templates.find((t) => t.id === box.templateId);
}

/* ---------- 盒内页面 ---------- */

/** 进盒子：先把该盒的卡片读出来，再切路由（切路由会触发一次重画） */
async function openBox(boxId) {
  const cards = await listCards(boxId);
  setState({ cards, activeCard: null });
  goBox(boxId);
}

function openNewCardForm(box) {
  openNewCard({
    box,
    template: templateOf(box),
    onCreated: async () => {
      const [cards, cardCounts] = await Promise.all([listCards(box.id), countCardsByBox()]);
      setState({ cards, cardCounts });
    },
  });
}

/* ---------- 卡片详情（单元6a） ---------- */

/** 进卡片详情：先把这张卡读出来放进 state，再切路由 */
async function openCard(cardId) {
  const card = await getCard(cardId);
  if (!card) return;
  setState({ activeCard: card });
  goCard(card.boxId, card.id);
}

/**
 * 自动保存一张卡（单元7）。
 * 只做两件事：写库 + 就地更新内存里的那份数据。
 * **绝不 setState** —— setState 会触发重画，而重画会打断用户正在输入的
 * 光标和输入法，自动保存就成了「打字打一半页面闪一下」。
 * 盒内页面下次渲染时读的就是更新过的 state，所以列表小字也是新的。
 * @param {object} card   这次打开的那张卡（渲染时的快照）
 * @param {object} values 从界面收集好的完整 values
 */
async function autoSaveCard(card, values) {
  const saved = await updateCard(card.id, values);
  if (!saved) return;

  const list = state.cards || [];
  const i = list.findIndex((c) => c.id === card.id);
  if (i >= 0) list[i] = saved;
  if (state.activeCard && state.activeCard.id === card.id) state.activeCard = saved;
}

/* ---------- 删除一张卡（单元8） ---------- */

/**
 * 删一张卡：二次确认 → 软删除 → 退回盒内 → 底部滑一条带「撤销」的小条。
 *
 * 数据上只是打了个删除标记（dao.deleteCard），卡片本体一条没动，所以
 * 「撤销」是把标记清掉就行 —— 内容、图片、在列表里的位置全都原样回来。
 * 盒子的删除不在这一单元：任务书 §6.7 要求「盒内卡片一并标记、整组恢复」，
 * 那得配合回收站，等后面阶段一起做。
 */
async function confirmAndDeleteCard(card, box) {
  const ok = await openConfirm({
    title: "删除这张卡片？",
    message: `「${cardTitle(card, templateOf(box))}」将被删除，底下会出现「撤销」，可以立刻找回。`,
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;

  const boxId = card.boxId;
  await deleteCard(card.id);

  /* 先把内存里的列表换成最新的（里面已经没有这张卡了），再让界面重画。
     顺序反过来会先画一次「还带着这张卡」的盒内页，看着像删不掉闪了一下。
     路由不用手动退：详情页渲染时发现「这张卡不在列表里」会自己退回盒内。 */
  const [cards, cardCounts] = await Promise.all([listCards(boxId), countCardsByBox()]);
  setState({ cards, cardCounts, activeCard: null });

  showToast({
    message: "卡片已删除",
    actionText: "撤销",
    onAction: async () => {
      await restoreCard(card.id);
      const [back, counts] = await Promise.all([listCards(boxId), countCardsByBox()]);
      setState({ cards: back, cardCounts: counts });
    },
  });
}

/* ---------- 新建盒子（单元4） ---------- */

async function openNewBoxForm() {
  const used = await usedColorKeys();
  openNewBox({
    templates: state.templates,
    usedColorKeys: used,
    onCreated: async () => {
      // 建完重新读一遍（新盒子按创建时间排在最后），store 一变界面自动重画
      const [boxes, cardCounts] = await Promise.all([listBoxes(), countCardsByBox()]);
      setState({ boxes, cardCounts });
    },
  });
}

/* ---------- 模板编辑器（单元9a） ---------- */

/**
 * 进模板编辑页。
 * 「这个模板还被几个盒子用着」先查好、就地塞进 state（不 setState ——
 * 免得白重画一次盒内页），紧接着 goTemplate 的那次重画会读到它。
 */
async function openTemplateEditor(box) {
  state.templateShared = await countBoxesByTemplate(box.templateId);
  goTemplate(box.id);
}

/**
 * 存一份模板。
 * **绝不 setState**：模板页正开着，重画会把用户编到一半的草稿冲掉。
 * 就地换掉内存里那一份即可 —— 离开模板页时路由变化触发的重画会读到新值
 * （和卡片详情的 autoSaveCard 同一个套路）。
 */
async function saveTemplateToState(next) {
  const saved = await saveTemplate(next);
  const list = state.templates || [];
  const i = list.findIndex((t) => t.id === saved.id);
  if (i >= 0) list[i] = saved;
  else list.push(saved);
  return saved;
}

/* ---------- 统一渲染：按当前在哪一页画 ---------- */

/* 上一次画的是哪一页 —— 用来判断「刚离开卡片详情页」 */
let lastRenderedPage = "";

function render() {
  if (!state.ready) {
    app.innerHTML = `
      <header class="page-header"><h1 class="page-title">一格</h1></header>
      <main class="page-main"><div class="placeholder">正在打开…</div></main>`;
    return;
  }

  const r = route();

  /* 离开卡片详情页 → 把图片的临时地址还回去。
     推迟到本次渲染写进 DOM 之后再做，免得正在显示的图被抽走。
     顺手把可能还开着的删除确认弹窗收掉：详情页可以被左缘右滑直接带出去，
     弹窗要是跟着飘到盒内页上，就点不掉了。 */
  if (lastRenderedPage === "card" && r.name !== "card") {
    closeConfirm();
    setTimeout(releaseImageUrls, 0);
  }

  /* 离开模板页同理：字段编辑面板和删除确认都可能还开着，
     左缘右滑能直接把这页带出去，留着会飘到盒内页上。 */
  if (lastRenderedPage === "template" && r.name !== "template") {
    closeSheet();
    closeConfirm();
  }
  lastRenderedPage = r.name;

  if (r.name === "template") {
    const box = state.boxes.find((b) => b.id === r.boxId);
    if (!box) {
      goHome();
      return;
    }
    const template = templateOf(box);
    if (!template) {
      // 模板没了（数据异常）→ 退回盒内，别把用户困在空页上
      goBack();
      return;
    }
    renderTemplateEditor({
      app,
      box,
      template,
      sharedCount: state.templateShared || 1,
      onSave: saveTemplateToState,
      onBack: goBack,
    });
    return;
  }

  if (r.name === "card") {
    const box = state.boxes.find((b) => b.id === r.boxId);
    if (!box) {
      goHome();
      return;
    }
    // 详情页优先用 state 里的 activeCard（自动保存会就地把它换成最新的一份）；
    // 从盒内点进来时 activeCard 就是刚读出来的那张。
    const card =
      state.activeCard && state.activeCard.id === r.cardId
        ? state.activeCard
        : (state.cards || []).find((c) => c.id === r.cardId);

    if (!card) {
      // 这张卡不在列表里了（刚被删除，或盒子被换掉）→ 退回盒内
      goBack();
      return;
    }

    renderCardDetail({
      app,
      box,
      template: templateOf(box),
      card,
      onBack: goBack,
      onSave: (values) => autoSaveCard(card, values),
      onDelete: () => confirmAndDeleteCard(card, box),
    });
    return;
  }

  if (r.name === "box") {
    const box = state.boxes.find((b) => b.id === r.boxId);
    if (!box) {
      // 盒子找不到（尚未载入或被删除）→ 回主界面
      goHome();
      return;
    }
    setLeaveGuard(null);
    renderBoxPage({
      app,
      box,
      template: templateOf(box),
      cards: state.cards || [],
      onBack: goHome,
      onNewCard: () => openNewCardForm(box),
      onEditTemplate: () => openTemplateEditor(box),
    });
    return;
  }

  setLeaveGuard(null);
  renderHome();
}

/* ---------- 入口事件（委托在容器上：重画 innerHTML 也不会丢监听） ---------- */

app.addEventListener("click", (e) => {
  if (e.target.closest(".box-cell-add")) {
    openNewBoxForm();
    return;
  }

  // 盒内：点一张卡片 → 进详情
  const cardRow = e.target.closest(".card-row[data-card-id]");
  if (cardRow) {
    openCard(cardRow.dataset.cardId);
    return;
  }

  const cell = e.target.closest(".box-cell[data-box-id]");
  if (cell) openBox(cell.dataset.boxId);
});

app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;

  const onAdd = e.target.closest(".box-cell-add");
  if (onAdd) {
    e.preventDefault();
    openNewBoxForm();
    return;
  }

  const cardRow = e.target.closest(".card-row[data-card-id]");
  if (cardRow) {
    e.preventDefault();
    openCard(cardRow.dataset.cardId);
  }
});

/* ---------- 键盘遮挡（任务书 §10：用 visualViewport 算偏移） ---------- */

function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const sync = () => {
    const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kb", `${Math.round(hidden)}px`);
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
}

/* ---------- 启动 ---------- */

async function boot() {
  window.__yigeBooted = true; // index.html 的兼容兜底靠这个标记判断模块有没有跑起来
  render(); // 先画骨架，避免白屏

  await seedIfEmpty();
  const [boxes, templates, cardCounts] = await Promise.all([
    listBoxes(),
    listTemplates(),
    countCardsByBox(),
  ]);
  setState({ boxes, templates, cardCounts, ready: true });

  enableEdgeSwipe(document.body); // 左缘右滑返回（盒内 / 详情页生效）
  trackKeyboard();

  registerServiceWorker(); // 离线缓存（只有 https / localhost 装得上）
  maybeShowHomeScreenHint().catch(() => {}); // 首次「加到主屏」提示（只在 iPhone / iPad）
}

subscribe(render);

/* 系统明暗切换（到点自动切、电脑上手动切都会触发）→ 主界面重画一次。
   为什么只有主界面要重画：盒子图标的颜色是**画进 SVG 的固定色值**，
   CSS 变量管不到它；其它页面的颜色全在 CSS 变量里，跟着系统自己就变了。
   而不该到处重画的原因和自动保存那一条一样 —— 重画会打断正在输入的光标。 */
watchSystemTheme(() => {
  if (state.ready && route().name === "home") {
    lastCellWidth = 0; // 重新量一次格子宽度，避免沿用上一次的
    render();
  }
});

boot().catch((err) => {
  console.error("启动失败", err);
  app.innerHTML = `<main class="page-main"><div class="placeholder">启动失败：${escapeHtml(err.message)}</div></main>`;
});

/* 窗口尺寸变化（横竖屏切换、电脑改窗口宽度）→ 重新量格子宽度再重画。
   ⚠ 两个坑（2026-09-24 修「模板页改完一滑动就回退」时踩出来的）：
   ① **宽度没变就别动**。iOS Safari 滚动时地址栏会收起 / 放下，这会**不停**
      触发 resize，但窗口宽度其实没变。原来一律重画，于是用户每滑一下当前页面
      就被重建一次 —— 模板页的草稿、卡片详情里正在输入的光标都被冲掉。
   ② **只有主界面需要立刻重画**（盒子网格的列宽得按新宽度算）。其它页面
      没有需要重算的东西，重画纯属有害。宽度变了就把格子宽度缓存作废，
      等它们下次自己渲染时再重新量。 */
let resizeTimer = 0;
let lastWinWidth = window.innerWidth;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth === lastWinWidth) return; // 只是地址栏伸缩
    lastWinWidth = window.innerWidth;
    lastCellWidth = 0;
    if (route().name !== "home") return;
    render();
  }, 150);
});
