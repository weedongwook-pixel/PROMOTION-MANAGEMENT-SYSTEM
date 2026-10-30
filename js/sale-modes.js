/* Sale modes — one source for every page.
 * The list, on/off state, per-form visibility and type (store / delivery) come from
 * Form Display Settings (pc_salemode_master + pc_mode_forms). Pages may keep their own
 * spelling of known channels for stored data; matching goes through key(), so
 * "LINE MAN", "Lineman" and "LINEMAN" are the same channel. */
(function (root) {
  'use strict';
  var KNOWN = [
    { name: 'Take-Away', type: 'ta', aliases: ['Take Away', 'TakeAway', 'TA', 'หน้าร้าน'] },
    { name: 'Grab', type: 'dlv', aliases: ['GrabFood'] },
    { name: 'Lineman', type: 'dlv', aliases: ['LINE MAN', 'LINE MAN Wongnai'] },
    { name: 'ShopeeFood', type: 'dlv', aliases: ['Shopee', 'Shopee Food'] },
    { name: 'Robinhood', type: 'dlv', aliases: [] },
    { name: 'foodpanda', type: 'dlv', aliases: ['Panda', 'Food Panda'] },
    { name: 'Gokoo', type: 'dlv', aliases: [] }
  ];
  // Group labels such as "ALL DELIVERY" are shortcuts, not channels.
  var AGGREGATE = /^(delivery|alldelivery|allchannel|allchannels|online|all)$/;

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s\-_.]+/g, ''); }
  function read(k, d) { try { var v = JSON.parse(root.localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function known(n) {
    var k = norm(n);
    for (var i = 0; i < KNOWN.length; i++) {
      var c = KNOWN[i];
      if (norm(c.name) === k || c.aliases.some(function (a) { return norm(a) === k; })) return c;
    }
    return null;
  }
  function key(n) { var c = known(n); return c ? norm(c.name) : norm(n); }
  function same(a, b) { return !!norm(a) && key(a) === key(b); }
  function isAggregate(n) { return AGGREGATE.test(norm(n)); }

  function master() {
    var m = read('pc_salemode_master', null);
    if (!Array.isArray(m) || !m.length) m = KNOWN.map(function (c) { return { name: c.name, active: 1 }; });
    var seen = {};
    return m.filter(function (x) { return x && String(x.name || '').trim() && !isAggregate(x.name); }).map(function (x) {
      var c = known(x.name);
      return { name: String(x.name).trim(), key: key(x.name), custom: !!x.custom,
        type: x.type === 'ta' || x.type === 'dlv' ? x.type : (c ? c.type : 'dlv'),
        active: x.active !== 0 && x.active !== false };
    }).filter(function (x) { if (seen[x.key]) return false; seen[x.key] = 1; return true; });
  }
  function find(n) { var k = key(n); return master().filter(function (m) { return m.key === k; })[0] || null; }
  function shownIn(m, formKey) {
    if (!m.active) return false;
    if (!formKey) return true;
    var f = read('pc_mode_forms', {}) || {}, o = f[m.name];
    return !(o && o[formKey] === false);
  }
  function typeOf(n) {
    var nk = norm(n);
    if (nk === 'alldelivery' || nk === 'delivery') return 'dlv';
    var m = find(n); if (m) return m.type;
    var c = known(n); return c ? c.type : '';
  }

  /* Channels to offer in a form or show in a view.
   * formKey: proposal | coupon | bill | voucher | npd | flavor | itemset | it | view (view = all active)
   * opts.include: values already stored in the record — always kept, even if switched off since.
   * opts.spell:   { 'Lineman': 'LINEMAN', ... } keeps a page's stored spelling for known channels. */
  function list(formKey, opts) {
    opts = opts || {};
    var spell = {}; Object.keys(opts.spell || {}).forEach(function (k) { spell[key(k)] = opts.spell[k]; });
    var out = [], have = {};
    master().forEach(function (m) {
      var include = (opts.include || []).some(function (v) { return same(v, m.name); });
      if (!include && !shownIn(m, formKey === 'view' ? '' : formKey)) return;
      out.push({ name: spell[m.key] || m.name, key: m.key, type: m.type, active: m.active }); have[m.key] = 1;
    });
    (opts.include || []).forEach(function (v) {
      if (!v || isAggregate(v) || have[key(v)]) return;
      out.push({ name: spell[key(v)] || String(v), key: key(v), type: typeOf(v) || 'dlv', active: false }); have[key(v)] = 1;
    });
    return out;
  }
  /* Tick a record's saved channels in a form card. Matching is alias-aware, and a saved channel
   * that has no checkbox any more (deleted from settings) gets one, ticked, so re-saving keeps it. */
  function restoreChecks(card, values) {
    var vals = (values || []).map(function (v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
    var match = function (v, el) { return same(v, el.value) || norm(v) === norm(el.value); };
    var boxes = Array.prototype.slice.call(card.querySelectorAll('.mode-check,.mode-check-all,.mode-check-delivery'));
    var reveal = function (el) { el.disabled = false; var h = el.closest('.form-check') || el.parentElement; if (h) { h.classList.remove('d-none'); h.style.display = ''; } };
    boxes.forEach(function (el) { el.checked = vals.some(function (v) { return match(v, el); }); if (el.checked) reveal(el); });
    var plain = boxes.filter(function (el) { return el.classList.contains('mode-check'); });
    vals.forEach(function (v) {
      if (isAggregate(v) || !plain.length || boxes.some(function (el) { return match(v, el); })) return;
      var dlv = typeOf(v) !== 'ta', peers = plain.filter(function (el) { return (typeOf(el.value) === 'dlv') === dlv; });
      var tpl = (peers.length ? peers : plain)[(peers.length ? peers : plain).length - 1], holder = tpl.closest('.form-check') || tpl.parentElement;
      var copy = holder.cloneNode(true), cb = copy.querySelector('.mode-check') || copy;
      cb.value = v; cb.checked = true; cb.setAttribute('data-mode-added', '1'); if (cb.id) cb.id += '_' + key(v);
      var lb = copy.querySelector('label'); if (lb) lb.textContent = v;
      holder.parentNode.insertBefore(copy, holder.nextSibling); reveal(cb); boxes.push(cb); plain.push(cb);
    });
  }
  function names(formKey, opts) { return list(formKey, opts).map(function (m) { return m.name; }); }
  function deliveries(formKey, opts) { return list(formKey, opts).filter(function (m) { return m.type === 'dlv'; }).map(function (m) { return m.name; }); }

  root.PC_SaleModes = {
    list: list, names: names, restoreChecks: restoreChecks, deliveries: deliveries, master: master,
    key: key, same: same, typeOf: typeOf, isAggregate: isAggregate,
    isDelivery: function (n) { return typeOf(n) === 'dlv'; },
    isTakeAway: function (n) { return typeOf(n) === 'ta'; },
    canonical: function (n) { var m = find(n); if (m) return m.name; var c = known(n); return c ? c.name : String(n || ''); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
