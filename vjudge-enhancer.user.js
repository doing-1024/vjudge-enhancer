// ==UserScript==
// @name         VJudge Enhancer
// @namespace    https://github.com/doing-1024/vjudge-enhancer
// @version      0.5.4
// @description  Search Anywhere / Language Switch / Wide Screen / Action rail / Sticky header / Custom Favorites / Submit-language memory (FA icons, dark-mode aware, dedup fixes)
// @author       doing
// @match        https://vjudge.net/*
// @match        https://www.vjudge.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/doing-1024/vjudge-enhancer/master/vjudge-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/doing-1024/vjudge-enhancer/master/vjudge-enhancer.user.js
// @homepageURL  https://github.com/doing-1024/vjudge-enhancer
// ==/UserScript==

(function () {
  'use strict';

  /* =======================================================================
   *  Config / Settings
   * ===================================================================== */
  const DEFAULTS = {
    prefLang: 'none',   // none | en | zh | ja | ko | ru  (statement version language)
    wideScreen: false,  // collapse the problem side-panel on problem pages
    searchField: 'all', // all | title | probNum | fav
    searchOJ: 'All',
  };

  const CFG = {};
  Object.keys(DEFAULTS).forEach((k) => { CFG[k] = GM_getValue(k, DEFAULTS[k]); });
  function save(k, v) { CFG[k] = v; GM_setValue(k, v); }

  // per-OJ remembered submit language (separate key per OJ)
  const langKey = (oj) => 'vje_lang_' + oj;

  /* =======================================================================
   *  DOM helpers
   * ===================================================================== */
  const $ = (sel, root = document) => (root || document).querySelector(sel);
  const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const isProblemPage = () => /^\/problem\//.test(location.pathname);

  // Wait until `check()` is truthy (SPA rendered), then run cb once.
  function onReady(check, cb, { timeout = 20000 } = {}) {
    if (check()) { cb(); return; }
    const obs = new MutationObserver(() => { if (check()) { obs.disconnect(); cb(); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    if (timeout) setTimeout(() => { if (!check()) cb(); }, timeout);
  }

  const SPA_READY = () => !!$('#top-nav') || !!$('nav.navbar') || !!$('.navbar');
  const isDark = () => document.documentElement.getAttribute('data-bs-theme') === 'dark';

  /* =======================================================================
   *  Feature 1 — Search Anywhere (floating button + panel)
   * ===================================================================== */
  const SEARCH_API = '/problem/data';
  let drawCounter = Math.floor(Math.random() * 100);

  async function vjudgeSearch(query, field) {
    if (field === 'fav') {
      const q = query.toLowerCase();
      const f = getFavs ? getFavs() : {};
      const list = (f.problem || []).filter((it) => (it.title || '').toLowerCase().includes(q));
      return list.map((it) => {
        const m = (it.key || '').match(/^([^-]+)-(.+)$/);
        return {
          originOJ: m ? m[1] : '',
          originProb: m ? m[2] : '',
          title: it.title || it.key,
          source: '',
          _favUrl: it.url,
        };
      });
    }
    const fields = field === 'all' ? ['title', 'probNum'] : [field];
    const seen = new Set();
    const out = [];
    for (const f of fields) {
      const params = new URLSearchParams({
        draw: ++drawCounter, start: 0, length: 20,
        sortDir: 'desc', sortCol: 4,
        OJId: CFG.searchOJ === 'All' ? '' : CFG.searchOJ,
        probNum: f === 'probNum' ? query : '',
        title: f === 'title' ? query : '',
        source: '', category: 'all', _: Date.now(),
      });
      try {
        const resp = await fetch(`${SEARCH_API}?${params.toString()}`, {
          method: 'GET', credentials: 'include',
          headers: { 'x-requested-with': 'XMLHttpRequest', 'accept': '*/*' },
        });
        const json = await resp.json();
        (json.data || []).forEach((it) => {
          const key = `${it.originOJ}-${it.originProb}`;
          if (seen.has(key)) return;
          seen.add(key); out.push(it);
        });
      } catch (e) { console.warn('[VJudgeEnhancer] search failed:', e); }
    }
    return out;
  }

  function buildSearchUI(root) {
    GM_addStyle(`
      #vje-root {
        --vje-primary: #0d6efd;
        --vje-primary-hover: #0b5ed7;
        --vje-dark: #373a3c;
        --vje-bg: #ffffff;
        --vje-surface: #f8f9fa;
        --vje-text: #212529;
        --vje-muted: #6c757d;
        --vje-border: #dee2e6;
        --vje-fav: #ffc107;
        --vje-fav-text: #664d03;
        --vje-chip-bg: #e7f0ff;
        --vje-chip-text: #0d6efd;
        --vje-danger: #dc3545;
        --vje-z: 2147483600;
      }
      #vje-root, #vje-root * { box-sizing: border-box; }
      #vje-root i.fa, #vje-root i.fa::before { font-family: 'FontAwesome' !important; }

      /* ----- Right-side rail ----- */
      #vje-rail { position: fixed; right: 20px; bottom: 20px; z-index: var(--vje-z);
        display: flex; flex-direction: column-reverse; gap: 12px; align-items: center; transition: gap .2s ease; }
      #vje-rail.vje-collapsed { gap: 0; }
      #vje-rail .vje-act { width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;
        background: var(--vje-primary); color: #fff; font-size: 18px; box-shadow: 0 3px 10px rgba(0,0,0,.3);
        display: flex; align-items: center; justify-content: center;
        transition: transform .15s ease, background .15s ease, opacity .2s ease, width .2s ease, height .2s ease, margin .2s ease, max-height .2s ease; }
      #vje-rail .vje-act i { transition: transform .2s ease; }
      #vje-rail .vje-act:hover { background: var(--vje-primary-hover); transform: scale(1.08); }
      #vje-rail .vje-act:active { transform: scale(.94); }
      #vje-rail .vje-act[disabled] { opacity: .4; cursor: default; transform: none; }
      #vje-rail .vje-act.vje-fav-on { background: var(--vje-fav); color: var(--vje-fav-text); }
      #vje-rail .vje-act.vje-fav-on:hover { background: #e0a800; }
      #vje-rail .vje-act.vje-pop i { animation: vje-pop .35s ease; }
      #vje-rail.vje-collapsed #vje-collapse i { transform: rotate(180deg); }
      #vje-rail.vje-collapsed .vje-act:not(#vje-collapse) {
        opacity: 0; transform: scale(.3); width: 0; height: 0; margin: 0; padding: 0; max-height: 0;
        overflow: hidden; pointer-events: none; border: none; }

      /* ----- Search panel ----- */
      #vje-panel { position: fixed; right: 84px; bottom: 20px; z-index: var(--vje-z);
        width: 380px; max-height: 70vh; background: var(--vje-bg); color: var(--vje-text);
        border: 1px solid var(--vje-border); border-radius: 12px; box-shadow: 0 10px 34px rgba(0,0,0,.18);
        display: flex; flex-direction: column; overflow: hidden;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 14px;
        opacity: 0; transform: translateY(12px) scale(.98); visibility: hidden;
        transition: opacity .18s ease, transform .18s ease, visibility .18s; }
      #vje-panel.vje-open { opacity: 1; transform: none; visibility: visible; }
      #vje-panel .vje-head { display: flex; gap: 6px; padding: 10px; border-bottom: 1px solid var(--vje-border); align-items: center; }
      #vje-panel input#vje-q { flex: 1; padding: 8px 10px; border: 1px solid var(--vje-border); border-radius: 6px; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
      #vje-panel input#vje-q:focus { border-color: var(--vje-primary); box-shadow: 0 0 0 3px rgba(13,110,253,.15); }
      #vje-panel .vje-seg { display: flex; gap: 0; margin: 0 10px 8px; }
      #vje-panel .vje-seg button { flex: 1; padding: 5px 0; border: 1px solid var(--vje-border); background: var(--vje-surface); cursor: pointer; font-size: 12px; color: var(--vje-text); transition: background .15s, color .15s; }
      #vje-panel .vje-seg button:first-child { border-radius: 6px 0 0 6px; }
      #vje-panel .vje-seg button:last-child { border-radius: 0 6px 6px 0; border-left: none; }
      #vje-panel .vje-seg button.active { background: var(--vje-primary); color: #fff; border-color: var(--vje-primary); }
      #vje-panel .vje-results { overflow-y: auto; padding: 4px 0; }
      #vje-panel .vje-item { display: block; padding: 8px 12px; text-decoration: none; color: var(--vje-text); border-bottom: 1px solid #f2f2f2; transition: background .12s; }
      #vje-panel .vje-item:hover { background: #f0f6ff; }
      #vje-panel .vje-oj { display: inline-block; font-size: 11px; font-weight: 700; color: var(--vje-chip-text); background: var(--vje-chip-bg); border-radius: 4px; padding: 1px 6px; margin-right: 6px; }
      #vje-panel .vje-title { font-weight: 600; }
      #vje-panel .vje-src { color: var(--vje-muted); font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #vje-panel .vje-empty { padding: 16px; color: #999; text-align: center; }

      /* ----- Sticky header ----- */
      #vje-sticky { position: fixed; left: 0; right: 0; top: 0; z-index: 2147483580; display: none;
        align-items: center; gap: 12px; padding: 7px 16px; background: rgba(255,255,255,.96); color: var(--vje-text);
        border-bottom: 1px solid var(--vje-border); box-shadow: 0 2px 8px rgba(0,0,0,.08);
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 14px;
        animation: vje-drop .2s ease; }
      #vje-sticky .vje-sticky-title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
      #vje-sticky .vje-sticky-prop { display: inline-flex; align-items: center; background: var(--vje-surface);
        border-radius: 12px; padding: 2px 10px; font-size: 12px; color: var(--vje-muted); white-space: nowrap; }

      /* ----- Favorites manager ----- */
      #vje-fav { position: fixed; right: 84px; bottom: 20px; z-index: calc(var(--vje-z) + 1); width: 360px; max-height: 72vh;
        background: var(--vje-bg); color: var(--vje-text); border: 1px solid var(--vje-border); border-radius: 12px;
        box-shadow: 0 10px 34px rgba(0,0,0,.22); padding: 14px; display: flex; flex-direction: column; overflow: hidden;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 14px;
        opacity: 0; transform: translateY(12px) scale(.98); visibility: hidden;
        transition: opacity .18s ease, transform .18s ease, visibility .18s; }
      #vje-fav.vje-open { opacity: 1; transform: none; visibility: visible; }
      #vje-fav h3 { margin: 0 0 10px; font-size: 16px; }
      #vje-fav .vje-fav-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
      #vje-fav .vje-fav-tabs button { flex: 1; padding: 5px 0; border: 1px solid var(--vje-border); background: var(--vje-surface);
        cursor: pointer; font-size: 12px; color: var(--vje-text); border-radius: 6px; transition: background .15s, color .15s; }
      #vje-fav .vje-fav-tabs button.active { background: var(--vje-primary); color: #fff; border-color: var(--vje-primary); }
      #vje-fav .vje-fav-list { overflow-y: auto; flex: 1; }
      #vje-fav .vje-fav-item { display: flex; align-items: center; gap: 6px; padding: 6px 4px; border-bottom: 1px solid #f2f2f2; }
      #vje-fav .vje-fav-item a { flex: 1; color: var(--vje-primary); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #vje-fav .vje-fav-item a:hover { text-decoration: underline; }
      #vje-fav .vje-fav-del { border: none; background: none; cursor: pointer; color: var(--vje-danger); font-size: 14px; transition: transform .12s; }
      #vje-fav .vje-fav-del:hover { transform: scale(1.2); }
      #vje-fav .vje-empty { padding: 16px; color: #999; text-align: center; }
      #vje-fav .vje-close { float: right; cursor: pointer; border: none; background: none; font-size: 18px; color: var(--vje-muted); }

      /* ----- Settings ----- */
      #vje-settings { position: fixed; right: 84px; bottom: 20px; z-index: calc(var(--vje-z) + 2); width: 320px;
        background: var(--vje-bg); color: var(--vje-text); border: 1px solid var(--vje-border); border-radius: 12px;
        box-shadow: 0 10px 34px rgba(0,0,0,.22); padding: 16px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 14px;
        opacity: 0; transform: translateY(12px) scale(.98); visibility: hidden;
        transition: opacity .18s ease, transform .18s ease, visibility .18s; }
      #vje-settings.vje-open { opacity: 1; transform: none; visibility: visible; }
      #vje-settings h3 { margin: 0 0 12px; font-size: 16px; }
      #vje-settings label { display: block; margin: 10px 0 4px; font-weight: 600; }
      #vje-settings select { width: 100%; padding: 6px; border: 1px solid var(--vje-border); border-radius: 6px; color: var(--vje-text); background: #fff; }
      #vje-settings .vje-row { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
      #vje-settings .vje-close { float: right; cursor: pointer; border: none; background: none; font-size: 18px; color: var(--vje-muted); }
      #vje-settings .vje-hint { color: var(--vje-muted); font-size: 12px; margin-top: 2px; }
      #vje-settings .vje-favmgr { width: 100%; margin-top: 12px; padding: 8px; border: 1px solid var(--vje-primary);
        background: var(--vje-chip-bg); color: var(--vje-primary); border-radius: 6px; cursor: pointer; font-weight: 600; transition: background .15s; }
      #vje-settings .vje-favmgr:hover { background: #d4e6ff; }

      /* ----- Toast ----- */
      #vje-toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%) translateY(20px);
        z-index: calc(var(--vje-z) + 3); background: rgba(33,37,41,.94); color: #fff; padding: 9px 18px; border-radius: 999px;
        font-family: system-ui, sans-serif; font-size: 14px; opacity: 0; transition: .25s; pointer-events: none; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
      #vje-toast.vje-show { opacity: 1; transform: translateX(-50%) translateY(0); }

      @keyframes vje-pop { 0%{transform:scale(1)} 40%{transform:scale(1.45)} 100%{transform:scale(1)} }
      @keyframes vje-drop { from{transform:translateY(-100%);opacity:0} to{transform:none;opacity:1} }

      /* ----- Dark mode ----- */
      #vje-root.vje-dark {
        --vje-bg: #212529; --vje-surface: #2b3035; --vje-text: #e9ecef; --vje-muted: #adb5bd;
        --vje-border: #495057; --vje-chip-bg: #14304d; --vje-chip-text: #8ec5ff; --vje-dark: #212529;
      }
      #vje-root.vje-dark #vje-panel, #vje-root.vje-dark #vje-fav, #vje-root.vje-dark #vje-settings {
        background: #212529; color: #e9ecef; box-shadow: 0 10px 34px rgba(0,0,0,.55); border-color: #495057; }
      #vje-root.vje-dark #vje-panel input#vje-q, #vje-root.vje-dark #vje-settings select {
        background: #2b3035; color: #e9ecef; border-color: #495057; }
      #vje-root.vje-dark #vje-panel .vje-seg button, #vje-root.vje-dark #vje-fav .vje-fav-tabs button {
        background: #2b3035; color: #e9ecef; border-color: #495057; }
      #vje-root.vje-dark #vje-panel .vje-seg button.active, #vje-root.vje-dark #vje-fav .vje-fav-tabs button.active { background: var(--vje-primary); color: #fff; }
      #vje-root.vje-dark #vje-panel .vje-item { color: #e9ecef; border-bottom-color: #343a40; }
      #vje-root.vje-dark #vje-panel .vje-item:hover { background: #2a3550; }
      #vje-root.vje-dark #vje-panel .vje-oj { background: var(--vje-chip-bg); color: var(--vje-chip-text); }
      #vje-root.vje-dark #vje-panel .vje-src { color: #adb5bd; }
      #vje-root.vje-dark #vje-panel .vje-empty { color: #888; }
      #vje-root.vje-dark #vje-rail .vje-act { background: #3a7bd5; }
      #vje-root.vje-dark #vje-rail .vje-act:hover { background: #2f6bc0; }
      #vje-root.vje-dark #vje-rail .vje-act.vje-fav-on { background: var(--vje-fav); color: var(--vje-fav-text); }
      #vje-root.vje-dark #vje-sticky { background: rgba(33,37,41,.96); color: #e9ecef; border-bottom-color: #495057; }
      #vje-root.vje-dark #vje-sticky .vje-sticky-prop { background: #343a40; color: #ced4da; }
      #vje-root.vje-dark #vje-fav .vje-fav-item { border-bottom-color: #343a40; }
      #vje-root.vje-dark #vje-fav .vje-fav-item a { color: var(--vje-chip-text); }
      #vje-root.vje-dark #vje-fav .vje-empty { color: #888; }
      #vje-root.vje-dark #vje-settings .vje-hint { color: #adb5bd; }
      #vje-root.vje-dark #vje-settings .vje-favmgr { background: #14304d; color: #8ec5ff; border-color: #2b6cb0; }
    `);

    // ---- Right-side rail (unified, aligned round buttons) ----
    const rail = document.createElement('div');
    rail.id = 'vje-rail';
    const collapse = document.createElement('button');
    collapse.id = 'vje-collapse'; collapse.className = 'vje-act';
    collapse.title = '折叠 / 展开侧边按钮';
    collapse.innerHTML = '<i class="fa fa-chevron-down" aria-hidden="true"></i>';
    collapse.addEventListener('click', () => {
      const c = rail.classList.toggle('vje-collapsed');
      collapse.querySelector('i').className = c ? 'fa fa-chevron-up' : 'fa fa-chevron-down';
    });
    rail.appendChild(collapse);
    const setBtn = document.createElement('button');
    setBtn.className = 'vje-act'; setBtn.id = 'vje-settings-btn'; setBtn.title = '设置';
    setBtn.innerHTML = '<i class="fa fa-cog" aria-hidden="true"></i>';
    setBtn.addEventListener('click', () => openSettings());
    rail.appendChild(setBtn);
    const search = document.createElement('button');
    search.className = 'vje-act'; search.id = 'vje-search'; search.title = 'VJudge 搜索 (任何地方)';
    search.innerHTML = '<i class="fa fa-search" aria-hidden="true"></i>';
    rail.appendChild(search);
    const favListBtn = document.createElement('button');
    favListBtn.className = 'vje-act'; favListBtn.id = 'vje-favlist-btn'; favListBtn.title = '我的收藏';
    favListBtn.innerHTML = '<i class="fa fa-folder-open" aria-hidden="true"></i>';
    favListBtn.addEventListener('click', () => openFavManager());
    rail.appendChild(favListBtn);
    root.appendChild(rail);

    const panel = document.createElement('div');
    panel.id = 'vje-panel';
    panel.innerHTML = `
      <div class="vje-head">
        <input id="vje-q" type="text" placeholder="搜索题目标题或题号…" autocomplete="off">
      </div>
      <div class="vje-seg" id="vje-seg">
        <button data-f="all" class="${CFG.searchField === 'all' ? 'active' : ''}">全部</button>
        <button data-f="title" class="${CFG.searchField === 'title' ? 'active' : ''}">题目</button>
        <button data-f="probNum" class="${CFG.searchField === 'probNum' ? 'active' : ''}">题号</button>
        <button data-f="fav" class="${CFG.searchField === 'fav' ? 'active' : ''}">收藏夹内</button>
      </div>
      <div class="vje-results" id="vje-results"></div>`;
    root.appendChild(panel);

    const input = $('#vje-q', panel);
    const results = $('#vje-results', panel);
    const seg = $('#vje-seg', panel);

    search.addEventListener('click', () => {
      const wasOpen = panel.classList.contains('vje-open');
      if (!wasOpen) closeWindows('vje-panel');
      panel.classList.toggle('vje-open', !wasOpen);
      if (!wasOpen) setTimeout(() => input.focus(), 50);
    });

    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      save('searchField', b.dataset.f);
      $$('button', seg).forEach((x) => x.classList.toggle('active', x === b));
    });

    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (!q) { results.innerHTML = ''; return; }
      t = setTimeout(async () => {
        results.innerHTML = '<div class="vje-empty">搜索中…</div>';
        const items = await vjudgeSearch(q, CFG.searchField);
        if (!items.length) { results.innerHTML = '<div class="vje-empty">无结果</div>'; return; }
        results.innerHTML = items.map((it) => {
          const url = it._favUrl || `/problem/${it.originOJ}-${it.originProb}`;
          const src = (it.source || '').replace(/<[^>]+>/g, '');
          const oj = it._favUrl ? it.originOJ : it.originOJ;
          const title = it.title || it.originProb || '';
          return `<a class="vje-item" href="${url}">
            <span class="vje-oj">${oj}</span>
            <span class="vje-title">${title}</span>
            <div class="vje-src">${src}</div></a>`;
        }).join('');
      }, 300);
    });
    results.addEventListener('click', (e) => {
      if (e.target.closest('a.vje-item')) panel.classList.remove('vje-open');
    });
  }

  /* =======================================================================
   *  Feature 2 — Language Switch (statement version)
   * ===================================================================== */
  function applyLanguage() {
    if (CFG.prefLang === 'none') return;
    const items = $$('#prob-descs .problem-description-item');
    if (!items.length) return;
    const active = items.find((li) => li.classList.contains('active'));
    if (active && active.getAttribute('data-lang') === CFG.prefLang) return;
    const target = items.find((li) => {
      const l = li.getAttribute('data-lang') || '';
      return l === CFG.prefLang || l.startsWith(CFG.prefLang);
    });
    if (target) { target.click(); console.log('[VJudgeEnhancer] statement language ->', CFG.prefLang); }
  }

  /* =======================================================================
   *  Feature 3 — Wide Screen Mode
   * ===================================================================== */
  function applyWideScreen() {
    if (!CFG.wideScreen) return;
    const tg = $('.page-panel-desktop-toggle');
    if (!tg) return;
    if (tg.getAttribute('data-panel-mode') === 'docked') tg.click();
  }

  /* =======================================================================
   *  Feature 4 — Custom Favorites (plugin-built, local storage)
   *  Categories: problem / workbook / contest / team
   * ===================================================================== */
  const FAV_KEY = 'vje_fav';
  function getFavs() {
    try {
      const o = GM_getValue(FAV_KEY, null);
      if (o && typeof o === 'object') return Object.assign({ problem: [], workbook: [], contest: [], team: [] }, o);
    } catch (e) {}
    return { problem: [], workbook: [], contest: [], team: [] };
  }
  function setFavs(o) { GM_setValue(FAV_KEY, o); }
  function isFav(e) { return getFavs()[e.cat].some((x) => x.key === e.key); }
  function toggleFav(e) {
    const f = getFavs(); const arr = f[e.cat];
    const i = arr.findIndex((x) => x.key === e.key);
    let added;
    if (i >= 0) { arr.splice(i, 1); added = false; }
    else { arr.push({ key: e.key, title: e.title, url: e.url, ts: Date.now() }); added = true; }
    setFavs(f);
    return added;
  }

  // What entity is the current page? null if not a favoritable page.
  function currentEntity() {
    const path = location.pathname;
    const pm = path.match(/^\/problem\/([^-]+)-(.+)$/);
    if (pm) {
      const oj = pm[1], prob = pm[2];
      const h2 = $('#prob-title h2');
      const title = h2 ? h2.textContent.replace(/[\uF000-\uF0FF]/g, '').trim() : (oj + '-' + prob);
      return { cat: 'problem', key: oj + '-' + prob, oj, prob, title, url: location.href };
    }
    let m;
    const clean = (t) => t.replace(/\s*[-|]\s*virtual judge.*$/i, '').replace(/\s*[-|]\s*vjudge.*$/i, '').trim();
    if ((m = path.match(/^\/(?:workbook|workbooks)\/(.+)$/))) return { cat: 'workbook', key: m[1], title: clean(document.title), url: location.href };
    if ((m = path.match(/^\/contest\/(.+)$/))) return { cat: 'contest', key: m[1], title: clean(document.title), url: location.href };
    if ((m = path.match(/^\/(?:group|team)\/(.+)$/))) return { cat: 'team', key: m[1], title: clean(document.title), url: location.href };
    return null;
  }

  let favBtn = null;
  function updateFavBtn() {
    if (!favBtn) return;
    const e = currentEntity();
    const on = !!(e && isFav(e));
    favBtn.classList.toggle('vje-fav-on', on);
    const ic = favBtn.querySelector('i');
    if (ic) {
      ic.className = on ? 'fa fa-star' : 'fa fa-star-o';
      // star pop animation (re-trigger even on repeated toggles)
      ic.classList.remove('vje-pop');
      void ic.offsetWidth;
      ic.classList.add('vje-pop');
    }
  }

  function buildOriginalUrl(oj, prob) {
    const a = $('#prob-title span.origin a') || document.querySelector('#prob-title .origin a');
    if (a) return a.getAttribute('href');
    oj = (oj || '').toLowerCase();
    if (oj === 'atcoder') {
      const a2 = $('#prob-properties a.contest-title') || document.querySelector('a.contest-title');
      if (a2) return a2.getAttribute('href').replace(/\/$/, '') + '/tasks/' + prob;
      return 'https://atcoder.jp/';
    }
    if (oj === 'codeforces') {
      const mm = (prob || '').match(/^(\d+)([A-Za-z]\d*)$/);
      if (mm) return `https://codeforces.com/problemset/problem/${mm[1]}/${mm[2]}`;
      return 'https://codeforces.com/';
    }
    if (oj === 'poj') return `http://poj.org/problem?id=${prob}`;
    const link = $('#prob-properties a[href*="atcoder.jp"], #prob-properties a[href*="codeforces.com"], #prob-properties a[href*="poj.org"]');
    if (link) return link.getAttribute('href');
    return null;
  }

  function buildActionButtons(root) {
    if ($('#vje-submit-btn') || $('#vje-origin-btn') || $('#vje-fav-btn')) return;
    const rail = $('#vje-rail'); if (!rail) return;

    const oj = (location.pathname.match(/^\/problem\/([^-]+)-/) || [])[1];
    const prob = (location.pathname.match(/^\/problem\/[^-]+-(.+)$/) || [])[1];

    if (isProblemPage() && oj && prob) {
      const b1 = document.createElement('button');
      b1.className = 'vje-act'; b1.id = 'vje-submit-btn'; b1.title = '提交';
      b1.innerHTML = '<i class="fa fa-upload" aria-hidden="true"></i>';
      b1.onclick = () => { const s = document.getElementById('btn-submit'); if (s) s.click(); };
      rail.appendChild(b1);

      const url = buildOriginalUrl(oj, prob);
      const b2 = document.createElement('button');
      b2.className = 'vje-act'; b2.id = 'vje-origin-btn'; b2.title = url ? '跳转原题' : '无原题链接';
      b2.innerHTML = '<i class="fa fa-external-link" aria-hidden="true"></i>';
      if (!url) b2.disabled = true;
      b2.onclick = () => { if (url) window.open(url, '_blank'); else toast('暂不支持该OJ原题跳转'); };
      rail.appendChild(b2);
    }

    const entity = currentEntity();
    if (entity) {
      const b3 = document.createElement('button');
      b3.className = 'vje-act'; b3.id = 'vje-fav-btn'; b3.title = '收藏 (当前' +
        ({ problem: '题目', workbook: '题单', contest: '比赛', team: '团队' }[entity.cat]) + ')';
      b3.innerHTML = '<i class="fa fa-star-o" aria-hidden="true"></i>';
      b3.onclick = () => {
        const e = currentEntity(); if (!e) return;
        const added = toggleFav(e);
        updateFavBtn();
        toast(added ? '已收藏' : '已取消收藏');
      };
      rail.appendChild(b3);
      favBtn = b3;
      updateFavBtn();
    }
  }

  function buildFavManager(root) {
    if ($('#vje-fav')) return;
    const box = document.createElement('div');
    box.id = 'vje-fav';
    box.innerHTML = `
      <button class="vje-close" id="vje-fav-close"><i class="fa fa-times"></i></button>
      <h3>我的收藏</h3>
      <div class="vje-fav-tabs" id="vje-fav-tabs">
        <button data-c="problem" class="active">题目</button>
        <button data-c="workbook">题单</button>
        <button data-c="contest">比赛</button>
        <button data-c="team">团队</button>
      </div>
      <div class="vje-fav-list" id="vje-fav-list"></div>`;
    root.appendChild(box);
    $('#vje-fav-close', box).addEventListener('click', () => box.classList.remove('vje-open'));
    const tabs = $('#vje-fav-tabs', box);
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-c]'); if (!b) return;
      $$('button', tabs).forEach((x) => x.classList.toggle('active', x === b));
      renderFav(b.dataset.c);
    });
  }
  function openFavManager() {
    const box = $('#vje-fav'); if (!box) return;
    closeWindows('vje-fav');
    box.classList.add('vje-open'); renderFav('problem');
  }
  function renderFav(cat) {
    const list = $('#vje-fav-list'); if (!list) return;
    const arr = getFavs()[cat] || [];
    if (!arr.length) { list.innerHTML = '<div class="vje-empty">暂无收藏</div>'; return; }
    list.innerHTML = arr.map((it, i) =>
      `<div class="vje-fav-item"><a href="${it.url}" target="_blank" title="${escapeHtml(it.title)}">${escapeHtml(it.title || it.key)}</a>` +
      `<button class="vje-fav-del" data-c="${cat}" data-i="${i}" title="删除"><i class="fa fa-times"></i></button></div>`
    ).join('');
  }

  /* =======================================================================
   *  Feature 5 — Sticky header (title + time/memory limits)
   * ===================================================================== */
  function updateStickyContent() {
    const bar = $('#vje-sticky'); if (!bar) return;
    const h2 = $('#prob-title h2');
    const title = h2 ? h2.textContent.replace(/[\uF000-\uF0FF]/g, '').trim() : '题目';
    const dts = $$('#prob-properties dt');
    const dds = $$('#prob-properties dd');
    const props = [];
    for (let i = 0; i < dts.length && i < dds.length; i++) {
      const k = dts[i].textContent.trim(), v = dds[i].textContent.trim();
      if (k && v) props.push(`${k}: ${v}`);
    }
    bar.innerHTML = `<span class="vje-sticky-title">${escapeHtml(title)}</span>` +
      props.map((p) => `<span class="vje-sticky-prop">${escapeHtml(p)}</span>`).join('');
  }
  function buildStickyBar(root) {
    if ($('#vje-sticky')) { updateStickyContent(); return; }
    const bar = document.createElement('div');
    bar.id = 'vje-sticky';
    root.appendChild(bar);
    const nav = $('#top-nav') || $('.navbar');
    bar.style.top = '0px';
    const onScroll = () => { bar.style.display = window.scrollY > 160 ? 'flex' : 'none'; };
    window.addEventListener('scroll', onScroll, { passive: true });
    updateStickyContent();
    onScroll();
  }

  /* =======================================================================
   *  Feature 6 — Submit-language memory (per OJ, pick most-similar)
   * ===================================================================== */
  function getStoredLang(oj) { return GM_getValue(langKey(oj), ''); }
  function storeLang(oj, text) { if (oj && text) GM_setValue(langKey(oj), text); }

  function sigOf(name) {
    const n = name.toLowerCase();
    let fam = 'other';
    if (/c\+\+|\+\+/.test(n) || /gnu c\+\+/.test(n) || /g\+\+/.test(n)) fam = 'cpp';
    else if (/c#|c sharp/.test(n)) fam = 'csharp';
    else if (/\bc\b(?![\w+])/.test(n)) fam = 'c';
    else if (/java/.test(n)) fam = 'java';
    else if (/python/.test(n)) fam = 'python';
    else if (/pascal/.test(n)) fam = 'pascal';
    else if (/ruby/.test(n)) fam = 'ruby';
    else if (/\bgo\b/.test(n)) fam = 'go';
    else if (/rust/.test(n)) fam = 'rust';
    else if (/kotlin/.test(n)) fam = 'kotlin';
    else if (/swift/.test(n)) fam = 'swift';
    else if (/perl/.test(n)) fam = 'perl';
    else if (/php/.test(n)) fam = 'php';
    else if (/javascript|node/.test(n)) fam = 'js';
    else if (/typescript/.test(n)) fam = 'ts';
    else if (/haskell/.test(n)) fam = 'haskell';
    else if (/ocaml/.test(n)) fam = 'ocaml';
    else if (/lua/.test(n)) fam = 'lua';
    else if (/scala/.test(n)) fam = 'scala';
    const ver = (n.match(/\d{2}/) || [])[0] || '';
    let compiler = '';
    if (/gnu/.test(n)) compiler = 'gnu';
    else if (/clang/.test(n)) compiler = 'clang';
    else if (/gcc/.test(n)) compiler = 'gcc';
    else if (/msvc|visual/.test(n)) compiler = 'msvc';
    return { fam, ver, compiler, ioi: /ioi/.test(n), raw: name };
  }
  function scoreLang(p, n) {
    if (p.fam !== n.fam) return -1;
    let s = 1000;
    if (p.ver && n.ver) {
      const d = parseInt(n.ver, 10) - parseInt(p.ver, 10);
      s += (d >= 0 ? 80 - Math.min(80, Math.abs(d) * 8) : 40 - Math.abs(d) * 4);
    } else if (p.ver) s += 10;
    if (p.compiler && n.compiler === p.compiler) s += 40;
    if (p.ioi && n.ioi) s += 15;
    return s;
  }
  function matchLang(pref, opts) {
    const psig = sigOf(pref);
    let best = null, bestScore = 0;
    for (const o of opts) {
      const sc = scoreLang(psig, sigOf(o.name));
      if (sc > bestScore) { bestScore = sc; best = o; }
    }
    return best;
  }
  function applyLangMemory() {
    const oj = (location.pathname.match(/^\/problem\/([^-]+)-/) || [])[1];
    if (!oj) return;
    const pref = getStoredLang(oj);
    if (!pref) return;
    const sel = document.getElementById('submit-language');
    if (!sel) return;
    const opts = Array.from(sel.options).filter((o) => o.value).map((o) => ({ id: o.value, name: o.text }));
    if (!opts.length) return;
    const best = matchLang(pref, opts);
    if (!best) return;
    const picker = document.querySelector('.submit-language-picker');
    if (picker) picker.click();
    setTimeout(() => {
      const btn = document.querySelector(`.submit-language-menu .submit-language-option[data-value="${best.id}"]`);
      if (btn) btn.click();
      if (sel.value !== best.id) { sel.value = best.id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }, 200);
  }
  function setupLangMemory() {
    const oj = (location.pathname.match(/^\/problem\/([^-]+)-/) || [])[1];
    if (!oj) return;
    const capture = () => {
      const sel = document.getElementById('submit-language');
      if (sel && sel.value) storeLang(oj, sel.options[sel.selectedIndex].text);
    };
    const sel = document.getElementById('submit-language');
    if (sel) sel.addEventListener('change', capture);
    const submitBtn = $('#submit-form [type="submit"]') || $('#submitModal [type="submit"]');
    if (submitBtn) submitBtn.addEventListener('click', () => setTimeout(capture, 0));
    const sm = document.getElementById('submitModal');
    if (sm) {
      new MutationObserver(() => { if (sm.classList.contains('show')) setTimeout(applyLangMemory, 350); })
        .observe(sm, { attributes: true, attributeFilter: ['class'] });
    }
    const bs = document.getElementById('btn-submit');
    if (bs) bs.addEventListener('click', () => setTimeout(applyLangMemory, 650));
  }

  /* =======================================================================
   *  Toast
   * ===================================================================== */
  function toast(msg) {
    let t = $('#vje-toast');
    if (!t) { t = document.createElement('div'); t.id = 'vje-toast'; (document.body || document.documentElement).appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('vje-show'));
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('vje-show'), 1800);
  }

  /* =======================================================================
   *  Settings panel
   * ===================================================================== */
  function openSettings() {
    const existing = $('#vje-settings');
    if (existing) {
      const wasOpen = existing.classList.contains('vje-open');
      if (!wasOpen) closeWindows('vje-settings');
      existing.classList.toggle('vje-open', !wasOpen);
      return;
    }    const box = document.createElement('div');
    box.id = 'vje-settings';
    box.innerHTML = `
      <button class="vje-close" id="vje-set-close"><i class="fa fa-times"></i></button>
      <h3>VJudge Enhancer 设置</h3>
      <label>首选题目语言 (Language Switch)</label>
      <select id="vje-opt-lang">
        <option value="none">不自动切换</option>
        <option value="en">English</option>
        <option value="zh">中文 (Chinese)</option>
        <option value="ja">日本語 (Japanese)</option>
        <option value="ko">한국어 (Korean)</option>
        <option value="ru">Русский (Russian)</option>
      </select>
      <div class="vje-hint">打开题目时自动切换到该语言的题面版本</div>
      <div class="vje-row">
        <input type="checkbox" id="vje-opt-wide">
        <label style="margin:0;font-weight:600;">宽屏模式 (Wide Screen)</label>
      </div>
      <div class="vje-hint">启用后打开题目自动收起侧栏</div>`;
    (document.getElementById('vje-root') || document.body).appendChild(box);
    closeWindows('vje-settings');
    box.classList.add('vje-open');
    const langSel = $('#vje-opt-lang', box);
    const wideChk = $('#vje-opt-wide', box);
    langSel.value = CFG.prefLang; wideChk.checked = !!CFG.wideScreen;
    langSel.addEventListener('change', () => { save('prefLang', langSel.value); if (isProblemPage()) applyLanguage(); });
    wideChk.addEventListener('change', () => { save('wideScreen', wideChk.checked); if (isProblemPage()) applyWideScreen(); });
    $('#vje-set-close', box).addEventListener('click', () => box.classList.remove('vje-open'));
  }

  /* =======================================================================
   *  Bootstrap
   * ===================================================================== */
  function applyTheme(root) { root.classList.toggle('vje-dark', isDark()); }

  function mountRoot() {
    let root = $('#vje-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'vje-root';
      root.vjeManaged = true;
      (document.body || document.documentElement).appendChild(root);
      buildSearchUI(root);
      buildActionButtons(root);
      buildFavManager(root);
      applyTheme(root);
    }
    vjeDedupe();
    return root;
  }

  function straySweeper() {
    const root = $('#vje-root'); if (!root) return;
    document.querySelectorAll('[id^="vje-"], [class*="vje-"]').forEach((el) => {
      if (el !== root && !root.contains(el)) el.remove();
    });
  }

  function vjeDedupe() {
    const roots = document.querySelectorAll('#vje-root');
    if (roots.length <= 1) return;
    let primary = null;
    roots.forEach((r) => {
      const score = r.querySelectorAll('[id^="vje-"], .vje-act, .vje-open').length;
      if (!primary || score > primary._vjeScore) { primary = r; primary._vjeScore = score; }
    });
    if (!primary) primary = roots[0];
    roots.forEach((r) => { if (r !== primary) r.remove(); });
  }

  const themeObs = new MutationObserver(() => { const root = $('#vje-root'); if (root) applyTheme(root); });
  let _wdt = null;
  const watchdog = new MutationObserver(() => {
    clearTimeout(_wdt);
    _wdt = setTimeout(() => {
      if (!document.getElementById('vje-root')) mountRoot();
      else vjeDedupe();
    }, 120);
  });

  // global (once) click delegate for favorites delete
  function closeWindows(except) {
    ['vje-panel', 'vje-settings', 'vje-fav'].forEach((id) => {
      if (id === except) return;
      const el = document.getElementById(id);
      if (el) el.classList.remove('vje-open');
    });
  }

  // click outside any window closes it
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const inWin = t.closest('#vje-panel, #vje-settings, #vje-fav');
    const inTrigger = t.closest('#vje-search, #vje-settings-btn, #vje-favlist-btn');
    if (!inWin && !inTrigger) closeWindows();
  });

  document.addEventListener('click', (e) => {
    const d = e.target.closest('.vje-fav-del');
    if (d) {
      const f = getFavs(); f[d.dataset.c].splice(+d.dataset.i, 1); setFavs(f);
      renderFav(d.dataset.c); updateFavBtn();
    }
  });

  function init() {
    onReady(SPA_READY, () => {
      const root = mountRoot();
      applyTheme(root);
      watchdog.observe(document.body || document.documentElement, { childList: true, subtree: false });
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
      setInterval(() => { vjeDedupe(); straySweeper(); }, 1500);

      if (isProblemPage()) {
        buildStickyBar(root);
        setupLangMemory();
        onReady(() => $('#prob-descs'), () => {
          applyLanguage(); applyWideScreen(); buildStickyBar(root); updateFavBtn();
          const pd = $('#prob-descs');
          if (pd) new MutationObserver(() => { applyLanguage(); applyWideScreen(); updateFavBtn(); buildStickyBar(root); }).observe(pd, { childList: true, subtree: false });
        }, { timeout: 20000 });
        setTimeout(() => { applyLanguage(); applyWideScreen(); }, 3000);
      }
    }, { timeout: 20000 });
    GM_registerMenuCommand('VJudge Enhancer 设置', openSettings);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
