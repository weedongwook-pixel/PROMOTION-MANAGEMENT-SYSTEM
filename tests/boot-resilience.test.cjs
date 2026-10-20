const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'Potato Corner Promotion System.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = shell.indexOf('window.__pcBoot = (function () {');
const end = shell.indexOf('window.PC_ensureItemMaster =', start);
assert.ok(start >= 0 && end > start);
test('the outer entry page has no normal preparation/loading caption',()=>{
 assert.doesNotMatch(index, /กำลังโหลดระบบโปรโมชัน|กำลังเตรียมระบบ/);
 assert.match(index,/id="slow" hidden/,'Slow-load recovery stays available');
});

function startBoot(fetchImpl) {
  const status = { textContent: '' };
  const retry = { hidden: true };
  const spinner = { hidden: false };
  const window = { Swal: {}, bootstrap: {}, __moduleLog: [] };
  let context;
  const document = {
    readyState: 'complete',
    getElementById(id) { return id === 'boot-status' ? status : id === 'boot-retry' ? retry : null; },
    querySelector() { return spinner; },
    createElement() { return { textContent: '' }; },
    head: { appendChild(script) { vm.runInContext(script.textContent, context); } }
  };
  context = vm.createContext({ window, document, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, console, Promise, Error });
  vm.runInContext(shell.slice(start, end), context);
  return { window, status, retry, spinner };
}

function okModule(src) {
  return {
    ok: true,
    text: async () => src.includes('item-master.js')
      ? 'window.PC_ITEM_MASTER=[{itemCode:"1"}]'
      : 'window.__moduleLog.push(1)'
  };
}

test('a transient module failure retries without skipping a dependency', async () => {
  let attempts = 0;
  const app = startBoot(async url => {
    if (url.includes('js/mock-backend.js') && attempts++ === 0) throw new Error('temporary network failure');
    return okModule(url);
  });
  await new Promise(resolve => app.window.__pcBoot.onReady(resolve));
  assert.equal(attempts, 2);
  assert.equal(app.window.__moduleLog.length, 73);
  assert.equal(app.window.__pcBoot.failed(), null);
  assert.equal(app.retry.hidden, true);
});

test('a missing required module never reports ready and offers recovery', async () => {
  const app = startBoot(async url => {
    if (url.includes('js/mock-backend.js')) throw new Error('offline');
    return okModule(url);
  });
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(app.window.__pcBoot.isReady(), false);
  assert.match(String(app.window.__pcBoot.failed()), /mock-backend\.js/);
  assert.match(app.status.textContent, /โหลดระบบไม่ครบ/);
  assert.equal(app.status.hidden, false, 'Boot errors remain visible even though normal preparation text is hidden');
  assert.equal(app.retry.hidden, false);
  assert.equal(app.spinner.hidden, true);
});

test('critical UI libraries are local and startup no longer waits for window.onload', () => {
  const vendor = [
    'vendor/bootstrap/bootstrap.min.css',
    'vendor/bootstrap/bootstrap.bundle.min.js',
    'vendor/sweetalert2/sweetalert2.all.min.js',
    'vendor/msal/msal-browser.min.js',
    'vendor/fontawesome/css/all.min.css',
    'vendor/fontawesome/webfonts/fa-solid-900.woff2',
    'vendor/fontawesome/webfonts/fa-regular-400.woff2',
    'vendor/fontawesome/webfonts/fa-brands-400.woff2',
    'vendor/fontawesome/webfonts/fa-v4compatibility.woff2'
  ];
  const source = fs.readFileSync(path.join(root, 'scripts/vendor-ui-assets.mjs'), 'utf8');
  for (const file of vendor) {
    assert.ok(fs.statSync(path.join(root, file)).size > 1000, `${file} should be checked in`);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    assert.ok(source.includes(`'${file}'`) && source.includes(`'${hash}'`), `${file} must match its pinned SHA-256`);
  }
  assert.match(shell, /document\.addEventListener\('DOMContentLoaded', beginBoot/);
  assert.doesNotMatch(shell, /window\.onload\s*=/);
  assert.match(index, /id="slow" hidden/);
  assert.match(index, /เปิดเว็บโดยตรง/);
  const build = 'p5-20261008-resilient-boot';
  assert.ok(shell.includes(build) && index.includes(build));
  assert.ok(fs.readFileSync(path.join(root, 'js/mock-backend.js'), 'utf8').includes(build));
  assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /potato-v81-email-network-only/);
});

test('session restoration errors show recovery instead of leaving an endless splash',()=>{
 const begin=shell.slice(shell.indexOf('    function beginBoot()'),shell.indexOf("    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', beginBoot"));
 const failure=Error('restore failed');let reported;
 const context={window:{Swal:{},bootstrap:{},__pcBoot:{onReady:fn=>fn(),fail:error=>reported=error}},localStorage:{getItem:key=>key==='pc_session'?'active':'Dashboard'},initApp(){throw failure;},document:{},console:{error(){}}};
 vm.runInNewContext(begin+'\nbeginBoot();',context);assert.equal(reported,failure);
});
