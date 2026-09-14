/* ============================================================
   RD Sticker (เลขสติ๊กเกอร์สรรพากร) — shared logic
   ใช้ร่วมกัน 2 หน้า: RD Sticker Management.html + RD Access Settings.html
   เก็บ state ใน localStorage (mock backend)
   ============================================================ */
(function () {
  const LS = {
    records: 'pc_rd_records',   // คำขอเพิ่มเลขสติ๊กเกอร์ + สถานะ
    links:   'pc_rd_links',     // gen-link สำหรับ FRC (BD สร้าง)
    access:  'pc_rd_access',    // allow-list การล็อกอินด้วยเมล
    tpl:     'pc_rd_email_tpl', // เทมเพลตอีเมล FRC (แก้ไขได้)
    perms:   'pc_rd_perms',     // สิทธิ์แก้ไขส่วนต่างๆ
    cases:   'pc_rd_cases',     // แจ้งยกเลิก/จดใหม่
    workflow:'pc_rd_workflow',  // นิยามเคส (แก้ไขได้)
    coco:    'pc_rd_coco_admin',// Admin บริษัทแม่ (COCO)
    wfperms: 'pc_rd_wf_perms',  // สิทธิ์แก้ไข workflow
    triggers:'pc_rd_triggers',  // งานไหลจาก Master Shop → คิวแจ้งยกเลิก/จดใหม่
    cadmin:  'pc_rd_company_admins', // Admin บริษัทที่ทำเรื่องสติ๊กเกอร์
    channels:'pc_rd_channels',  // ช่องทางแจ้ง (ยกเลิก/จดใหม่)
    canceltpl:'pc_rd_cancel_tpl', // เทมเพลตแจ้งยกเลิก/จดใหม่ รายช่องทาง
    ver:     'pc_rd_ver'
  };
  const SEED_VER = 7;

  const load = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------- branches ---------- */
  const branches = () => (window.PC_BRANCH_MASTER || []).slice();
  const branch = (id) => branches().find(b => b.id === id);
  const companies = () => [...new Set(branches().map(b => b.company).filter(Boolean))];
  const branchesOfCompany = (c) => branches().filter(b => b.company === c).map(b => b.id);

  /* ---------- status model ---------- */
  // steps: 0 แจ้งเพิ่ม · 1 IT ลงเลขใน POS · 2 สาขาตรวจใบเสร็จ · 3 เรียบร้อย
  const STEPS = ['แจ้งเพิ่ม', 'IT ลงเลขใน POS', 'สาขาตรวจใบเสร็จ', 'เรียบร้อย'];
  const STATUS = {
    SUBMITTED: { label: 'รอ IT ลงเลข',          color: 'warn', active: 1, done: [0] },
    IN_POS:    { label: 'รอสาขาตรวจใบเสร็จ',     color: 'blue', active: 2, done: [0, 1] },
    CONFIRMED: { label: 'เรียบร้อย',             color: 'ok',   active: 4, done: [0, 1, 2, 3] },
    ISSUE:     { label: 'สาขาแจ้งเลขไม่ขึ้น',    color: 'bad',  active: 2, done: [0, 1], err: 2 }
  };

  /* ---------- scope / visibility ---------- */
  // visibility = { mode:'branch'|'company'|'custom'|'all', ids:[] }
  // viewer = { role:'HO'|'IT'|'BRANCH'|'FRC', branchId?, company?, scopeIds?[] }
  function canSee(rec, viewer) {
    if (!viewer) return true;
    if (viewer.role === 'HO' || viewer.role === 'IT') return true;          // ส่วนกลางเห็นหมด
    // สาขา / FRC — เห็นเฉพาะที่อยู่ในขอบเขตของตน
    const vis = rec.visibility || { mode: 'branch', ids: [rec.branchId] };
    const targets = resolveVisibility(vis, rec);
    // viewer ถูกจำกัดด้วย scopeIds (FRC link / branch login)
    const allow = viewer.scopeIds && viewer.scopeIds.length ? viewer.scopeIds : (viewer.branchId ? [viewer.branchId] : []);
    return targets.some(id => allow.includes(id));
  }
  function resolveVisibility(vis, rec) {
    if (!vis || vis.mode === 'all') return branches().map(b => b.id);
    if (vis.mode === 'branch') return [rec.branchId];
    if (vis.mode === 'company') {
      const c = branch(rec.branchId)?.company;
      return c ? branchesOfCompany(c) : [rec.branchId];
    }
    if (vis.mode === 'custom') return (vis.ids || []).slice();
    return [rec.branchId];
  }

  /* ---------- records ---------- */
  const getRecords = () => load(LS.records, []);
  const setRecords = (r) => save(LS.records, r);
  function addRecord(rec) {
    const all = getRecords();
    rec.id = 'RD-' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase();
    rec.status = 'SUBMITTED';
    rec.createdAt = Date.now();
    rec.history = [{ at: Date.now(), by: rec.submittedBy || '—', action: 'แจ้งเพิ่มเลขสติ๊กเกอร์' }];
    all.unshift(rec);
    setRecords(all);
    return rec;
  }
  function setStatus(id, status, by, note) {
    const all = getRecords();
    const r = all.find(x => x.id === id);
    if (!r) return;
    r.status = status;
    const map = {
      IN_POS: 'IT ลงเลขเข้า POS เรียบร้อย — แจ้งสาขาตรวจใบเสร็จ',
      CONFIRMED: 'สาขายืนยัน เลขขึ้นบนใบเสร็จถูกต้อง',
      ISSUE: 'สาขาแจ้งปัญหา: ' + (note || 'เลขไม่ขึ้น/ไม่ถูกต้อง')
    };
    r.history.push({ at: Date.now(), by: by || '—', action: map[status] || status });
    setRecords(all);
    return r;
  }

  /* ---------- gen-links (BD → FRC) ---------- */
  const getLinks = () => load(LS.links, []);
  const setLinks = (l) => save(LS.links, l);
  function addLink(link) {
    const all = getLinks();
    link.id = 'L' + Date.now().toString(36).toUpperCase();
    link.token = (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8)).toUpperCase();
    link.createdAt = Date.now();
    link.status = 'active';
    link.uses = 0;
    all.unshift(link);
    setLinks(all);
    return link;
  }
  const linkByToken = (t) => getLinks().find(l => l.token === t);

  /* ---------- access allow-list (email login) ---------- */
  const getAccess = () => load(LS.access, []);
  const setAccess = (a) => save(LS.access, a);

  /* ---------- email template (BD แก้ไขได้) ---------- */
  const DEFAULT_TPL = {
    subject: '[Potato Corner] แจ้งเพิ่มเลขสติ๊กเกอร์สรรพากร — {branches}',
    body: 'เรียน {frcName}\n\nทีม BD Potato Corner ขอให้ท่านแจ้งเลขสติ๊กเกอร์สรรพากรของสาขา {branches} ผ่านลิงก์ด้านล่าง (ไม่ต้องล็อกอิน):\n\n{link}\n\nลิงก์หมดอายุ {expiry} · ใช้ได้เฉพาะสาขาของท่าน\n\nขอบคุณค่ะ'
  };
  const getEmailTpl = () => load(LS.tpl, null) || JSON.parse(JSON.stringify(DEFAULT_TPL));
  const setEmailTpl = (t) => save(LS.tpl, t);
  function renderEmail(tpl, vars) {
    const sub = String(tpl.subject || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m);
    const body = String(tpl.body || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m);
    return { subject: sub, body };
  }

  /* ---------- edit permissions ---------- */
  const DEFAULT_PERMS = { editEmailTpl: true, bdCreateLink: true, bdRevokeLink: true, editAccess: true };
  const getPerms = () => Object.assign({}, DEFAULT_PERMS, load(LS.perms, {}));
  const setPerms = (p) => save(LS.perms, p);

  /* ======================================================
     แจ้งยกเลิก / จดใหม่ (Cancel / Re-register)
     ====================================================== */
  const FRANCHISE_TYPES = ['DODO', 'DOCO', 'DODO-M'];   // ประเภทที่แฟรนไชส์ดำเนินการ
  // ขั้นตอนที่บริษัทแฟรนไชส์เดิมต้องทำก่อนส่งมอบร้านคืน
  const FRANCHISE_GUIDE = [
    { t: 'ยื่นแบบ ภ.พ.06.1 (กรมสรรพากร)', d: 'แจ้ง “ยกเลิกการใช้เครื่องบันทึกการเก็บเงิน” ณ สำนักงานสรรพากรพื้นที่ที่ร้านตั้งอยู่' },
    { t: 'พิมพ์รายงานสรุปยอด (Z-Close / Z-Reading)', d: 'ปิดยอดสะสมของเครื่อง POS ณ วันสุดท้าย เป็นหลักฐานยอดขายภายใต้เลขผู้เสียภาษีเดิม' },
    { t: 'คืนสติ๊กเกอร์และเล่มทะเบียน', d: 'นำสติ๊กเกอร์เครื่องเดิม + หนังสืออนุมัติ (ค.ก.2 / ค.ก.2.1) ไปแสดง/ส่งคืนต่อเจ้าหน้าที่' }
  ];
  // กรณีต่างๆ — types = ประเภทสาขาที่เข้าเงื่อนไข
  /* ---------- workflow (editable case engine) ---------- */
  // routes[].to: 'FRC' (admin บริษัทแฟรนไชส์) | 'COCO' (admin บริษัทแม่) · actions: cancel/new
  const DEFAULT_WORKFLOW = [
    { id:'broken', name:'เครื่อง POS ชำรุด — ซื้อใหม่ทดแทน', desc:'เครื่องเดิมเสีย/สูญหาย → เปลี่ยนเครื่องใหม่ · ยกเลิกเลขเดิม (ภ.พ.06.1) + ขอใหม่ (ภ.พ.06) = สติ๊กเกอร์ใหม่ · ระบุเครื่องเก่าไปไหน',
      trigger:'broken', machineChange:true, oldMachineAllowed:false, franchiseGuide:false, editBranch:false,
      routes:[ {types:['DODO','DODO-M'],to:'FRC',actions:['cancel','new']}, {types:['DOCO','COCO'],to:'COCO',actions:['cancel','new']} ] },
    { id:'relicense', name:'Re-License (→ COCO)', desc:'เปลี่ยนบริษัท (แฟรนไชส์ → COCO) = ยกเลิก+จดใหม่ (สติ๊กเกอร์ใหม่) · หมายเหตุ: บริษัทเดิม COCO→COCO แค่เปลี่ยนรหัสร้าน (recode) ใช้สติ๊กเกอร์เดิม ไม่ต้องแจ้ง',
      trigger:'tocoCo', machineChange:true, oldMachineAllowed:false, franchiseGuide:false, editBranch:true,
      routes:[ {types:['DODO','DOCO','DODO-M'],to:'FRC',actions:['cancel','new']} ] },
    { id:'transfer', name:'Transfer Code (→ COCO)', desc:'โอนรหัส + เปลี่ยนบริษัท → ยกเลิกฝั่งเดิม + จดใหม่ฝั่งใหม่ (สติ๊กเกอร์ใหม่)',
      trigger:'tocoCo', machineChange:true, oldMachineAllowed:false, franchiseGuide:true, editBranch:true,
      routes:[ {types:['DODO','DOCO','DODO-M'],to:'FRC',actions:['cancel']}, {types:['DODO','DOCO','DODO-M'],to:'COCO',actions:['new']} ] },
    { id:'renovate', name:'Renovate (ปรับปรุงร้าน)', desc:'ปรับปรุงร้าน · ใช้เครื่องเดิม = ไม่เปลี่ยนสติ๊กเกอร์ (ไม่ต้องแจ้ง) · เปลี่ยนเครื่องใหม่ = ยกเลิก+ขอใหม่',
      trigger:'renovate', machineChange:true, oldMachineAllowed:true, franchiseGuide:false, editBranch:false,
      routes:[ {types:['DODO','DOCO','DODO-M'],to:'FRC',actions:['cancel','new']}, {types:['COCO'],to:'COCO',actions:['cancel','new']} ] },
    { id:'relocate', name:'Relocate (เปลี่ยนพื้นที่)', desc:'ย้ายในที่ตั้งเดิม = ไม่เปลี่ยนสติ๊กเกอร์ · ย้ายออกจากสถานประกอบการ = ยกเลิก+ขอใหม่ (ภ.พ.06.1 + ภ.พ.06)',
      trigger:'relocate', machineChange:true, oldMachineAllowed:true, franchiseGuide:false, editBranch:false,
      routes:[ {types:['DODO','DOCO','DODO-M'],to:'FRC',actions:['cancel','new']}, {types:['COCO'],to:'COCO',actions:['cancel','new']} ] },
    { id:'close', name:'สาขาปิดถาวร', desc:'ปิดสาขาถาวร — ยกเลิกสติ๊กเกอร์อย่างเดียว (ภ.พ.06.1) · ระบุเครื่องไปไหน (ทำลาย/คลัง/ย้ายสาขา → เด้งเคสรับเครื่องอัตโนมัติ)',
      trigger:'closed', machineChange:false, oldMachineAllowed:false, franchiseGuide:false, editBranch:false,
      routes:[ {types:['COCO'],to:'COCO',actions:['cancel']} ] }
  ];
  const getWorkflow = () => { const s=load(LS.workflow,null); return (Array.isArray(s)&&s.length)?s:JSON.parse(JSON.stringify(DEFAULT_WORKFLOW)); };
  const setWorkflow = (w) => save(LS.workflow, w);
  const workflowById = (id) => getWorkflow().find(c=>c.id===id);
  function casesForType(type){ return getWorkflow().filter(c=>(c.routes||[]).some(r=>r.types.includes(type))); }
  function casesForTrigger(kind){ return getWorkflow().filter(c=>c.trigger===kind); }
  function resolveCase(branch, caseId){
    const c = workflowById(caseId); if(!c||!branch) return null;
    const type = branch.type||''; const isFranchise = FRANCHISE_TYPES.includes(type);
    // —— โมเดลใหม่: ทุกเคส ทุก Type ส่งไปหา Admin COCO เป็นผู้รับหลัก ——
    // COCO จะประสาน/ส่งต่อให้ FRC เอง (เฉพาะ Type ที่ไม่ใช่ COCO)
    const matched = (c.routes||[]).filter(r=>r.types.includes(type));
    const actions = [...new Set(matched.flatMap(r=>r.actions))];
    const applicable = matched.length>0;
    const forwardToFrc = applicable && type !== 'COCO';
    const routes = applicable ? [{ to:'COCO', actions, admin: getCocoAdmin() }] : [];
    const frcAdmin = forwardToFrc ? adminForCompany(branch.company) : null;
    return { case:c, type, applicable, isFranchise, routes,
      cancel: actions.includes('cancel'),
      reRegister: actions.includes('new'),
      forwardToFrc, frcAdmin, frcCompany: forwardToFrc ? (branch.company||'') : '',
      frcCoordinate: forwardToFrc,
      franchiseGuide: !!c.franchiseGuide && isFranchise,
      machineChange: !!c.machineChange, oldMachineAllowed: !!c.oldMachineAllowed,
      editBranch: !!c.editBranch, parallelNew:false };
  }
  /* ---------- COCO (parent) admin + workflow permissions ---------- */
  const getCocoAdmin = () => load(LS.coco, null) || { name:'Admin COCO (บริษัทแม่)', email:'coco-admin@potatocornerth.com' };
  const setCocoAdmin = (a) => save(LS.coco, a);
  const DEFAULT_WF_PERMS = { Admin:{edit:true,del:true}, IT:{edit:true,del:true}, MKT:{edit:false,del:false}, OP:{edit:false,del:false}, BD:{edit:false,del:false} };
  const getWfPerms = () => Object.assign({}, DEFAULT_WF_PERMS, load(LS.wfperms,{}));
  const setWfPerms = (p) => save(LS.wfperms, p);

  /* ---------- company sticker-admin directory ---------- */
  const getCompanyAdmins = () => load(LS.cadmin, {});
  const setCompanyAdmins = (m) => save(LS.cadmin, m);
  function adminForCompany(company) {
    const m = getCompanyAdmins();
    return m[company] || { name: 'Admin ' + (company || '—'), email: '' };
  }

  /* ---------- multi-channel notify (cancel/re-register) ---------- */
  const CHANNELS = [
    { id: 'email', label: 'อีเมล', icon: 'fa-envelope', color: '#2f5fb3' },
    { id: 'chat',  label: 'Team Chat', icon: 'fa-comments', color: '#1d7a4d' },
    { id: 'line',  label: 'LINE', icon: 'fa-line', brand: true, color: '#06c755' }
  ];
  const DEFAULT_CHANNELS = { email: true, chat: false, line: false };
  const getChannels = () => Object.assign({}, DEFAULT_CHANNELS, load(LS.channels, {}));
  const setChannels = (c) => save(LS.channels, c);
  const DEFAULT_CANCEL_TPL = {
    email: {
      subject: '[Potato Corner] แจ้ง{actions} สติ๊กเกอร์สรรพากร — {branch} ({branchType})',
      body: 'เรียน {adminName}\n\nทีม IT แจ้งดำเนินการเรื่องสติ๊กเกอร์สรรพากร ดังนี้\n• สาขา: {branch} ({branchId}) · ประเภท {branchType}\n• บริษัท: {company}\n• กรณี: {caseName}\n• การดำเนินการ: {actions}\n• เลขสติ๊กเกอร์เดิม: {oldNum}\n\n{forward}{guide}ขอบคุณค่ะ\nทีม IT — Potato Corner'
    },
    chat: { body: '\uD83E\uDDFE แจ้ง{actions} สติ๊กเกอร์สรรพากร\nสาขา {branch} ({branchType}) · {company}\nกรณี: {caseName}\nเลขเดิม: {oldNum}\n→ {adminName} กรุณาดำเนินการ / ประสาน FRC' },
    line: { body: '[Potato Corner] แจ้ง{actions} สติ๊กเกอร์ — {branch}\nกรณี: {caseName} · ประเภท {branchType}\nผู้รับผิดชอบ: {adminName}' }
  };
  const getCancelTpl = () => { const s = load(LS.canceltpl, null); return s ? Object.assign(JSON.parse(JSON.stringify(DEFAULT_CANCEL_TPL)), s) : JSON.parse(JSON.stringify(DEFAULT_CANCEL_TPL)); };
  const setCancelTpl = (t) => save(LS.canceltpl, t);
  function renderText(str, vars) { return String(str || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m); }
  function buildCaseVars(c, b) {
    const acts = []; if (c.cancel) acts.push('ยกเลิก'); if (c.reRegister) acts.push('จดใหม่');
    let guide = '';
    if (c.franchiseGuide) guide = '\nแนวทางที่บริษัทแฟรนไชส์เดิมต้องทำ (ก่อนส่งมอบร้านคืน):\n' + FRANCHISE_GUIDE.map((g, i) => `  ${i + 1}. ${g.t} — ${g.d}`).join('\n') + '\n';
    const forward = c.forwardToFrc
      ? 'กรุณาประสานงาน / ส่งเรื่องต่อให้ Admin FRC (แฟรนไชส์' + (c.frcCompany ? ' — ' + c.frcCompany : '') + ') เพื่อดำเนินการตามขั้นตอน\n'
      : '';
    return {
      branch: (b ? b.nameTH : c.branchId), branchId: c.branchId, branchType: c.branchType || '', company: c.company || '—',
      caseName: c.caseName || '', actions: acts.join('/'), oldNum: c.oldNum || '—', newCashRd: c.newCashRd || '', adminName: c.adminName || 'Admin', forward, guide
    };
  }

  /* ---------- cancel/re-register cases store ---------- */
  // ขั้นตอนขึ้นกับว่ามีจดใหม่หรือไม่ — คำนวณใน caseFlow()
  const CASE_STATUS = {
    OPEN:      { label: 'ส่งเมลแจ้ง Admin แล้ว — รอดำเนินการ', color: 'warn' },
    COORD:     { label: 'Admin ดำเนินการ/ประสาน FRC + ยกเลิกเลขเดิม', color: 'blue' },
    NEW_ADDED: { label: 'เพิ่มสติ๊กเกอร์ใหม่ในระบบ — รอสาขาตรวจใบเสร็จ', color: 'blue' },
    DONE:      { label: 'ปิดงาน — เรียบร้อย', color: 'ok' }
  };
  // step labels + done/active ตามว่ามีจดใหม่หรือไม่
  function caseFlow(rec) {
    const re = !!(rec && rec.reRegister);
    const st = rec ? rec.status : 'OPEN';
    if (re) {
      const labels = ['IT แจ้ง', 'Admin ยกเลิกเดิม / ประสาน FRC', 'เพิ่มสติ๊กเกอร์ใหม่ในระบบ', 'สาขาตรวจใบเสร็จ', 'ปิดงาน'];
      const map = { OPEN:{done:[0],active:1}, COORD:{done:[0,1],active:2}, NEW_ADDED:{done:[0,1,2],active:3}, DONE:{done:[0,1,2,3,4],active:5} };
      return { labels, ...(map[st] || map.OPEN) };
    }
    const labels = ['IT แจ้ง', 'ส่งเมล Admin บริษัท', 'Admin ดำเนินการยกเลิก', 'ปิดงาน'];
    const map = { OPEN:{done:[0,1],active:2}, COORD:{done:[0,1],active:2}, DONE:{done:[0,1,2,3],active:4} };
    return { labels, ...(map[st] || map.OPEN) };
  }
  const getCases = () => load(LS.cases, []);
  const setCases = (c) => save(LS.cases, c);
  function addCase(rec) {
    const all = getCases();
    rec.id = 'CX-' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 4)).toUpperCase();
    rec.status = 'OPEN';
    rec.createdAt = Date.now();
    rec.history = [
      { at: Date.now(), by: rec.createdBy || 'IT', action: 'แจ้ง' + (rec.cancel ? 'ยกเลิก' : '') + (rec.reRegister ? (rec.cancel ? ' + ' : '') + 'จดใหม่' : '') + ' (' + (rec.caseName || '') + ')' },
      { at: Date.now() + 1, by: 'ระบบ', action: 'ส่งแจ้ง Admin บริษัท (' + (rec.notifyVia || 'อีเมล') + '): ' + (rec.adminEmail || '—') }
    ];
    all.unshift(rec);
    setCases(all);
    try { var _N=(window.PC_notify||(window.top&&window.top.PC_notify)); if (_N) { var _isC = !!rec.cancel; _N(_isC ? 'sticker_cancel' : 'sticker_add', { text: (_isC ? ('แจ้งยกเลิก' + (rec.reRegister ? '/จดใหม่' : '') + 'สติ๊กเกอร์สรรพากร') : 'แจ้งเพิ่มเลขสติ๊กเกอร์สรรพากร') + (rec.branchName ? ' — สาขา ' + rec.branchName : (rec.caseName ? ' — ' + rec.caseName : '')) + ' (' + rec.id + ') · รอ Admin/บัญชี ดำเนินการ' }); } } catch (e) {}
    return rec;
  }
  function setCaseStatus(id, status, by, extra) {
    const all = getCases(); const r = all.find(x => x.id === id); if (!r) return;
    if (extra) Object.assign(r, extra);
    r.status = status;
    let msg = status;
    if (status === 'COORD') msg = 'Admin รับเรื่อง — ยกเลิกเลขเดิม / ประสาน FRC';
    else if (status === 'NEW_ADDED') msg = 'เพิ่มสติ๊กเกอร์ใหม่เข้าระบบ' + (extra && extra.newCashRd ? ' · เลขใหม่ ' + extra.newCashRd : '') + ' — แจ้งสาขาตรวจใบเสร็จ';
    else if (status === 'DONE') msg = r.reRegister ? 'สาขายืนยันเลขขึ้นใบเสร็จถูกต้อง — ปิดงาน' : 'ยกเลิกเรียบร้อย — ปิดงาน';
    r.history.push({ at: Date.now(), by: by || 'Admin', action: msg });
    setCases(all);
    return r;
  }
  function setCaseMachine(id, machine, by) {
    const all = getCases(); const r = all.find(x => x.id === id); if (!r) return;
    r.newMachine = machine;
    r.history.push({ at: Date.now(), by: by || 'CMPOS', action: 'กรอกข้อมูลเครื่อง POS ใหม่: ' + (machine.brandModel || '—') + ' / ' + (machine.machineType || '—') + ' · S/N ' + (machine.serialNumber || '—') });
    setCases(all);
    return r;
  }

  /* ---------- triggers: งานไหลจาก Master Shop → แจ้งยกเลิก/จดใหม่ ---------- */
  // kind: 'tocoCo' (แฟรนไชส์→COCO = Re-License/Transfer) · 'closed' (ปิดสาขา) · 'broken' (เครื่องชำรุด)
  const TRIGGER_META = {
    tocoCo:   { label: 'เปลี่ยนประเภท → COCO', icon: 'fa-right-left', color: '#6b3fa0', cases: ['relicense', 'transfer'] },
    broken:   { label: 'เครื่องชำรุด — เปลี่ยนเครื่อง', icon: 'fa-screwdriver-wrench', color: '#9a6700', cases: ['broken'] },
    renovate: { label: 'Renovate (ปรับปรุงร้าน)', icon: 'fa-paint-roller', color: '#2c4a82', cases: ['renovate'] },
    relocate: { label: 'Relocate (เปลี่ยนพื้นที่)', icon: 'fa-truck', color: '#1d7a4d', cases: ['relocate'] },
    closed:   { label: 'ปิดสาขา', icon: 'fa-store-slash', color: '#c0392b', cases: ['close'] }
  };
  const getTriggers = () => load(LS.triggers, []);
  const setTriggers = (t) => save(LS.triggers, t);
  function addTrigger(t) {
    const all = getTriggers();
    // กันซ้ำ: ถ้า branch เดิมมี trigger pending อยู่แล้วไม่เพิ่มซ้ำ
    if (all.some(x => x.branchId === t.branchId && x.kind === t.kind && x.status === 'pending')) return null;
    t.id = 'TG-' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 4)).toUpperCase();
    t.status = 'pending'; t.at = Date.now();
    all.unshift(t); setTriggers(all); return t;
  }
  function handleTrigger(id, caseId) {
    const all = getTriggers(); const t = all.find(x => x.id === id); if (!t) return;
    t.status = 'handled'; t.caseId = caseId || ''; t.handledAt = Date.now();
    setTriggers(all); return t;
  }
  const pendingTriggers = () => getTriggers().filter(t => t.status === 'pending');
  // เทียบ Type เก่า vs ใหม่ → สร้าง trigger (ใช้ตอน IT บันทึก Master)
  function triggersFromTypeChange(prevTypes, curBranches) {
    const out = [];
    curBranches.forEach(b => {
      const prev = prevTypes[b.id];
      if (prev == null || prev === b.type) return;
      if (FRANCHISE_TYPES.includes(prev) && b.type === 'COCO')
        out.push({ branchId: b.id, oldType: prev, newType: b.type, kind: 'tocoCo' });
    });
    return out;
  }

  /* ---------- seed demo ---------- */
  function seed() {
    // real-data mode: ล้าง demo (records/links/triggers) + เปิดเคสจริงจาก Shop Master (Transfer + ปิดถาวร) — รันครั้งเดียว
    if (load('pc_rd_realseed', 0) !== 3) {
      try {
        setRecords([]); setLinks([]); setTriggers([]);
        (branches() || []).forEach(function (b) {
          var st = b.masterStatus || '';
          if (/^PCSE/i.test(b.id) || /ข้าว โซ อิ|ข้าวโซอิ/.test(b.company || '') || /สุวินท|Suwinthawong/i.test((b.name || '') + (b.nameTH || ''))) return;
          if (/Transfer Code/i.test(st)) addTrigger({ branchId: b.id, oldType: b.type, newType: 'COCO', kind: 'tocoCo', caseHint: 'Transfer (โอนรหัส)' });
          else if (/Permanently Closed/i.test(st)) addTrigger({ branchId: b.id, oldType: b.type, newType: b.type, kind: 'closed', caseHint: 'ปิดสาขา (ยกเลิกสติ๊กเกอร์)' });
        });
        save('pc_rd_realseed', 3);
      } catch (e) {}
    }
    if (load(LS.ver, 0) === SEED_VER) return;
    const bs = branches();
    const pick = (id) => bs.find(b => b.id === id) || bs[0];
    const now = Date.now(), D = 86400000;

    // records
    const recs = [
      mk('PC1001', '0105563000001', 'RD-CTW-01', 'HO — ฝ่ายบัญชี', 'HO', 'branch', 'CONFIRMED', now - 9 * D),
      mk('PC1015', '0105563000115', 'RD-SRC-07', 'HO — ฝ่ายบัญชี', 'HO', 'branch', 'IN_POS', now - 2 * D),
      mk('PC1002', '0105563000022', 'RD-MBN-03', 'HO — ฝ่ายบัญชี', 'HO', 'company', 'SUBMITTED', now - 6 * 3600000),
      mk('PC1029', '0105563000291', 'RD-PTY-02', 'FRC — ร้านพัทยา', 'FRC', 'branch', 'ISSUE', now - 1 * D),
      mk('PC1025', '', '', 'FRC — เชียงใหม่', 'FRC', 'branch', 'SUBMITTED', now - 2 * 3600000)
    ];
    function mk(bid, cash, shop, by, role, vmode, status, t) {
      const b = pick(bid);
      const r = {
        id: 'RD-' + bid + '-' + Math.random().toString(36).slice(2, 5).toUpperCase(),
        branchId: bid, cashRdNumber: cash, rdShopCode: shop,
        effDate: new Date(t).toISOString().slice(0, 10),
        note: '', stickerImg: '',
        submittedBy: by, submittedRole: role,
        visibility: { mode: vmode, ids: [] },
        status, createdAt: t,
        history: [{ at: t, by, action: 'แจ้งเพิ่มเลขสติ๊กเกอร์' }]
      };
      if (status === 'IN_POS' || status === 'CONFIRMED' || status === 'ISSUE')
        r.history.push({ at: t + 3600000, by: 'IT — ทีมระบบ', action: 'IT ลงเลขเข้า POS เรียบร้อย — แจ้งสาขาตรวจใบเสร็จ' });
      if (status === 'CONFIRMED')
        r.history.push({ at: t + 2 * 3600000, by: b.nameTH, action: 'สาขายืนยัน เลขขึ้นบนใบเสร็จถูกต้อง' });
      if (status === 'ISSUE')
        r.history.push({ at: t + 2 * 3600000, by: b.nameTH, action: 'สาขาแจ้งปัญหา: เลขไม่ขึ้นบนใบเสร็จ' });
      return r;
    }
    if (!load(LS.records, null)) setRecords(recs); // seed-if-absent → ไม่ทับคำขอจริงเมื่อ bump SEED_VER

    // links
    if (!load(LS.links, null)) setLinks([{
      id: 'LDEMO1', token: 'FRCPTY9KQ2', label: 'FRC พัทยา (PC1029)',
      scopeMode: 'branch', scopeIds: ['PC1029'],
      frcName: 'คุณสมชาย (เจ้าของแฟรนไชส์)', frcEmail: 'somchai.frc@gmail.com',
      createdBy: 'BD — ทีมแฟรนไชส์', createdAt: now - 3 * D, expiry: now + 27 * D,
      status: 'active', uses: 2
    }]);

    // access (allow-list ที่แอดมินแก้ได้) → seed-if-absent
    if (!load(LS.access, null)) setAccess([
      { email: 'accounting@potatocornerth.com', provider: 'corporate', name: 'ฝ่ายบัญชี HO', role: 'HO', scopeMode: 'all', scopeIds: [] },
      { email: 'it@potatocornerth.com', provider: 'corporate', name: 'ทีม IT', role: 'IT', scopeMode: 'all', scopeIds: [] },
      { email: 'bd@potatocornerth.com', provider: 'corporate', name: 'ทีม BD (แฟรนไชส์)', role: 'BD', scopeMode: 'all', scopeIds: [] },
      { email: 'somchai.frc@gmail.com', provider: 'google', name: 'คุณสมชาย (FRC พัทยา)', role: 'FRC', scopeMode: 'branch', scopeIds: ['PC1029'] },
      { email: 'cm.franchise@outlook.com', provider: 'microsoft', name: 'FRC เชียงใหม่', role: 'FRC', scopeMode: 'branch', scopeIds: ['PC1025'] }
    ]);

    seedExtras();
    save(LS.ver, SEED_VER);
  }

  // ---- seed company sticker-admins + a demo cancel case (runs inside seed via ver guard) ----
  function seedExtras() {
    const cad = {
      'บริษัท ร็อคส์ พีซี จำกัด': { name: 'Admin ร็อคส์ พีซี (ส่วนกลาง)', email: 'sticker-admin@potatocornerth.com' },
      'บริษัท สยาม ออยล์ คอฟฟี่ จำกัด': { name: 'Admin สยาม ออยล์', email: 'admin@siamoilcoffee.co.th' },
      'บริษัท ฟราย เดย์ 2024 จำกัด': { name: 'Admin ฟราย เดย์', email: 'admin@fryday2024.com' }
    };
    if (!load(LS.cadmin, null)) setCompanyAdmins(cad); // seed-if-absent → คงไดเรกทอรีแอดมินบริษัทที่แก้ไว้
    setEmailTpl(getEmailTpl()); // ensure default persisted (getEmailTpl โหลดของที่แก้ไว้ก่อน)
    if (!load(LS.channels, null)) setChannels(DEFAULT_CHANNELS);
    if (!load(LS.canceltpl, null)) setCancelTpl(JSON.parse(JSON.stringify(DEFAULT_CANCEL_TPL))); // seed-if-absent → คงการแก้ไขของแอดมินไว้ข้ามเวอร์ชัน (getCancelTpl merge {forward} ให้เอง)
  }
  /* ---------- formatters ---------- */
  function fmtDate(t) {
    const d = new Date(t);
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }
  const providerMeta = {
    corporate: { label: 'Corporate', icon: 'fa-building', color: '#1a1d20' },
    google:    { label: 'Google',    icon: 'fa-google',   color: '#ea4335' },
    microsoft: { label: 'Outlook',   icon: 'fa-microsoft', color: '#0078d4' }
  };

  window.RD = {
    branches, branch, companies, branchesOfCompany,
    STEPS, STATUS, canSee, resolveVisibility,
    getRecords, setRecords, addRecord, setStatus,
    getLinks, setLinks, addLink, linkByToken,
    getAccess, setAccess,
    getEmailTpl, setEmailTpl, renderEmail, DEFAULT_TPL,
    getPerms, setPerms,
    FRANCHISE_TYPES, FRANCHISE_GUIDE, casesForType, casesForTrigger, resolveCase,
    getWorkflow, setWorkflow, workflowById, DEFAULT_WORKFLOW,
    getCocoAdmin, setCocoAdmin, getWfPerms, setWfPerms,
    CASE_STATUS, caseFlow, getCases, setCases, addCase, setCaseStatus, setCaseMachine,
    TRIGGER_META, getTriggers, setTriggers, addTrigger, handleTrigger, pendingTriggers, triggersFromTypeChange,
    getCompanyAdmins, setCompanyAdmins, adminForCompany,
    CHANNELS, getChannels, setChannels, getCancelTpl, setCancelTpl, DEFAULT_CANCEL_TPL, renderText, buildCaseVars,
    seed, fmtDate, providerMeta
  };
})();
