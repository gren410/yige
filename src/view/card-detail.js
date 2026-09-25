/* ============================================================
   一格 · 卡片详情页（单元6a；6b 图片；7 自动保存；8 删除；9c 两种视角；9e 计时；9f 排布；9g 清单）
   点一张卡片进来后有两个样子，同一页里切换，**不占新的路由层**
   （任务书 §8.1：层级 ≤ 3，所以「编辑」只是换样子，不是再进一层）：

     浏览视角（进来默认）  标签和值并排一行、只读、紧凑
        ↕ 右上「编辑」/「完成」
     编辑视角（原来的样子）标签在上、控件在下，可填

   · 左上「‹ 盒子名」在任何视角下都是「一次退回盒内」，手感不变
   · 右上按钮随视角换：浏览 = 编辑 + 删除；编辑 = 已保存小字 + 完成
     （删卡是「看完了决定不要」的动作，落在浏览视角）
   · 计时这类「自带操作界面」的字段就在编辑视角里操作（单元9e 起）——
     原先给它们留的「工具卡」快捷形态已按用户要求整块删掉（2026-09-24）：
     用户觉得「先浏览、再点编辑」本来就够快，多一层形态设置不值。
   · 「完成」不是保存按钮 —— 内容照旧自动保存，任务书 §8.2 那条禁的是
     「要用户手动存内容」，这里只是切视角

   保存策略（任务书 §8.2「输入停止 1 秒自动存本地；离开页面立即存」）：
   · 打字类（文本 / 正文 / 数字 / 网址）：输入事件很密，停手 1 秒才写库
   · 点一下类（星星 / 胶囊 / 开关 / 日期 / 加删图 / 计时的开始·结束）：点完立即写库
   · 离开时（返回按钮 / 左缘右滑 / 电脑后退）由 router 的守卫调用 flush()
   · 编辑 → 浏览切回时也先 flush()，保证切过去看到的就是刚改的

   三条硬约束：
   ① 写库时**绝不能重画页面** —— 用户正在打字，重画会把光标和输入法状态弄丢。
      所以保存只写库 + 就地更新内存（main.js 的 autoSaveCard），不 setState。
   ② 切视角可以整块重画（用户是点了按钮才切的，不在打字中间），但同样**不 setState**
      —— 一走 store 就会触发 main.js 的整体 render，视角会被打回浏览。
   ③ 图片（单元6b）用户一选完，图片本体就立刻进图片仓；卡片里记的编号
      等这次自动保存才写入。计时（单元9e）点「开始」就立刻落库，所以
      关掉 app 再回来，这一轮还在跑。

   不做 Ctrl+S、不做草稿箱（任务书 §8.2 明文）。
   ============================================================ */

import {
  MAX_IMAGES,
  imageList,
  imageValue,
  isLocalImageValue,
  saveImageFile,
} from "../media/image.js";
import { cardTitle } from "../model/card.js";
import { constraintIssue, isMissing, normalizeValue } from "../model/field.js";
import { densityOf } from "../model/template.js";
import { blankEntry, normalizeEntries } from "../model/timer.js";
import { blankEntry as blankTodo, normalizeEntries as normalizeTodos } from "../model/todo.js";
import { setLeaveGuard } from "../router.js";
import { escapeHtml } from "../util/dom.js";
import { browseHtml, hydrateBrowse } from "./card-view.js";
import {
  hydrateImages,
  paintTimerRow,
  paintTimerSummary,
  paintTodoRow,
  paintTodoSummary,
  readControl,
  readTimerEntries,
  readTodoEntries,
  renderControl,
  timerListHtml,
  todoListHtml,
} from "./field-control.js";

/** 停手多久算「输入停止」（任务书 §8.2：1 秒） */
const AUTO_SAVE_MS = 1000;

/** 「已保存」小字停留多久（纯提示，不影响任何数据） */
const BADGE_MS = 1500;

/** 一行字段：标签（标了必填的带一枚小点）+ 控件 + 越界提示 */
function fieldRowHtml(field, value) {
  return `
    <div class="field-row" data-field-key="${escapeHtml(field.key)}" data-type="${escapeHtml(field.type)}">
      <div class="field-label">${escapeHtml(field.label || field.key)}${
        field.required ? '<span class="field-req" aria-label="必填"></span>' : ""
      }</div>
      <div class="fd-control">${renderControl(field, value)}</div>
      <div class="field-warn" hidden></div>
    </div>`;
}

/**
 * 渲染卡片详情页。
 * @param {object} opts
 * @param {HTMLElement} opts.app
 * @param {object}   opts.box           所属盒子（返回按钮显示它的名字）
 * @param {object}   opts.template      该卡片的模板
 * @param {object}   opts.card          卡片
 * @param {Function} opts.onBack        点返回
 * @param {Function} opts.onSave        保存，参数是收集好的 values；
 *                                      必须**只写库不重画**（重画会打断正在输入的光标）
 * @param {Function} opts.onDelete      点「删除」；调用前本页已把没存的存完
 */
export function renderCardDetail({ app, box, template, card, onBack, onSave, onDelete }) {
  const fields = (template && template.fields) || [];
  const boxName = escapeHtml(box.name || "一格");

  /* 松紧度（单元9f）：跟模板的「松紧度」走 —— 宽松就是原来的样子，紧凑把字段区压薄
     （计时控件那几条尤其明显）。**浏览视角不跟**：用户拍板浏览一律按宽松显示，
     紧凑版挤得看不清（见 template.js 的 densityOf）。 */
  const compact = densityOf(template) === "compact";

  /** 当前视角：browse（看）/ edit（改）。每次点卡片进来都从浏览开始。 */
  let mode = "browse";

  /** 最近一次已知的完整 values。编辑视角每存一次就更新它，
      切回浏览视角时直接拿它渲染，不用再读一遍库。 */
  let latest = { ...((card && card.values) || {}) };

  /** 编辑视角的运行时（保存队列）。切到浏览视角就整套丢掉。 */
  let editApi = null;

  const titleOf = () => cardTitle({ ...card, values: latest }, template);

  /* ============================================================
     一、浏览视角
     ============================================================ */

  function drawBrowse() {
    app.innerHTML = `
      <header class="page-header detail-head">
        <button type="button" class="back-btn">
          <span class="back-arrow" aria-hidden="true">‹</span><span>${boxName}</span>
        </button>
        <div class="detail-head-row">
          <h1 class="page-title detail-title">${escapeHtml(titleOf())}</h1>
          <button type="button" class="detail-edit-btn">编辑</button>
          <button type="button" class="detail-del-btn">删除</button>
        </div>
      </header>
      <main class="page-main">
        ${browseHtml({ template, values: latest })}
      </main>`;

    app.querySelector(".back-btn").addEventListener("click", () => onBack?.());

    const editBtn = app.querySelector(".detail-edit-btn");
    if (editBtn) editBtn.addEventListener("click", showEdit);

    const delBtn = app.querySelector(".detail-del-btn");
    delBtn.addEventListener("click", () => runDelete(delBtn));

    /* 浏览视角没有可改的东西，离开前不需要存 */
    setLeaveGuard(null);

    hydrateBrowse(app);
  }

  /* 删除：浏览 / 编辑两个视角共用一个流程。
     先 flush 再交给 main.js 去确认和善后 —— 撤销是把这张卡原样放回来，
     所以库里那份最好已经是用户最后看到的样子。 */
  async function runDelete(btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      if (editApi) await editApi.flush();
      await onDelete?.();
    } catch (err) {
      console.error("删除失败", err);
    } finally {
      btn.disabled = false; // 用户点了「取消」→ 按钮还能再点
    }
  }

  /* ============================================================
     二、编辑视角
     ============================================================ */

  function drawEdit() {
    const rows = fields.map((f) => fieldRowHtml(f, latest[f.key])).join("");

    app.innerHTML = `
      <header class="page-header detail-head">
        <button type="button" class="back-btn">
          <span class="back-arrow" aria-hidden="true">‹</span><span>${boxName}</span>
        </button>
        <div class="detail-head-row">
          <h1 class="page-title detail-title">${escapeHtml(titleOf())}</h1>
          <span class="save-badge" aria-live="polite"></span>
          <button type="button" class="detail-done-btn">完成</button>
        </div>
      </header>
      <main class="page-main">
        <div class="field-list${compact ? " is-compact" : ""}">${
          rows || '<div class="placeholder">这个模板还没有字段</div>'
        }</div>
      </main>`;

    const titleEl = app.querySelector(".detail-title");
    const badgeEl = app.querySelector(".save-badge");
    const listEl = app.querySelector(".field-list");

    const rowOf = (field) =>
      listEl.querySelector(`.field-row[data-field-key="${cssEscape(field.key)}"]`);

    /** 读回所有字段的当前值（image 暂不落值，保留原样） */
    function collect() {
      const out = {};
      for (const f of fields) {
        const row = rowOf(f);
        if (!row) continue;
        const raw = readControl(row, f);
        if (raw === undefined) {
          if (latest[f.key] !== undefined) out[f.key] = latest[f.key];
          continue;
        }
        out[f.key] = normalizeValue(f, raw);
      }
      return out;
    }

    /* ---------- 自动保存（单元7） ---------- */

    let timer = 0; // 1 秒防抖定时器（打字用）
    let dirty = false; // 有改动还没落库
    let tail = Promise.resolve(); // 保存串成一条队列，避免两次写入交叉

    /** 排一次保存：停手 AUTO_SAVE_MS 之后落库 —— 打字类走这条 */
    function scheduleSave() {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(kick, AUTO_SAVE_MS);
    }

    /**
     * 刚改完，立刻落库，不等定时器 —— 星星 / 胶囊 / 开关 / 日期 / 加删图走这条。
     * 必须自己把 dirty 立起来：这些操作不经过 input 事件，
     * 少了这一步 doSave 会看到 dirty=false 直接返回，等于什么都没存。
     */
    function saveNow() {
      dirty = true;
      return flush();
    }

    /** 把还没落库的存掉，但不改变「有没有改动」的判断 —— 离开页面时走这条 */
    function flush() {
      clearTimeout(timer);
      timer = 0;
      return kick();
    }

    function kick() {
      tail = tail.then(doSave);
      return tail;
    }

    async function doSave() {
      if (!dirty) return;
      dirty = false;
      try {
        const values = collect();
        latest = values; // 切回浏览视角时看的就是这一份
        await onSave?.(values);
        showBadge("已保存", false);
      } catch (err) {
        // 没存上就把标记放回去：下次改动、或者离开页面时还会再试一次
        dirty = true;
        showBadge("未保存", true);
        console.error("自动保存失败", err);
      }
    }

    let badgeTimer = 0;

    /**
     * 标题右侧那枚小字。
     * @param {string} text   「已保存」/「未保存」
     * @param {boolean} sticky 失败提示不自动消失，要让用户看见
     */
    function showBadge(text, sticky) {
      badgeEl.textContent = text;
      badgeEl.classList.toggle("save-badge-bad", !!sticky);
      badgeEl.classList.add("save-badge-on");
      clearTimeout(badgeTimer);
      if (sticky) return;
      badgeTimer = setTimeout(() => badgeEl.classList.remove("save-badge-on"), BADGE_MS);
    }

    /**
     * 顶部大标题跟着标题字段实时变（不管存没存，纯粹是所见即所得），
     * 顺手刷新每行的约束提醒（必填没填 / 超出范围）。
     * 只改文字和一枚小圆点，**不重画控件** —— 重画会打断正在打的字。
     */
    function refreshHead() {
      const values = collect();
      titleEl.textContent = cardTitle({ ...card, values }, template);
      refreshHints(values);
    }

    /**
     * 约束提醒（单元9b）。
     * 只提醒、不拦人：值照样存，返回也照常走得掉 ——
     * 卡片是自动保存的，硬拦会把人困在这一页里。
     */
    function refreshHints(values) {
      for (const f of fields) {
        if (!f.required && f.min === undefined && f.max === undefined) continue;
        const row = rowOf(f);
        if (!row) continue;

        const dot = row.querySelector(".field-req");
        if (dot) dot.classList.toggle("field-req-on", isMissing(f, values[f.key]));

        const warn = row.querySelector(".field-warn");
        if (warn) {
          const issue = constraintIssue(f, values[f.key]);
          warn.textContent = issue || "";
          warn.hidden = !issue;
        }
      }
    }

    /* ---------- 交互 ---------- */

    /** 多选胶囊：点一下开关；单选胶囊：点一下选中，再点一下取消 */
    function onChipClick(btn) {
      const group = btn.closest(".fd-chips");
      const isMulti = group.dataset.multi === "1";
      const isOn = btn.getAttribute("aria-pressed") === "true";

      if (isMulti) {
        btn.setAttribute("aria-pressed", isOn ? "false" : "true");
        return;
      }

      // 单选：先全部清掉，再决定选中谁
      Array.prototype.forEach.call(group.querySelectorAll(".fd-chip"), (b) =>
        b.setAttribute("aria-pressed", "false")
      );
      if (!isOn) btn.setAttribute("aria-pressed", "true");
    }

    function onStarClick(btn) {
      const box = btn.closest(".fd-rating");
      const n = Number(btn.dataset.value) || 0;
      const current = Number(box.dataset.value) || 0;
      const next = current === n ? 0 : n; // 再点同一颗 = 清除评分
      box.dataset.value = String(next);
      Array.prototype.forEach.call(box.querySelectorAll(".fd-star"), (s) => {
        s.setAttribute("aria-pressed", Number(s.dataset.value) <= next ? "true" : "false");
      });
    }

    /** 自由标签：往 .fd-tags 里加一颗可删的标签 */
    function addTag(multi, text) {
      const value = String(text || "").trim();
      if (!value) return false;
      const tags = multi.querySelector(".fd-tags");
      const exists = Array.prototype.some.call(
        tags.querySelectorAll(".fd-tag"),
        (t) => t.dataset.value === value
      );
      if (exists) return false;

      const tag = document.createElement("span");
      tag.className = "fd-tag";
      tag.dataset.value = value;
      tag.innerHTML = `${escapeHtml(value)}<button type="button" class="fd-tag-del"
        aria-label="删除标签 ${escapeHtml(value)}">×</button>`;
      tags.appendChild(tag);
      return true;
    }

    /** 标签输入框：回车或失焦即提交（提交完立刻存，不等 1 秒） */
    function commitTagInput(input) {
      if (addTag(input.closest(".fd-multi"), input.value)) {
        input.value = "";
        refreshHead();
        saveNow();
      }
    }

    /* ---------- 图片（单元6b） ---------- */

    const fieldOf = (row) =>
      row ? fields.find((f) => f.key === row.dataset.fieldKey) : null;

    /* 复用一个隐藏的文件选择器（每次选图都新建会往 body 里堆孤儿元素） */
    let fileInput = null;

    function ensureFileInput() {
      if (fileInput && document.body.contains(fileInput)) return fileInput;
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.className = "fd-file-input";
      fileInput.setAttribute("aria-hidden", "true");
      fileInput.tabIndex = -1;
      document.body.appendChild(fileInput);
      return fileInput;
    }

    /**
     * 点「+」→ 弹系统选图（照片图库 / 拍照）。
     * iOS 要求文件选择必须发生在用户手势里，所以这里由 click 同步触发。
     */
    function pickImages(field, onPicked) {
      const input = ensureFileInput();
      input.accept = "image/*";
      input.multiple = !!field.multiple;
      input.value = ""; // 允许连续两次选同一张图

      input.onchange = async () => {
        const files = Array.prototype.slice.call(input.files || []).filter(isImageFile);
        input.value = "";
        if (files.length) await onPicked(files);
      };

      input.click();
    }

    /** 有些系统给过来的文件 type 是空的，用扩展名兜一下 */
    function isImageFile(file) {
      if (file.type && file.type.indexOf("image/") === 0) return true;
      return /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)$/i.test(file.name || "");
    }

    /** 把选好的图收进图片仓，然后重画这一行 */
    async function addImages(field, files) {
      const row = rowOf(field);
      if (!row) return;
      const ctrl = row.querySelector(".fd-control");

      const current = imageList(field, readControl(row, field));
      const taken = current.filter(isLocalImageValue).length;

      let picked;
      if (field.multiple) {
        const room = Math.max(0, MAX_IMAGES - taken);
        if (!room) return;
        picked = files.slice(0, room);
      } else {
        picked = files.slice(0, 1);
      }

      const added = [];
      for (const f of picked) added.push(imageValue(await saveImageFile(f)));

      const next = field.multiple ? current.concat(added) : added[0];
      ctrl.innerHTML = renderControl(field, next);
      await hydrateImages(ctrl);
      refreshHead();
      await saveNow(); // 选完图立刻落库，不等 1 秒
    }

    /** 删掉这一行的某张图，然后重画（删完腾出位置，加号会自己回来） */
    async function removeImage(field, cell) {
      const row = rowOf(field);
      if (!row) return;
      const ctrl = row.querySelector(".fd-control");
      if (cell) cell.remove();

      const next = readControl(row, field);
      ctrl.innerHTML = renderControl(field, next);
      await hydrateImages(ctrl);
      refreshHead();
      await saveNow();
    }

    /* ---------- 计时（单元9e） ----------

       控件本身（一列行的长相 + 怎么读回来）在 field-control.js，
       这里只管「点下去发生什么」+ 落库 —— 保存的规矩都在这一层。
       点开始 / 结束都是「点一下类」，点完立即落库，不等 1 秒：
       用户点完「开始」很可能就把手机揣兜里了。 */

    /**
     * 点「开始 / 结束」。
     * 只改这一行的 data 属性 + 就地更新这一行的显示，**不整列重画** ——
     * 用户可能刚在某个文字框里打了字、光标还在那儿，重画会把光标和输入法弄丢。
     */
    function onTimerToggle(btn) {
      const row = btn.closest(".fd-timer-row");
      const wrap = btn.closest(".fd-timer");
      if (!row || !wrap) return;

      const start = row.dataset.start || "";
      const end = row.dataset.end || "";
      const now = new Date().toISOString();

      if (start && !end) {
        row.dataset.end = now; // 结束：记下这一刻，用时由「结束 - 开始」算出
      } else {
        /* 没开始过 → 开始；已经结束过 → 重来一轮。
           同一条只留一段记录，所以旧的起止会被这次覆盖（想保住旧的先「加一条」）。 */
        row.dataset.start = now;
        row.dataset.end = "";
      }

      paintTimerRow(row);
      paintTimerSummary(wrap);
      refreshHead();
      saveNow();
    }

    /**
     * 加一条：整列重画（序号要跟着重排）。
     * 这里**不做规整**（不把空行过滤掉）—— 整格还是空的时候界面上已经摆着一条空行，
     * 规整会把这条空行吃掉、再加回一条，用户点「加一条」看着像没反应。
     * 空行到自动保存那一步自然会被规整掉，不用在这里提前清。
     * 新的一条进的是数据末尾（序号最大），但列表倒着画，所以它出现在最上面一行。
     */
    function onTimerAdd(wrap) {
      if (!wrap) return;
      const entries = readTimerEntries(wrap);
      entries.push(blankEntry(entries));

      const list = wrap.querySelector('[data-role="list"]');
      if (!list) return;
      list.innerHTML = timerListHtml(entries, { reverse: true });
      paintTimerSummary(wrap);
      refreshHead();
      saveNow();
    }

    /** 删掉这一条；删到一条不剩时界面自己会再摆一条空的（不用手动加） */
    function onTimerDel(row) {
      const wrap = row ? row.closest(".fd-timer") : null;
      if (!wrap) return;

      const entries = normalizeEntries(readTimerEntries(wrap)).filter(
        (e) => e.id !== row.dataset.id
      );

      const list = wrap.querySelector('[data-role="list"]');
      if (!list) return;
      list.innerHTML = timerListHtml(entries, { reverse: true });
      paintTimerSummary(wrap);
      refreshHead();
      saveNow();
    }

    /* ---------- 清单（单元9g） ----------

       和计时一个套路：控件长相在 field-control.js，这里只管「点下去做什么」+ 落库。
       勾一下属于「点一下类」，点完立即落库，不等 1 秒 —— 勾完很可能就把手机放下了。 */

    /** 点圈：勾上 / 取消。只动这一行的属性，不重画整列（不打断别处正在打的字） */
    function onTodoToggle(btn) {
      const row = btn.closest(".fd-todo-row");
      const wrap = btn.closest(".fd-todo");
      if (!row || !wrap) return;

      row.dataset.done = row.dataset.done === "1" ? "0" : "1";
      paintTodoRow(row);
      paintTodoSummary(wrap);
      refreshHead();
      saveNow();
    }

    /**
     * 加一条：整列重画（序号要跟着重排），新条摆在**末尾**，然后滚过去把光标放进去。
     * 清单是正序的（1、2、3 是步骤先后，和计时那种倒着看的流水账不一样），
     * 所以新条出现在最下面 —— 点完「加一条」人要还停在顶部就得自己往下找，
     * 白点这一下。列表短、根本没得滚时 scrollIntoView 什么也不做，不影响。
     */
    function onTodoAdd(wrap) {
      if (!wrap) return;
      const entries = readTodoEntries(wrap);
      const fresh = blankTodo(entries);
      entries.push(fresh);

      const list = wrap.querySelector('[data-role="list"]');
      if (!list) return;
      list.innerHTML = todoListHtml(entries);
      paintTodoSummary(wrap);
      refreshHead();
      saveNow();

      const row = list.querySelector(`.fd-todo-row[data-id="${fresh.id}"]`);
      if (!row) return;
      row.scrollIntoView({ block: "nearest" });
      const input = row.querySelector(".fd-todo-text");
      if (input) input.focus();
    }

    /** 删掉这一条；删到一条不剩时界面自己会再摆一条空的（不用手动加） */
    function onTodoDel(row) {
      const wrap = row ? row.closest(".fd-todo") : null;
      if (!wrap) return;

      const entries = normalizeTodos(readTodoEntries(wrap)).filter(
        (e) => e.id !== row.dataset.id
      );

      const list = wrap.querySelector('[data-role="list"]');
      if (!list) return;
      list.innerHTML = todoListHtml(entries);
      paintTodoSummary(wrap);
      refreshHead();
      saveNow();
    }

    listEl.addEventListener("click", (e) => {
      const chip = e.target.closest(".fd-chip");
      if (chip) {
        onChipClick(chip);
        refreshHead();
        saveNow();
        return;
      }

      const star = e.target.closest(".fd-star");
      if (star) {
        onStarClick(star);
        refreshHead();
        saveNow();
        return;
      }

      const del = e.target.closest(".fd-tag-del");
      if (del) {
        const tag = del.closest(".fd-tag");
        if (tag) tag.remove();
        refreshHead();
        saveNow();
        return;
      }

      const imgDel = e.target.closest(".fd-img-del");
      if (imgDel) {
        const field = fieldOf(imgDel.closest(".field-row"));
        if (field) removeImage(field, imgDel.closest(".fd-img"));
        return;
      }

      const imgAdd = e.target.closest(".fd-img-add");
      if (imgAdd) {
        const field = fieldOf(imgAdd.closest(".field-row"));
        if (field) pickImages(field, (files) => addImages(field, files));
        return;
      }

      /* 计时（单元9e）：开始 / 结束、加一条、删一条 */
      const timerToggle = e.target.closest(".fd-timer-btn");
      if (timerToggle) {
        onTimerToggle(timerToggle);
        return;
      }

      const timerAdd = e.target.closest(".fd-timer-add");
      if (timerAdd) {
        onTimerAdd(timerAdd.closest(".fd-timer"));
        return;
      }

      const timerDel = e.target.closest(".fd-timer-del");
      if (timerDel) {
        onTimerDel(timerDel.closest(".fd-timer-row"));
        return;
      }

      /* 清单（单元9g）：点圈勾选、加一条、删一条 */
      const todoCheck = e.target.closest(".fd-todo-circle");
      if (todoCheck) {
        onTodoToggle(todoCheck);
        return;
      }

      const todoAdd = e.target.closest(".fd-todo-add");
      if (todoAdd) {
        onTodoAdd(todoAdd.closest(".fd-todo"));
        return;
      }

      const todoDel = e.target.closest(".fd-todo-del");
      if (todoDel) {
        onTodoDel(todoDel.closest(".fd-todo-row"));
      }
    });

    listEl.addEventListener("keydown", (e) => {
      const input = e.target.closest('[data-role="tag-input"]');
      if (!input) return;
      if (e.key === "Enter") {
        e.preventDefault();
        commitTagInput(input);
      } else if (e.key === "Backspace" && !input.value) {
        // 输入框空着按退格 → 删掉最后一个标签（常见手感）
        const tags = input.closest(".fd-multi").querySelector(".fd-tags");
        const last = tags.querySelector(".fd-tag:last-child");
        if (last) {
          last.remove();
          refreshHead();
          saveNow();
        }
      }
    });

    listEl.addEventListener(
      "focusout",
      (e) => {
        const input = e.target.closest('[data-role="tag-input"]');
        if (input) commitTagInput(input);
      },
      true
    );

    /* 打字：停手 1 秒才存（每敲一个字都存一次太浪费） */
    listEl.addEventListener("input", (e) => {
      // 标签输入框里的字还没变成标签，等回车/失焦再算数
      if (e.target.closest('[data-role="tag-input"]')) return;
      refreshHead();
      scheduleSave();
    });

    /* 改完了/失焦了：立刻存（日期、开关、下拉都是这条；文本框失焦也走这条） */
    listEl.addEventListener("change", () => saveNow());

    /* ---------- 顶部按钮 ---------- */

    const api = { flush, saveNow };
    editApi = api;

    /* 任务书 §8.2「离开页面立即存」：返回按钮 / 左缘右滑 / 电脑后退
       都会先跑到 router 的守卫这里 —— 把没落库的先存完再放行。 */
    setLeaveGuard(() => api.flush());

    /* 返回按钮：改成自动保存后它只需照常返回 ——
       goBack 会先跑上面那个守卫，把没落库的存掉再走。 */
    app.querySelector(".back-btn").addEventListener("click", () => onBack?.());

    const doneBtn = app.querySelector(".detail-done-btn");
    if (doneBtn) doneBtn.addEventListener("click", showBrowse);

    const delBtn = app.querySelector(".detail-del-btn");
    if (delBtn) delBtn.addEventListener("click", () => runDelete(delBtn));

    refreshHead();

    /* 画完再补一步：把图片格子填上真实图片（取图是异步的，赶不上这次渲染） */
    hydrateImages(listEl);
  }

  /* ============================================================
     三、两个视角之间切换
     ============================================================ */

  async function showEdit() {
    if (mode === "edit") return;
    mode = "edit";
    drawEdit();
  }

  async function showBrowse() {
    if (mode === "browse") return;
    // 切回去之前先把编辑视角里没落库的存掉 —— 这样浏览视角看到的就是刚改的
    if (editApi) await editApi.flush();
    mode = "browse";
    editApi = null;
    drawBrowse();
  }

  /* 一进来停在浏览视角（用户拍板）：一眼看到内容，也不会一点开就跳键盘。
     要动手就点右上「编辑」—— 计时的开始/结束、清单的勾选都在那里面。 */
  drawBrowse();
}

/** 字段 key 进 CSS 选择器前转义（模板自定义的 key 可能含特殊字符） */
function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
