/* ===========================================================================
 * js/themes.js — ธีมระดับเครื่อง (per-device appearance)
 * - window.PC_THEMES : รายการธีมทั้งหมด (pal = ชุดสีสำหรับ preview + shell)
 * - window.PC_applyTheme(id) : ทาธีมลง shell (เฉพาะเครื่องนี้ ผ่าน localStorage)
 *   เก็บค่าใน localStorage 'pc_theme_active' — ผู้ใช้แต่ละคน/แต่ละเครื่องเลือกเองได้
 * โหลดใน shell ก่อน mock-backend; initApp() เรียก PC_applyTheme() ตอนเข้าระบบ
 * =========================================================================== */
(function () {
  var THEMES = [
    { id:'classic',  nm:'Classic',      desc:'ดำ-เหลือง (แบรนด์)', glass:false, pal:{ bg:'#eef2ef', sb:'#1a1d20', sbtx:'#ffffff', accent:'#2e934a', logotx:'#1a1d20', navon:'rgba(46,147,74,.16)', hd:'#2e934a', hdtx:'#ffffff', card:'#ffffff', cb:'#e2e7e3', tx:'#1a1d20', sub:'#8a9099', thbg:'#1a1d20', thtx:'#ffffff' } },
    { id:'light',    nm:'Light',        desc:'สว่าง', glass:false, pal:{ bg:'#f5f7f9', sb:'#ffffff', sbtx:'#1a1d20', accent:'#2e934a', logotx:'#ffffff', navon:'rgba(46,147,74,.1)', hd:'#ffffff', hdtx:'#1a1d20', card:'#ffffff', cb:'#e7ebee', tx:'#1a1d20', sub:'#8a9099', thbg:'#eef2f4', thtx:'#1a1d20' } },
    { id:'dark',     nm:'Dark',         desc:'มืด', glass:false, pal:{ bg:'#16181b', sb:'#0e0f11', sbtx:'#e6e8ea', accent:'#2e934a', logotx:'#1a1d20', navon:'rgba(46,147,74,.14)', hd:'#1f2226', hdtx:'#f0f1f2', card:'#22262b', cb:'#2c3035', tx:'#e6e8ea', sub:'#9aa0a6', thbg:'#2a2f35', thtx:'#e6e8ea' } },
    { id:'glass',    nm:'Liquid Glass', desc:'กระจกโปร่งแสง', glass:true, pal:{ bg:'linear-gradient(150deg,#a8c8ef,#d3e6f5 45%,#c2ead9)', sb:'rgba(20,30,50,.82)', sbtx:'#ffffff', accent:'#0a84ff', logotx:'#ffffff', navon:'rgba(10,132,255,.16)', hd:'rgba(255,255,255,.42)', hdtx:'#14334f', card:'rgba(255,255,255,.55)', cb:'rgba(255,255,255,.65)', tx:'#16314e', sub:'#5c768f', thbg:'rgba(20,40,70,.78)', thtx:'#ffffff' } },
    { id:'midnight', nm:'Midnight',     desc:'น้ำเงินกระจก', glass:true, pal:{ bg:'linear-gradient(155deg,#0e2148,#16294d 55%,#0a1d3c)', sb:'#0e2148', sbtx:'#dbe9ff', accent:'#5ac8fa', logotx:'#06203c', navon:'rgba(90,200,250,.16)', hd:'rgba(40,62,104,.5)', hdtx:'#e3efff', card:'rgba(40,62,104,.45)', cb:'rgba(120,160,220,.28)', tx:'#dbe9ff', sub:'#90a8cc', thbg:'rgba(12,28,56,.8)', thtx:'#dbe9ff' } },
    { id:'warm',     nm:'Warm',         desc:'ครีม-ส้มอุ่น', glass:false, pal:{ bg:'#f7efe6', sb:'#2b211a', sbtx:'#f6e7d6', accent:'#ff9f43', logotx:'#2b211a', navon:'rgba(255,159,67,.18)', hd:'#8a4b2b', hdtx:'#fff2e6', card:'#fffaf3', cb:'#ecdfd0', tx:'#2b211a', sub:'#9a8472', thbg:'#2b211a', thtx:'#f6e7d6' } },
    { id:'forest',   nm:'Forest',       desc:'เขียวป่า', glass:false, pal:{ bg:'#eef5f0', sb:'#163a28', sbtx:'#dceee4', accent:'#28a35c', logotx:'#0c2a1a', navon:'rgba(40,163,92,.16)', hd:'#15532f', hdtx:'#eafff2', card:'#ffffff', cb:'#dce8e0', tx:'#16291f', sub:'#7a948a', thbg:'#16291f', thtx:'#eafff2' } },
    { id:'ocean',    nm:'Ocean',        desc:'ฟ้าทะเล', glass:false, pal:{ bg:'#edf6f8', sb:'#0d2c37', sbtx:'#d6eef3', accent:'#11b0bd', logotx:'#052a30', navon:'rgba(17,176,189,.16)', hd:'#0c6470', hdtx:'#e6fbff', card:'#ffffff', cb:'#d8e9ed', tx:'#122b30', sub:'#6f9099', thbg:'#0d2c37', thtx:'#e6fbff' } },
    { id:'rose',     nm:'Rose',         desc:'ชมพูกุหลาบ', glass:false, pal:{ bg:'#fbf0f3', sb:'#371824', sbtx:'#f6dde6', accent:'#e84a6f', logotx:'#ffffff', navon:'rgba(232,74,111,.16)', hd:'#93283f', hdtx:'#ffe9ef', card:'#ffffff', cb:'#f0dce2', tx:'#2e1620', sub:'#9a7280', thbg:'#371824', thtx:'#f6dde6' } },
    { id:'grape',    nm:'Grape',        desc:'ม่วงองุ่น', glass:false, pal:{ bg:'#f3f1fb', sb:'#221a3c', sbtx:'#e4ddf6', accent:'#7c5cff', logotx:'#ffffff', navon:'rgba(124,92,255,.16)', hd:'#3f2c8a', hdtx:'#efeaff', card:'#ffffff', cb:'#e6e0f3', tx:'#221a3c', sub:'#8478a0', thbg:'#221a3c', thtx:'#e4ddf6' } },
    { id:'mono',     nm:'Mono',         desc:'ขาวดำมินิมอล', glass:false, pal:{ bg:'#f4f4f5', sb:'#18181b', sbtx:'#e4e4e7', accent:'#52525b', logotx:'#ffffff', navon:'rgba(82,82,91,.14)', hd:'#27272a', hdtx:'#f4f4f5', card:'#ffffff', cb:'#e4e4e7', tx:'#18181b', sub:'#71717a', thbg:'#18181b', thtx:'#f4f4f5' } },
    { id:'ios',      nm:'iOS',          desc:'Apple สว่าง', glass:false, pal:{ bg:'#f2f2f7', sb:'#ffffff', sbtx:'#1c1c1e', accent:'#0a84ff', logotx:'#ffffff', navon:'rgba(10,132,255,.12)', hd:'#ffffff', hdtx:'#1c1c1e', card:'#ffffff', cb:'#e5e5ea', tx:'#1c1c1e', sub:'#8e8e93', thbg:'#e9e9ee', thtx:'#1c1c1e' } },
    { id:'iosdark',  nm:'iOS Dark',     desc:'Apple มืด', glass:false, pal:{ bg:'#000000', sb:'#1c1c1e', sbtx:'#ffffff', accent:'#0a84ff', logotx:'#ffffff', navon:'rgba(10,132,255,.2)', hd:'#1c1c1e', hdtx:'#ffffff', card:'#1c1c1e', cb:'#2c2c2e', tx:'#ffffff', sub:'#8e8e93', thbg:'#2c2c2e', thtx:'#ffffff' } },
    { id:'terra',    nm:'Terracotta',   desc:'เอิร์ธโทน · ดินเผา', glass:false, pal:{ bg:'#f3e9df', sb:'#4a3225', sbtx:'#ecd9c8', accent:'#c1714a', logotx:'#ffffff', navon:'rgba(193,113,74,.18)', hd:'#7a4a32', hdtx:'#f7e8db', card:'#fdf6ee', cb:'#e6d5c4', tx:'#3a2a1e', sub:'#9a8270', thbg:'#4a3225', thtx:'#ecd9c8' } },
    { id:'sage',     nm:'Sage',         desc:'เอิร์ธโทน · เซจ', glass:false, pal:{ bg:'#eef0e8', sb:'#2f3a2a', sbtx:'#dde6d2', accent:'#7d9152', logotx:'#ffffff', navon:'rgba(125,145,82,.18)', hd:'#4c5b38', hdtx:'#eef3e4', card:'#f9faf4', cb:'#dce2d0', tx:'#2c3324', sub:'#8a917c', thbg:'#2f3a2a', thtx:'#dde6d2' } },
    { id:'sand',     nm:'Sand',         desc:'คุมโทน · ทรายอุ่น', glass:false, pal:{ bg:'#f4ece0', sb:'#3a3025', sbtx:'#ece0d0', accent:'#bfa06a', logotx:'#2a2218', navon:'rgba(191,160,106,.2)', hd:'#6b5a44', hdtx:'#f6ecdb', card:'#fdf8f0', cb:'#e8ddca', tx:'#33291d', sub:'#998a74', thbg:'#3a3025', thtx:'#ece0d0' } },
    { id:'mocha',    nm:'Mocha',        desc:'คุมโทน · กาแฟ', glass:false, pal:{ bg:'#efe7e0', sb:'#2e231d', sbtx:'#e3d3c6', accent:'#a9744f', logotx:'#ffffff', navon:'rgba(169,116,79,.18)', hd:'#4e372a', hdtx:'#f0e2d6', card:'#faf3ec', cb:'#e2d3c6', tx:'#2e2219', sub:'#947f6e', thbg:'#2e231d', thtx:'#e3d3c6' } }
  ];
  window.PC_THEMES = THEMES;

  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }
  window.PC_themeById = themeById;

  function activeId() {
    var id = '';
    try { id = localStorage.getItem('pc_theme_active') || ''; } catch (e) {}
    return id;
  }
  window.PC_activeTheme = activeId;

  /* สีเข้มจริงไหม (เฉพาะ hex) — ใช้กันหัวข้อหน้าจอกลายเป็นพื้นอ่อน+ตัวอักษรขาว = อ่านไม่ออก */
  function hexDark(c) {
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(c))) return false;
    var h = c.replace('#', ''); if (h.length === 3) h = h.replace(/./g, function (x) { return x + x; });
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  }

  /* ทาธีมลง shell — override CSS variables ที่ shell/Bootstrap utilities ใช้ร่วม */
  window.PC_applyTheme = function (id) {
    id = id || activeId() || 'classic';
    var t = themeById(id), p = t.pal, r = document.documentElement.style;
    /* --pc-dark = พื้นหัวข้อ/ตารางในหน้า (ตัวอักษรขาวเสมอ) → ใช้สีไซด์บาร์ถ้าเข้มพอ
       ไม่งั้น (ธีมสว่าง/กระจก) ใช้โทนเข้มของตารางหรือดำแบรนด์ เพื่อให้ยังอ่านออก */
    var chrome = hexDark(p.sb) ? p.sb : (hexDark(p.thbg) ? p.thbg : '#1a1d20');
    r.setProperty('--pc-dark', chrome);
    r.setProperty('--dark', chrome);
    r.setProperty('--pc-yellow', p.accent);
    r.setProperty('--pc-green', p.hd);
    r.setProperty('--pc-bg', p.bg);
    r.setProperty('--pc-sb', p.sb);
    r.setProperty('--pc-sbtx', p.sbtx);
    r.setProperty('--pc-navon', p.navon);
    r.setProperty('--pc-logo-tx', p.logotx);
    r.setProperty('--pc-card', p.card);
    document.documentElement.setAttribute('data-pc-theme', id);
    document.documentElement.setAttribute('data-pc-glass', t.glass ? '1' : '0');
    return t;
  };

  /* บันทึก + ทา (เฉพาะเครื่องนี้) */
  window.PC_setTheme = function (id) {
    try { localStorage.setItem('pc_theme_active', id); } catch (e) {}
    return window.PC_applyTheme(id);
  };

  /* ทาทันทีถ้าเคยเลือกไว้ (กันจอกระพริบก่อน initApp) */
  if (activeId()) { try { window.PC_applyTheme(); } catch (e) {} }
})();
