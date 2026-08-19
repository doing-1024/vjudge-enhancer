# VJudge Enhancer

一个用于 [vjudge.net](https://vjudge.net) 的 **Tampermonkey / Violentmonkey 油猴脚本**，在你自己登录态浏览器内运行，为刷题体验提供一系列增强功能。

## ✨ 功能列表

### 🔍 搜索任意位置 (Search Anywhere)
- 任意页面右侧悬浮搜索按钮，点击弹出搜索面板
- 同时按 **题目标题** 与 **题号** 搜索（调用 vjudge 官方 `/problem/data` 接口，自动携带登录态）
- 支持「全部 / 题目 / 题号」三种搜索模式切换

### 🈶 题目语言切换 (Language Switch)
- 设置里选择首选语言（English / 中文 / 日本語 / 한국어 / Русский）
- 打开题目时自动切换到对应语言的题面版本

### 🖥️ 宽屏模式 (Wide Screen)
- 开启后打开题目自动收起左侧栏，获得更大的题面阅读空间

### 🎯 右侧动作按钮栏 (Action Rail)
- 统一的悬浮圆钮栏：`折叠` · `设置` · `搜索` · `我的收藏` · `提交` · `跳转原题` · `收藏`
- 整栏可一键折叠为一个按钮，需要时再展开
- **提交**：一键打开提交框；**跳转原题**：打开 vjudge 官方原题链接（全 OJ 通用，无需手搓 URL）

### ⭐ 自研收藏夹 (Custom Favorites)
- 插件本地存储（`GM_setValue`），支持收藏 **题目 / 题单 / 比赛 / 团队** 四类
- 独立「我的收藏」按钮查看与管理，支持删除

### 📌 吸顶标题条 (Sticky Header)
- 滚动后题目标题、时间/内存限制等属性吸顶显示，始终可读

### ⌨️ 提交语言记忆 (Submit Language Memory)
- 记住每个 OJ 上次使用的提交语言，下次自动选择**最相似**的可用语言（跨 OJ 智能匹配）

### 🌙 深色模式适配
- 跟随 vjudge 的 `data-bs-theme`，UI 自动切换深色配色

### 🎨 视觉细节
- 全部使用 Font Awesome 图标（与 vjudge 一致），无 Emoji
- 配色贴合 vjudge 风格（Bootstrap 蓝 `#0d6efd` + 中性灰白底）
- 面板弹出 / 折叠 / 收藏星标等微动效

## 📥 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome/Edge/Firefox 等）
2. 打开安装页：<https://raw.githubusercontent.com/doing-1024/vjudge-enhancer/master/vjudge-enhancer.user.js>，Tampermonkey 会提示安装
3. 或手动「新建脚本」→ 粘贴本仓库 `vjudge-enhancer.user.js` 内容 → 保存

> ⚠️ 脚本在**你已登录 vjudge 的浏览器**内运行，搜索 / 提交 / 收藏等依赖你的登录态。

## 🔄 更新

- 脚本头部包含 `@updateURL` / `@downloadURL`，指向本仓库 raw 文件，Tampermonkey 会**自动检查更新**；也可在油猴菜单手动「检查更新」
- 通过侧栏 ⚙ 设置按钮（或油猴菜单「VJudge Enhancer 设置」）调整：首选语言、宽屏开关、搜索模式

## 🧩 兼容

- 支持 `vjudge.net` / `www.vjudge.net`
- 现代浏览器 + Tampermonkey / Violentmonkey
