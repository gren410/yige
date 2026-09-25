# 一格

iPhone 主屏上的卡片收纳盒。纯静态前端，零依赖、零构建，数据存在浏览器本地（IndexedDB）。

## 本地预览

ES Module 必须走 HTTP，不能双击 `index.html`（`file://` 会被浏览器拦）。

```bash
python tools/preview.py            # http://127.0.0.1:8000
python tools/preview.py --port 9001
```

Windows 上双击 `start.bat` 也可以（脚本内已指向本机 Python）。

## 线上访问

本站以 GitHub Pages 托管，入口是本仓库根目录的 `index.html`。

- 手机上用 Safari 打开 Pages 地址 → 分享 → 添加到主屏幕。
- 网页版一律走相对路径（`./src/...`），所以放在 `/<仓库名>/` 子路径下也能正常跑。

## 加到主屏（PWA）

- `manifest.webmanifest` + `icons/apple-touch-icon.png`（180×180）给 iOS 用，`icon-192` / `icon-512` 给 manifest 用。
- `sw.js` 是离线缓存，策略是**在线优先**：先走网络，断网时回落到上一次存下的版本。改了代码记得改它里面的 `VERSION`。
- 首页第一次在 iPhone 上打开时提示一次「添加到主屏幕」，之后不再出现。
  这条提示不是拉新，是保数据：**iOS 上 7 天没打开的网站会被系统静默清空数据**。
  另外注意 **Safari 里打开的「一格」和主屏图标打开的「一格」是两个互不相通的空间**，
  数据各存各的，删掉主屏图标就等于删掉那份数据。
- 深浅色跟随系统，深色下盒身色换成降饱和版本（任务书 §9.6）。
- 手机上用局域网 http 地址打开时浏览器不允许注册 Service Worker（只有 https 和 localhost 算安全来源），
  这是正常的，页面照常可用，只是断网打不开。

重新生成图标：

```bash
python tools/gen_icons.py
```

## 目录

```
index.html          唯一入口
manifest.webmanifest PWA 清单
sw.js               离线缓存（在线优先）
styles.css          全部样式（含 CSS 变量：色彩、字号、间距；明暗两套）
icons/              180 / 192 / 512 三个应用图标
tools/preview.py    本地预览服务器（Python 标准库，无需安装依赖）
tools/gen_icons.py  生成应用图标（Python 标准库，无需安装依赖）
src/
├── main.js         启动、渲染调度、页面切换
├── router.js       三层路由（主界面 → 盒内 → 卡片/模板），左缘右滑 + 浏览器后退
├── state/store.js  内存状态（订阅-通知）
├── storage/        IndexedDB（db.js 建库、dao.js 读写）
├── model/          纯数据逻辑，不含 DOM
│   ├── presets.js  预设盒子与模板
│   ├── card.js     卡片（标题三级兜底、字段值读写）
│   ├── template.js 模板（字段增删改序、参数规整与善后）
│   ├── field.js    12 种字段类型的默认值 / 规整 / 判空 / 格式化
│   ├── timer.js    计时条目（开始/结束/时长）
│   ├── todo.js     清单条目（勾选进度）
│   └── colors.js   12 基础色
├── view/           每个界面一个文件，只负责画与收事件
│   ├── theme.js    明暗主题（跟随系统，盒子图标靠它取色）
│   └── pwa.js      离线缓存注册 + 首次「加到主屏」提示
└── util/           颜色换算、日期格式化、DOM 小工具、ID
```

## 约定

- 不进任何依赖、不用打包工具，浏览器直接跑 ES Module。
- 数据以明文 JSON 存本地；卡片图片以 Blob 存 IndexedDB 的 `assets` 仓，卡片里只记 `local:img_xxx`。
- 自动保存：打字类停 1 秒存、点一下类立即存、离开页面立即存；没有保存按钮。
