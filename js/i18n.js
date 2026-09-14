/* ============================================================
   Potato Corner Promotion System — Thai/English i18n engine
   ------------------------------------------------------------
   Thai is the canonical (authored) language. Switching to EN
   translates every Thai UI string to English via PC_I18N_DICT;
   switching back to TH restores the original authored text.

   Branch / item proper nouns are intentionally NOT in the dict
   (they already render in dedicated EN + TH columns), so they
   pass through untouched in both languages.

   A MutationObserver re-translates anything rendered after a
   page load (async tables, SweetAlert modals, etc.).
   ============================================================ */
(function () {
  var DICT = window.PC_I18N_DICT || {};
  var THAI = /[\u0E00-\u0E7F]/;

  /* exact full-string map (any length) + long-key substring list (len >= 4) */
  var EXACT = new Map();
  var LONGKEYS = [];
  var REVERSE = new Map();   // EN value -> TH key (exact whole-string only; first wins)
  Object.keys(DICT).forEach(function (k) {
    EXACT.set(k, DICT[k]);
    if (k.length >= 4) LONGKEYS.push([k, DICT[k]]);
    var v = DICT[k];
    if (typeof v === 'string' && !REVERSE.has(v)) REVERSE.set(v, k);
  });
  LONGKEYS.sort(function (a, b) { return b[0].length - a[0].length; });

  function getLang() { return localStorage.getItem('pc_lang') || 'TH'; }

  /* translate a Thai (authored) string to English */
  function toEN(orig) {
    if (!THAI.test(orig)) return orig;            // no Thai → nothing to do
    var t = orig.trim();
    if (EXACT.has(t)) {                            // whole-string match (preserve outer spaces)
      return orig.replace(t, EXACT.get(t));
    }
    var out = orig;                                // fragment fallback (longest first)
    for (var i = 0; i < LONGKEYS.length; i++) {
      var k = LONGKEYS[i][0];
      if (out.indexOf(k) !== -1) out = out.split(k).join(LONGKEYS[i][1]);
    }
    return out;
  }

  /* translate an English (non-Thai) UI string back to Thai (the canonical text).
     Exact whole-string match ONLY — substring reverse on English would corrupt
     overlapping words. Anything not in the dict (entered data, proper nouns,
     branch/item names, codes, prices, brand names) is left untouched. */
  function toTH(orig) {
    if (THAI.test(orig)) return orig;             // already canonical Thai → keep
    var t = orig.trim();
    if (t && REVERSE.has(t)) return orig.replace(t, REVERSE.get(t));
    return orig;                                   // unknown → keep original (entered data)
  }

  /* ---- originals storage ---- */
  var ORIG = new WeakMap();      // textNode -> authored string
  var ORIGATTR = new WeakMap();  // element  -> { attr: authored string }

  function applyTextNode(n) {
    if (!ORIG.has(n)) ORIG.set(n, n.nodeValue);
    var orig = ORIG.get(n);
    var v = (window.PC_LANG === 'EN') ? toEN(orig) : toTH(orig);
    if (n.nodeValue !== v) n.nodeValue = v;
  }

  function applyAttr(el, attr) {
    if (!el.hasAttribute(attr)) return;
    var store = ORIGATTR.get(el);
    if (!store) { store = {}; ORIGATTR.set(el, store); }
    if (store[attr] === undefined) store[attr] = el.getAttribute(attr);
    var orig = store[attr];
    var v = (window.PC_LANG === 'EN') ? toEN(orig) : toTH(orig);
    if (el.getAttribute(attr) !== v) el.setAttribute(attr, v);
  }

  /* elements that carry their own bilingual copy (sidebar nav, tagged chrome) */
  function applyDataAttr(el) {
    var v = (window.PC_LANG === 'EN')
      ? el.getAttribute('data-en')
      : (el.getAttribute('data-th') || el.getAttribute('data-en'));
    if (v != null && el.textContent !== v) el.textContent = v;
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };

  function walk(node) {
    if (node.nodeType === 3) { applyTextNode(node); return; }
    if (node.nodeType !== 1) return;
    if (SKIP[node.nodeName]) return;
    if (node.hasAttribute('data-en') || node.hasAttribute('data-th')) {
      applyDataAttr(node);
      return; // owns its own text
    }
    if (node.hasAttribute('placeholder')) applyAttr(node, 'placeholder');
    if (node.hasAttribute('title')) applyAttr(node, 'title');
    var c = node.firstChild;
    while (c) { var next = c.nextSibling; walk(c); c = next; }
  }

  /* ---- observer (paused during our own writes) ---- */
  var observer = null;
  var observing = false;
  function connect() {
    if (!observer || observing) return;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    observing = true;
  }
  function disconnect() {
    if (!observer || !observing) return;
    observer.disconnect();
    observing = false;
  }

  function onMutations(muts) {
    disconnect();
    try {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') {
          ORIG.set(m.target, m.target.nodeValue); // app set new authored text
          applyTextNode(m.target);
        } else {
          for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        }
      }
    } finally {
      if (observer) observer.takeRecords();
      connect();
    }
  }

  /* ---- public API ---- */
  function applyLang() {
    window.PC_LANG = getLang();
    disconnect();
    try {
      // tagged bilingual elements anywhere in the document
      var tagged = document.querySelectorAll('[data-en]');
      for (var i = 0; i < tagged.length; i++) applyDataAttr(tagged[i]);
      // everything else
      if (document.body) walk(document.body);
      // language toggle button state
      var en = document.getElementById('langEN'), th = document.getElementById('langTH');
      if (en && th) {
        en.classList.toggle('active', window.PC_LANG === 'EN');
        th.classList.toggle('active', window.PC_LANG === 'TH');
      }
    } finally {
      if (observer) observer.takeRecords();
      connect();
    }
  }

  function setLang(lang) {
    localStorage.setItem('pc_lang', lang);
    applyLang();
  }

  function init() {
    if (!window.MutationObserver || !document.body) return;
    if (!observer) observer = new MutationObserver(onMutations);
    window.PC_LANG = getLang();
    applyLang();      // initial pass + starts observer
  }

  window.PC_LANG = getLang();
  window.setLang = setLang;
  window.applyLang = applyLang;
  window.PC_i18nInit = init;
})();
