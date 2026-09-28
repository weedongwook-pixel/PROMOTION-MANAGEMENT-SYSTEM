/* รายการ Subset ที่ใช้ร่วมกัน: master เดิม + รายการที่เพิ่ม/แก้/ลบในหน้าข้อมูลหลัก */
(function () {
  'use strict';

  function read(key, fallback) {
    try { var value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
    catch (e) { return fallback; }
  }
  function nonempty(value) { return String(value == null ? '' : value).trim(); }

  function list() {
    var rows = [], byCode = {};
    var removed = read('pc_subset_deleted', {});
    var metadata = read('pc_subset_meta', {});
    var edits = read('pc_subset_edits', {});
    var custom = read('pc_subset_custom', []);
    var registered = read('pc_addon_subsets', {});
    var removedCodes = {};
    Object.keys(removed || {}).forEach(function (code) { if (removed[code]) removedCodes[code.toUpperCase()] = true; });

    function add(source, rank) {
      if (!source) return;
      var code = nonempty(source.ssCode || source.code);
      if (!code || removedCodes[code.toUpperCase()]) return;
      var key = code.toUpperCase();
      var existing = byCode[key];
      if (!existing) {
        existing = { ssCode: code, name: '', short: '', status: 'Active', _rank: 0 };
        byCode[key] = existing; rows.push(existing);
      }
      if (rank < existing._rank) return;
      var name = nonempty(source.nameEN) || nonempty(source.nameTH) || nonempty(source.name);
      if (name) existing.name = name;
      if (nonempty(source.short)) existing.short = nonempty(source.short);
      if (nonempty(source.status)) existing.status = nonempty(source.status);
      existing._rank = rank;
    }

    (window.PC_SUBSET_MASTER || []).forEach(function (row) { add(row, 3); });
    Object.keys(registered || {}).forEach(function (code) {
      add(Object.assign({ ssCode: code }, registered[code] || {}), 1);
    });
    if (Array.isArray(custom)) custom.forEach(function (row) { add(row, 2); });

    rows.forEach(function (row) {
      var meta = metadata[row.ssCode] || {}, edit = edits[row.ssCode] || {};
      row.name = nonempty(meta.nameEN) || nonempty(meta.nameTH) || nonempty(edit.name) || row.name || row.ssCode;
      row.short = nonempty(edit.short) || row.short || '';
      row.status = nonempty(meta.status) || row.status || 'Active';
      delete row._rank;
    });
    return rows;
  }

  window.PC_SubsetCatalog = { list: list };
})();
