/* ============================================================================
 * js/npd-readonly-view.js — NPD read-only view ที่ "หน้าตาเป๊ะเหมือนฟอร์ม RD"
 * (การ์ด · Sale Mode pill · ตารางผง/วัตถุดิบ · สูตรผง Min–Max) แต่แก้ไขไม่ได้
 * ใช้ร่วม MKT (Campaign Tracking) + OP (Op Tracking)
 *   window.PC_NpdView.render(n, { back:'window.renderCtNpd()' })  → HTML string
 * โหลดใน shell (global) — ทุกหน้าเรียกได้
 * ========================================================================== */
(function () {
  var DLV = ['Grab', 'Lineman', 'ShopeeFood', 'Robinhood', 'Gokoo'];
  var CH = ['Take-Away', 'Grab', 'Lineman', 'ShopeeFood', 'Robinhood', 'Gokoo'];
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function normCh(c) { var k = String(c || '').toLowerCase().trim().replace(/[\s-]/g, ''); var M = { takeaway: 'Take-Away', grab: 'Grab', lineman: 'Lineman', shopeefood: 'ShopeeFood', robinhood: 'Robinhood', gokoo: 'Gokoo' }; return M[k] || c; }
  function baht(x) { try { return window.PCfmt ? PCfmt.baht(x) : ('฿' + x); } catch (e) { return '฿' + x; } }
  function dt(v) { try { return window.PCfmt ? PCfmt.date(v) : (v || '-'); } catch (e) { return v || '-'; } }

  function injectCSS() {
    if (document.getElementById('pc-npdro-css')) return;
    var css = ''
      + '.npdro{font-family:"Kanit",sans-serif;color:#1a1d20}'
      + '.npdro .rohead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}'
      + '.npdro .card2{background:#fff;border:1px solid #e6e9ee;border-radius:12px;margin-bottom:16px;overflow:hidden;box-shadow:0 1px 2px rgba(20,32,43,.05)}'
      + '.npdro .sec-head{background:#1a1d20;color:#fff;font-weight:700;font-size:.8rem;letter-spacing:.5px;padding:9px 14px;text-transform:uppercase}'
      + '.npdro .sec-head .r{float:right;font-weight:400;opacity:.7;text-transform:none;font-size:.72rem}'
      + '.npdro .pad{padding:14px 16px}'
      + '.npdro .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}'
      + '.npdro label{font-size:.68rem;font-weight:700;color:#5a626b;text-transform:uppercase;margin:0 0 3px;display:block}'
      + '.npdro .ro{background:#eef1f4;border:1px solid #d9dde2;border-radius:8px;padding:8px 11px;font-size:.9rem;min-height:37px;word-break:break-word}'
      + '.npdro .ro.mono{font-family:"JetBrains Mono",monospace}'
      + '.npdro .tag{display:inline-block;font-size:.58rem;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:5px;vertical-align:middle;letter-spacing:.3px;background:#198754;color:#fff}'
      + '.npdro .item-card{border:2px solid #000;border-radius:14px;overflow:hidden;margin-bottom:18px;background:#fff}'
      + '.npdro .item-head{background:#2e934a;color:#fff;font-weight:700;padding:9px 15px;border-bottom:2px solid #000;font-size:.95rem}'
      + '.npdro .subhead2{font-weight:700;font-size:.78rem;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 7px;color:#1a1d20}'
      + '.npdro .subhead2 i{margin-right:6px}'
      + '.npdro .pills{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:6px}'
      + '.npdro .pill{display:inline-flex;align-items:center;gap:6px;border:2px solid #d3d8de;border-radius:10px;padding:4px 12px;font-weight:600;font-size:.8rem;background:#fff;color:#9aa3ab}'
      + '.npdro .pill.on{background:#e8f6ee;border-color:#2e934a;color:#14202b}'
      + '.npdro .pill .d{font-size:.62rem;color:#8a939b}'
      + '.npdro .price-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:4px}'
      + '.npdro .price-box{min-width:150px}'
      + '.npdro .subset-card{border:2px dashed #b9a44e;border-radius:12px;background:#fffdf4;margin-bottom:14px;overflow:hidden}'
      + '.npdro .subset-head{background:#fff5d6;border-bottom:2px dashed #b9a44e;padding:8px 13px;font-weight:700;font-size:.9rem}'
      + '.npdro .ss-badge{font-family:"JetBrains Mono",monospace;font-weight:700;background:#1a1d20;color:#fff;padding:2px 8px;border-radius:6px;font-size:.76rem;margin-left:6px}'
      + '.npdro table{width:100%;border-collapse:collapse;font-size:.78rem}'
      + '.npdro thead.pw th{background:#e8f6ee;color:#0b4d2c}'
      + '.npdro thead.rm th{background:#2e934a;color:#fff}'
      + '.npdro th{padding:6px;font-size:.7rem;white-space:nowrap;text-align:center;font-weight:700}'
      + '.npdro td{padding:5px 7px;border-bottom:1px solid #eef1f4;text-align:center;vertical-align:middle}'
      + '.npdro td.l{text-align:left}'
      + '.npdro .tbl-wrap{overflow-x:auto;padding:0 12px 12px}'
      + '.npdro .hint{font-size:.72rem;color:#8a939b}'
      + '.npdro .fml{background:#eef7f1;border:1px solid #bfe3cd;border-radius:10px;padding:10px 14px;margin-top:6px}'
      + '.npdro .fml li{font-size:.85rem;margin-bottom:2px}'
      + '.npdro .ro-badge{display:inline-block;font-size:.7rem;font-weight:700;background:#e9ecef;color:#495057;border-radius:20px;padding:3px 11px}';
    var st = document.createElement('style'); st.id = 'pc-npdro-css'; st.textContent = css; document.head.appendChild(st);
  }

  function powderTable(list) {
    var rows = (list || []).map(function (w, i) {
      return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(w.cmpos || '—') + '</td><td class="l">' + esc(w.eng || '-') + '</td><td class="l">' + esc(w.th || '') + '</td><td class="mono">' + esc(w.code || '') + '</td><td class="l">' + esc(w.desc || '') + '</td><td>' + esc(w.qty || '') + '</td><td>' + esc(w.unit || '') + '</td><td class="l">' + esc(w.spoon || '') + '</td><td>' + ((+w.price > 0) ? '+' + baht(+w.price) : '-') + '</td></tr>';
    }).join('') || '<tr><td colspan="10" class="hint">ไม่มีผง</td></tr>';
    return '<div class="tbl-wrap"><table><thead class="pw"><tr><th>No</th><th>CMPOS</th><th>ENG Name</th><th>TH Name</th><th>รหัส RM</th><th>รายละเอียด (Description)</th><th>จำนวน<br>(Qty)</th><th>หน่วย<br>(Unit)</th><th>ช้อน</th><th>ราคา<br>(Price)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function subsetSection(n) {
    var cards = (n.subsets || []).map(function (s) {
      return '<div class="subset-card"><div class="subset-head"><i class="fas fa-mortar-pestle me-1"></i>' + esc(s.name || 'Subset') + (s.ssCode ? '<span class="ss-badge">' + esc(s.ssCode) + '</span>' : '') + (s.name2 ? ' <span class="hint">· ' + esc(s.name2) + ' (ตัวย่อผงบน POS)</span>' : '') + '</div>' + powderTable(s.powders) + '</div>';
    }).join('') || '<div class="hint mb-2">— ไม่มี Subset —</div>';
    return '<div class="subhead2"><i class="fas fa-layer-group text-warning"></i>คลัง Subset สูตรผง (ใช้ร่วมทุกสินค้า)</div>' + cards;
  }

  var CUR = null, LASTOPTS = {};
  function isAdmin() { try { return (localStorage.getItem('pc_role') || 'Admin') === 'Admin'; } catch (e) { return true; } }
  /* ตัวเลือก Subset — รวม Subset ในใบนี้ + คลัง Subset กลาง (เหมือนหน้ากรอก RD) */
  function subsetOpts(sel) {
    var seen = {}, list = [];
    (CUR && CUR.subsets || []).forEach(function (s) { var v = s.ssCode || s.name || ''; if (v && !seen[v]) { seen[v] = 1; list.push({ v: v, t: (s.ssCode ? s.ssCode + ' · ' : '') + (s.name || 'Subset') }); } });
    try { (window.PC_SUBSET_MASTER || []).forEach(function (s) { var v = s.ssCode || ''; if (v && !seen[v]) { seen[v] = 1; list.push({ v: v, t: v + ' · ' + (s.name || '') }); } }); } catch (e) {}
    if (sel && !seen[sel]) list.unshift({ v: sel, t: sel });
    return '<option value="">— เลือก Subset —</option>' + list.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(sel || '') ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('');
  }
  function fmlEdit(it, idx) {
    var rows = (it.formulas || []).map(function (f, fi) {
      var mn = (f.chooseMin != null && f.chooseMin !== '') ? f.chooseMin : (f.choose || 1);
      var mx = (f.chooseMax != null && f.chooseMax !== '') ? f.chooseMax : (f.choose || mn);
      return '<div class="d-flex gap-2 align-items-center mb-2 flex-wrap">'
        + '<span class="badge bg-dark">#' + (fi + 1) + '</span>'
        + '<span class="ss-badge">' + esc(f.ss || '—') + '</span>'
        + '<select class="form-select form-select-sm border-dark" style="max-width:280px" onchange="PC_NpdView.setFml(' + idx + ',' + fi + ',\'ss\',this.value)">' + subsetOpts(f.ss) + '</select>'
        + '<span class="hint">Min</span><input type="number" min="1" class="form-control form-control-sm border-dark text-center fw-bold" style="width:64px" value="' + esc(mn) + '" oninput="PC_NpdView.setFml(' + idx + ',' + fi + ',\'chooseMin\',this.value)">'
        + '<span class="hint">Max</span><input type="number" min="1" class="form-control form-control-sm border-dark text-center fw-bold" style="width:64px" value="' + esc(mx) + '" oninput="PC_NpdView.setFml(' + idx + ',' + fi + ',\'chooseMax\',this.value)">'
        + '<span class="hint">ผง</span>'
        + '<i class="fas fa-times text-danger ms-auto" style="cursor:pointer" title="ลบสูตรนี้" onclick="PC_NpdView.delFml(' + idx + ',' + fi + ')"></i></div>';
    }).join('') || '<div class="hint mb-2">ยังไม่มีสูตรผง</div>';
    return rows + '<button class="btn btn-sm btn-success fw-bold" onclick="PC_NpdView.addFml(' + idx + ')"><i class="fas fa-plus me-1"></i>เพิ่มสูตรผง</button>';
  }

  function itemCard(it, idx) {
    var sm = (it.saleModes || it.channels || []).map(normCh);
    var pills = CH.map(function (ch) {
      var on = sm.indexOf(ch) !== -1, dlv = DLV.indexOf(ch) !== -1;
      return '<span class="pill' + (on ? ' on' : '') + '">' + esc(ch) + (dlv ? ' <span class="d">DLV</span>' : '') + '</span>';
    }).join('');
    // prices
    var pr = '';
    pr += isAdmin()
      ? '<div class="price-box"><label>Selling Price · Take Away <span class="tag">แอดมินแก้ได้</span></label><div class="input-group input-group-sm"><span class="input-group-text">฿</span><input type="number" min="0" class="form-control form-control-sm border-dark text-center fw-bold" value="' + esc(it.priceTakeaway || '') + '" oninput="PC_NpdView.setTA(' + idx + ',this.value)"></div></div>'
      : '<div class="price-box"><label>Selling Price · Take Away</label><div class="ro">' + (it.priceTakeaway ? baht(it.priceTakeaway) : '—') + '</div></div>';
    if (isAdmin()) {
      pr += '<div class="price-box"><label>Selling Price · Delivery <span class="tag">แอดมินแก้ได้</span></label><div class="input-group input-group-sm"><span class="input-group-text">฿</span><input type="number" min="0" class="form-control form-control-sm border-dark text-center fw-bold" value="' + esc(it.priceDelivery || '') + '" oninput="PC_NpdView.setDlv(' + idx + ',this.value)"></div></div>';
    } else {
      if (it.priceDelivery) pr += '<div class="price-box"><label>Selling Price · Delivery</label><div class="ro">' + baht(it.priceDelivery) + '</div></div>';
      DLV.forEach(function (c) { if (it.prices && it.prices[c] != null && it.prices[c] !== '') pr += '<div class="price-box"><label>' + esc(c) + ' DLV</label><div class="ro">' + baht(it.prices[c]) + '</div></div>'; });
    }

    // raw material
    var rm = (it.recipes || []).map(function (r, i) {
      var ch = (r.channels || []).map(normCh).join(', ');
      return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(r.code || r.itemCode || '-') + '</td><td class="l">' + esc(r.desc || r.description || '') + '</td><td>' + esc(r.qty || r.quantity || '') + '</td><td>' + esc(r.unit || '') + '</td><td class="l">' + esc(ch || '-') + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="hint">—</td></tr>';
    // formula Min–Max
    var fml = (it.formulas || []).map(function (f) {
      var mn = (f.chooseMin != null && f.chooseMin !== '') ? f.chooseMin : f.choose;
      var mx = (f.chooseMax != null && f.chooseMax !== '') ? f.chooseMax : f.choose;
      var rng = (mn && mx && String(mn) !== String(mx)) ? (esc(mn) + '–' + esc(mx)) : esc(mx || mn || f.choose || '1');
      return '<li>เลือกได้ <b>' + rng + '</b> ผง จาก <b>' + esc(f.ss || f.subName || '-') + '</b></li>';
    }).join('') || '<li class="hint">ไม่มีสูตรผง</li>';

    return '<div class="item-card"><div class="item-head"><i class="fas fa-box-open me-2"></i>ปุ่มสินค้า #' + (idx + 1) + '</div><div class="pad">'
      + '<div class="grid" style="margin-bottom:12px">'
      + '<div><label>Item Code</label><div class="ro mono">' + esc(it.code || it.itemCode || '—') + '</div></div>'
      + '<div><label>Item Name (EN)<span class="tag">โชว์บิลครัว</span></label><div class="ro">' + esc(it.name || '-') + '</div></div>'
      + '<div><label>Item Name (TH)<span class="tag">ปุ่ม POS</span></label><div class="ro">' + esc(it.th || '-') + '</div></div>'
      + '<div><label>หมวดหมู่</label><div class="ro">' + esc(it.category || '-') + '</div></div>'
      + '</div>'
      + '<div class="subhead2"><i class="fas fa-truck text-warning"></i>Sale Mode (ช่องทางขาย)</div><div class="pills">' + pills + '</div>'
      + '<div class="subhead2"><i class="fas fa-tag text-success"></i>Selling Price (฿)</div><div class="price-row">' + pr + '</div>'
      + '<div class="subhead2"><i class="fas fa-list-ol text-success"></i>Raw Material — ผูกกับช่องทางขาย</div>'
      + '<div class="tbl-wrap" style="padding-left:0;padding-right:0"><table><thead class="rm"><tr><th>No</th><th>รหัสสินค้า</th><th>รายละเอียด (Description)</th><th>จำนวน (Qty)</th><th>หน่วย (Unit)</th><th>ช่องทาง</th></tr></thead><tbody>' + rm + '</tbody></table></div>'
      + '<div class="subhead2"><i class="fas fa-flask text-success"></i>สูตรผง (Powder Formula) — อ้างอิงคลัง Subset</div><div class="fml">' + (isAdmin() ? fmlEdit(it, idx) : '<ul class="mb-0">' + fml + '</ul>') + '</div>'
      + '</div></div>';
  }

  function setTA(idx, v) { if (CUR && CUR.items && CUR.items[idx]) CUR.items[idx].priceTakeaway = String(v || '').trim(); }
  function setDlv(idx, v) { if (CUR && CUR.items && CUR.items[idx]) CUR.items[idx].priceDelivery = String(v || '').trim(); }
  function setCh(idx, ch, v) { var it = CUR && CUR.items && CUR.items[idx]; if (!it) return; it.prices = it.prices || {}; it.prices[ch] = String(v || '').trim(); }
  function rerender() {
    var el = document.getElementById('pc-npdro-root'); if (!el) return;
    el.outerHTML = render(CUR, LASTOPTS);
  }
  function setFml(idx, fi, k, v) {
    var it = CUR && CUR.items && CUR.items[idx]; if (!it || !it.formulas || !it.formulas[fi]) return;
    var f = it.formulas[fi];
    if (k === 'ss') {
      f.ss = v;
      var s = (CUR.subsets || []).find(function (x) { return String(x.ssCode || '') === String(v) || String(x.name || '') === String(v); });
      if (s) f.ssName = s.name || '';
      else { try { var d = (window.PC_SUBSET_MASTER || []).find(function (x) { return String(x.ssCode) === String(v); }); if (d) f.ssName = d.name || ''; } catch (e) {} }
      rerender(); return;
    }
    var num = parseInt(v, 10) || 1;
    f[k] = num;
    var mn = parseInt(f.chooseMin, 10) || 1, mx = parseInt(f.chooseMax, 10) || mn;
    if (mx < mn) { if (k === 'chooseMin') mx = mn; else mn = mx; }
    f.chooseMin = mn; f.chooseMax = mx; f.choose = mx;
  }
  function addFml(idx) {
    var it = CUR && CUR.items && CUR.items[idx]; if (!it) return;
    (it.formulas = it.formulas || []).push({ ss: '', ssName: '', chooseMin: 1, chooseMax: 1, choose: 1 });
    rerender();
  }
  function delFml(idx, fi) {
    var it = CUR && CUR.items && CUR.items[idx]; if (!it || !it.formulas) return;
    it.formulas.splice(fi, 1); rerender();
  }
  function savePrices() {
    if (!CUR) return;
    var bad = null;
    (CUR.items || []).forEach(function (it, i) { (it.formulas || []).forEach(function (f, fi) { if (!bad && !String(f.ss || '').trim()) bad = 'ปุ่มสินค้า "' + (it.name || '#' + (i + 1)) + '": สูตรผง #' + (fi + 1) + ' ยังไม่ได้เลือก Subset'; }); });
    if (bad) { if (window.Swal) Swal.fire({ icon: 'warning', title: 'กรอกข้อมูลไม่ครบ', text: bad, confirmButtonColor: '#000' }); return; }
    var run = (typeof google !== 'undefined' && google.script && google.script.run);
    if (!run) { if (window.Swal) Swal.fire('บันทึกไม่ได้', 'ยังต่อระบบหลังบ้านไม่ได้', 'error'); return; }
    var _payload = Object.assign({}, CUR, { _adminEdit: true });
    /* เก็บเฉพาะช่องทางที่ใส่ราคาจริง — ช่องไหนไม่ใส่ราคา = ตัดออก */
    _payload.items = (CUR.items || []).map(function (it) {
      var c = JSON.parse(JSON.stringify(it));
      var hasTA = String(c.priceTakeaway || '').trim() !== '';
      var hasDlv = String(c.priceDelivery || '').trim() !== '';
      var sm = (c.saleModes || c.channels || []).map(normCh);
      var keep = [];
      if (hasTA) keep.push('Take-Away');
      if (hasDlv) {
        var dl = sm.filter(function (x) { return DLV.indexOf(x) !== -1; });
        keep = keep.concat(dl.length ? dl : DLV.slice());
      }
      c.saleModes = keep;
      var px = {};
      keep.forEach(function (ch) {
        if (ch === 'Take-Away') px[ch] = c.priceTakeaway;
        else px[ch] = (c.prices && c.prices[ch] != null && String(c.prices[ch]).trim() !== '') ? c.prices[ch] : c.priceDelivery;
      });
      c.prices = px;
      c.recipes = (c.recipes || []).map(function (r) {
        r.channels = (r.channels || []).map(normCh).filter(function (ch) { return keep.indexOf(ch) !== -1; });
        return r;
      });
      return c;
    });
    /* สูตรผงที่อ้าง Subset จากคลังกลาง — ต้องแนบ Subset นั้นไปกับใบด้วย ไม่งั้นหน้า IT หาตัวไม่เจอ (ดูเหมือนข้อมูลไม่อัปเดต) */
    _payload.subsets = (CUR.subsets || []).slice();
    var _have = {}; _payload.subsets.forEach(function (s) { if (s.ssCode) _have[s.ssCode] = 1; if (s.name) _have[s.name] = 1; });
    _payload.items.forEach(function (c) {
      (c.formulas || []).forEach(function (f) {
        var v = String(f.ss || "").trim(); if (!v || _have[v]) return;
        var d = null; try { d = (window.PC_SUBSET_MASTER || []).find(function (x) { return String(x.ssCode) === v; }); } catch (e) {}
        _payload.subsets.push({ ssCode: v, name: (d && d.name) || f.ssName || v, name2: (d && d.short) || "", cat: "", powders: [], fromMaster: true });
        _have[v] = 1;
      });
    });
    var noPrice = _payload.items.filter(function (c) { return !c.saleModes.length; });
    if (noPrice.length === _payload.items.length) { if (window.Swal) Swal.fire({ icon: 'warning', title: 'ยังไม่ได้ใส่ราคา', text: 'กรอกราคา Take Away หรือ Delivery อย่างน้อย 1 ช่องก่อนบันทึก', confirmButtonColor: '#000' }); return; }
    google.script.run
      .withSuccessHandler(function () {
        CUR = _payload; delete CUR._adminEdit;
        rerender();
        /* ดันข้อมูลที่แก้แล้วเข้าหน้ารายงาน/ติดตามทันที */
        try { if (window.loadCtNpd) window.loadCtNpd(); } catch (e) {}
        try { if (window.loadNpdOp) window.loadNpdOp(); } catch (e) {}
        try { if (window.loadItNpd) window.loadItNpd(); } catch (e) {}
        if (window.Swal) Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', text: 'อัปเดตเข้าหน้ารายงาน/ติดตามงานเรียบร้อย', timer: 1600, showConfirmButton: false });
      })
      .withFailureHandler(function (e) { if (window.Swal) Swal.fire('Error', String(e), 'error'); })
      .updateNpd(CUR.id, _payload);
  }

  function render(n, opts) {
    opts = opts || {};
    injectCSS();
    CUR = n; LASTOPTS = opts;
    var back = opts.back || '';
    var head = '<div class="rohead">'
      + (back ? '<button class="btn btn-outline-dark fw-bold" onclick="' + back + '"><i class="fas fa-arrow-left me-1"></i>ย้อนกลับ</button>' : '<span></span>')
      + '<span class="fw-bold">' + esc(n.id || '') + ' · ' + esc(n.project || '') + '</span>'
      + (isAdmin()
        ? '<span class="d-inline-flex align-items-center gap-2"><span class="ro-badge"><i class="fas fa-user-shield me-1"></i>โหมดแอดมิน · แก้ราคา Take Away + สูตรผงได้</span><button class="btn btn-success btn-sm fw-bold" onclick="PC_NpdView.savePrices()"><i class="fas fa-check me-1"></i>บันทึก</button></span>'
        : '<span class="ro-badge"><i class="fas fa-eye me-1"></i>ดูอย่างเดียว · แก้ไขไม่ได้</span>') + '</div>';
    var info = '<div class="card2"><div class="sec-head"><i class="fas fa-circle-info me-2"></i>ข้อมูลทั่วไป (Project)</div><div class="pad"><div class="grid">'
      + '<div><label>ชื่อชุดสินค้า / Project</label><div class="ro">' + esc(n.project || '-') + '</div></div>'
      + '<div><label>วันที่เริ่ม</label><div class="ro">' + esc(dt(n.start)) + '</div></div>'
      + '<div><label>วันที่สิ้นสุด</label><div class="ro">' + esc(dt(n.end)) + '</div></div>'
      + '<div><label>RD ผู้แจ้ง</label><div class="ro">' + esc(n.rd || '-') + '</div></div>'
      + '<div style="grid-column:1/-1"><label>สาขาที่ร่วมรายการ</label><div class="ro">' + esc(n.store || 'ALL') + '</div></div>'
      + '<div><label>หมวดสินค้า</label><div class="ro">' + esc(n.category || '-') + '</div></div>'
      + (n.cateCode ? '<div><label>Category Code (CMPOS)</label><div class="ro mono">' + esc(n.cateCode) + '</div></div>' : '')
      + (n.remark ? '<div style="grid-column:1/-1"><label>Remark</label><div class="ro">' + esc(n.remark) + '</div></div>' : '')
      + '</div></div></div>';
    var products = '<div class="subhead2"><i class="fas fa-box-open text-warning"></i>ปุ่มสินค้า (' + (n.items || []).length + ')</div>' + (n.items || []).map(itemCard).join('');
    return '<div class="npdro" id="pc-npdro-root">' + head + info + subsetSection(n) + products + '</div>';
  }

  window.PC_NpdView = { render: render, setTA: setTA, setDlv: setDlv, setCh: setCh, setFml: setFml, addFml: addFml, delFml: delFml, savePrices: savePrices };
})();
