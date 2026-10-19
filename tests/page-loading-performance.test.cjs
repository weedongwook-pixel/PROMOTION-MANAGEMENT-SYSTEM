const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'Potato Corner Promotion System.html'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'js/mock-backend.js'), 'utf8');
const tracking = fs.readFileSync(path.join(root, 'js/campaign-tracking.js'), 'utf8');

function loadMemoWithFailures(failures) {
  const start = shell.indexOf('function loadPage(pg, el, fromHistory, retryAttempt) {');
  const end = shell.indexOf('// load a sub-page partial', start);
  assert.ok(start >= 0 && end > start);
  let attempts = 0;
  let initialized = 0;
  const detail = { textContent: '' };
  const area = {
    innerHTML: '',
    querySelector(selector) {
      return selector === '[data-pc-error-detail]' ? detail : { addEventListener() {} };
    },
  };
  const nav = { classList: { add() {} } };
  const context = vm.createContext({
    window: {
      __pageGen: 0,
      innerWidth: 1200,
      history: { state: { pcPage: 'Memo' }, pushState() {} },
      initMemo() { initialized++; },
    },
    document: {
      body: { classList: { remove() {} }, style: {} },
      querySelectorAll() { return []; },
      getElementById(id) {
        return id === 'content-area' ? area : id === 'nav-Memo' ? nav : null;
      },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    google: { script: { get run() {
      const runner = {
        withSuccessHandler(fn) { this.ok = fn; return this; },
        withFailureHandler(fn) { this.fail = fn; return this; },
        getPageContent() {
          attempts++;
          queueMicrotask(() => attempts <= failures ? this.fail(new Error('page offline')) : this.ok('<main>Memo Loaded</main>'));
        },
      };
      return runner;
    } } },
    navigator: { onLine: true },
    executeScripts: () => Promise.resolve(),
    setTimeout: callback => queueMicrotask(callback),
    Promise,
    console: { error() {}, warn() {} },
  });
  vm.runInContext(shell.slice(start, end), context);
  context.loadPage('Memo', nav, true);
  return new Promise(resolve => setTimeout(() => resolve({ attempts, initialized, area, detail }), 10));
}

test('Memo retries one first-open failure and shows the actual cause if it persists', async () => {
  const recovered = await loadMemoWithFailures(1);
  assert.equal(recovered.attempts, 2);
  assert.equal(recovered.initialized, 1);
  assert.equal(recovered.area.innerHTML, '<main>Memo Loaded</main>');

  const failed = await loadMemoWithFailures(2);
  assert.equal(failed.attempts, 2);
  assert.equal(failed.initialized, 0);
  assert.match(failed.area.innerHTML, /รายละเอียดสำหรับ IT/);
  assert.equal(failed.detail.textContent, 'Memo: page offline');
});

test('page script loader waits for local scripts before running dependent inline code', async () => {
  const start = shell.indexOf('async function executeScripts(container) {');
  const end = shell.indexOf('function toggleSidebar()', start);
  assert.ok(start >= 0 && end > start);
  const order = [];
  let context;
  const body = {
    appendChild(script) {
      script.parentNode = body;
      if (script.src) setTimeout(() => { order.push('loaded'); script.onload(); }, 15);
      else if (script.text) vm.runInContext(script.text, context);
    },
    removeChild(script) { script.parentNode = null; }
  };
  context = vm.createContext({
    window: { steps: order }, document: { body, createElement: () => ({}) },
    location: { href: 'https://example.test/', origin: 'https://example.test' },
    URL, setTimeout, clearTimeout, console
  });
  vm.runInContext(shell.slice(start, end), context);
  const container = { getElementsByTagName: () => [
    { type: '', src: 'https://example.test/js/page.js' },
    { type: '', textContent: 'window.steps.push("inline");' }
  ] };
  await context.executeScripts(container);
  assert.deepEqual(order, ['loaded', 'inline']);
});

test('page script loader retries a failed local script before initializing the page', async () => {
  const start = shell.indexOf('async function executeScripts(container) {');
  const end = shell.indexOf('function toggleSidebar()', start);
  let attempts = 0;
  const order = [];
  let context;
  const body = {
    appendChild(script) {
      script.parentNode = body;
      if (script.src) {
        attempts++;
        const shouldFail = attempts === 1;
        setTimeout(() => {
          if (shouldFail) script.onerror();
          else { order.push('loaded'); script.onload(); }
        }, 1);
      } else if (script.text) vm.runInContext(script.text, context);
    },
    removeChild(script) { script.parentNode = null; }
  };
  context = vm.createContext({
    window: { steps: order }, document: { body, createElement: () => ({}) },
    location: { href: 'https://example.test/', origin: 'https://example.test' },
    URL, setTimeout, clearTimeout, console
  });
  vm.runInContext(shell.slice(start, end), context);
  await context.executeScripts({ getElementsByTagName: () => [
    { type: '', src: 'https://example.test/js/memo.js' },
    { type: '', textContent: 'window.steps.push("inline");' }
  ] });
  assert.equal(attempts, 2);
  assert.deepEqual(order, ['loaded', 'inline']);
  const memo = fs.readFileSync(path.join(root, 'pages/Memo.html'), 'utf8');
  assert.doesNotMatch(memo, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/sweetalert2/);
});

test('a transient static page failure retries automatically and the success is reused', async () => {
  const start = backend.indexOf('  const pageContentCache = new Map();');
  const end = backend.indexOf('  API.include = () => "";', start);
  assert.ok(start >= 0 && end > start);
  let calls = 0;
  const context = vm.createContext({
    API: {}, Map, Error, AbortController, setTimeout, clearTimeout,
    fetch: async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return { ok: true, text: async () => '<main>Ready</main>' };
    }
  });
  vm.runInContext(backend.slice(start, end), context);
  assert.equal(await context.API.getPageContent('Memo'), '<main>Ready</main>');
  assert.equal(await context.API.getPageContent('Memo'), '<main>Ready</main>');
  assert.equal(calls, 2);
  await assert.rejects(context.API.getPageContent('../secrets'), /Invalid page name/);
});

test('static page load can be retried manually after all automatic attempts fail', async () => {
  const start = backend.indexOf('  const pageContentCache = new Map();');
  const end = backend.indexOf('  API.include = () => "";', start);
  let calls = 0;
  const context = vm.createContext({
    API: {}, Map, Error, AbortController, setTimeout, clearTimeout,
    fetch: async () => {
      calls++;
      if (calls <= 3) throw new Error('offline');
      return { ok: true, text: async () => '<main>Ready</main>' };
    }
  });
  vm.runInNewContext(backend.slice(start, end), context);
  await assert.rejects(context.API.getPageContent('Memo'), /offline/);
  assert.equal(calls, 3);
  assert.equal(await context.API.getPageContent('Memo'), '<main>Ready</main>');
  assert.equal(calls, 4);
});

test('tracking renders once after both badge queries and defaults to 30 rows', async () => {
  const context = vm.createContext({
    window: {},
    document: { getElementById: id => id === 'trackingTableBody' ? {} : null },
    localStorage: { getItem: () => 'Admin' },
    sessionStorage: { getItem: () => null },
    Swal: { fire() {}, close() {} },
    google: { script: { get run() {
      const runner = {
        withSuccessHandler(fn) { this.ok = fn; return this; },
        withFailureHandler(fn) { this.fail = fn; return this; },
        getAllCampaignData() { this.ok([{ campaign: 'A' }]); },
        getCoPromoCampaigns() { this.ok(['A']); },
        getCoPromoCodes() { this.ok(['P123']); }
      };
      return runner;
    } } },
    console, Set, Promise, setTimeout, clearTimeout
  });
  vm.runInContext(tracking, context);
  let renders = 0;
  context.window.clearViewState = () => {};
  context.window.populateFilters = () => {};
  context.window.renderTracking = () => { renders++; };
  context.window.__ctExtAsked = true;
  context.window.loadTrackingData();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(renders, 1);
  assert.equal(context.window.__ctCoPromo.has('A'), true);
  assert.equal(context.window.__ctCoPromoCodes.has('P123'), true);
  const html = fs.readFileSync(path.join(root, 'pages/Campaign_Tracking.html'), 'utf8');
  assert.match(html, /<option value="30" selected>30 แถว<\/option>/);
  assert.match(tracking, /let rowsPerPage = 30;/);
});
