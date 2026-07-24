import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const schedule = JSON.parse(fs.readFileSync(path.join(base, 'data/voca18_schedule.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(base, 'data/learning_units.json'), 'utf8'));
let source = fs.readFileSync(path.join(base, 'webapp/app.js'), 'utf8');
source = source.replace(/\nboot\(\);\s*$/, '\n');

class ClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    if (force === true) { this.values.add(value); return true; }
    if (force === false) { this.values.delete(value); return false; }
    if (this.values.has(value)) { this.values.delete(value); return false; }
    this.values.add(value); return true;
  }
  contains(value) { return this.values.has(value); }
}

class ElementStub {
  constructor(id = '') {
    this.id = id;
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.onclick = null;
    this.children = [];
    this.className = '';
    this.classList = new ClassList();
    this.listeners = new Map();
    this.style = { values: {}, setProperty: (key, value) => { this.style.values[key] = value; } };
  }
  appendChild(child) { this.children.push(child); return child; }
  remove() {}
  focus() {}
  select() {}
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  click() {
    if (typeof this.onclick === 'function') this.onclick();
    const listener = this.listeners.get('click');
    if (listener) listener({ target: this });
  }
}

const elements = new Map();
const getElement = (id) => {
  if (!elements.has(id)) elements.set(id, new ElementStub(id));
  return elements.get(id);
};

const storage = new Map();
const localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const document = {
  hidden: false,
  body: new ElementStub('body'),
  getElementById: getElement,
  createElement: () => new ElementStub(),
  querySelector: () => new ElementStub(),
  querySelectorAll: () => [],
  addEventListener: () => {},
};

const context = vm.createContext({
  console,
  document,
  localStorage,
  window: { confirm: () => true, alert: () => {}, addEventListener: () => {} },
  fetch: async () => ({ ok: false, status: 503 }),
  setTimeout: () => 1,
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  Blob,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  Date,
  Map,
  Set,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Promise,
});

vm.runInContext(source, context, { filename: 'app.js' });
vm.runInContext(`
  runtime.schedule = ${JSON.stringify(schedule)};
  runtime.content = ${JSON.stringify(content)};
  runtime.unitMap = new Map();
  runtime.content.units.forEach((unit) => runtime.unitMap.set(unit.id, unit));
  runtime.state = sanitizeState(defaultState());
  persist();
`, context);

const value = (expression) => vm.runInContext(expression, context);
const jsonValue = (expression) => JSON.parse(value(`JSON.stringify(${expression})`));

assert.equal(value('runtime.state.currentDay'), 1);
assert.equal(value('runtime.state.schemaVersion'), 3);
assert.equal(value('runtime.state.settings.email'), 'sk01197375068@gmail.com');
assert.equal(value('currentDayDef(1).words'), 84);

// Partial progress persists and reloads.
value(`(() => {
  const ds=dayState(1);
  ds.phase='word'; ds.unitIndex=0; ds.wordIndex=1;
  ds.answers={'u1-w1':'correct'};
  ds.stats={attempted:1,correct:1,wrong:0,typed:0};
  persist();
})()`);
value('runtime.state = loadState()');
assert.equal(value("Object.keys(dayState(1).answers).length"), 1);
assert.equal(value('totalCompletedWords(1)'), 1);

// Corrupt values are repaired.
const sanitized = jsonValue(`sanitizeState({
  currentDay:99,
  completedDays:[1,1,0,19],
  settings:{blockMinutes:99},
  days:{'1':{completedBlocks:[0,0,9,-1],block:99,stats:{attempted:-2,correct:-1,wrong:-5,typed:-7}}}
})`);
assert.equal(sanitized.currentDay, 18);
assert.deepEqual(sanitized.completedDays, [1]);
assert.equal(sanitized.settings.blockMinutes, 15);
assert.deepEqual(sanitized.days['1'].completedBlocks, [0]);
assert.equal(sanitized.days['1'].block, 3);
assert.deepEqual(sanitized.days['1'].stats, { attempted: 0, correct: 0, wrong: 0, typed: 0 });

// Duplicate spelling submissions count only once.
const typing = jsonValue(`(() => {
  runtime.state=sanitizeState(defaultState());
  const ds=dayState(1);
  ds.phase='review'; ds.reviewQueue=['u1-w1']; ds.reviewIndex=0;
  renderTypingReview();
  const word=findWordById('u1-w1');
  checkSpelling(word, word.word);
  checkSpelling(word, word.word);
  return {typed:ds.stats.typed,resolved:ds.reviewResolved};
})()`);
assert.deepEqual(typing, { typed: 1, resolved: true });

// Completion is blocked before four blocks.
value('runtime.state=sanitizeState(defaultState())');
let blocked = false;
try { await value('finishDay(false)'); } catch { blocked = true; }
assert.equal(blocked, true);

// Normal completion is persisted; failed mail goes to retry queue.
const completed = JSON.parse(await value(`(async () => {
  runtime.state=sanitizeState(defaultState());
  const ds=dayState(1);
  ds.completedBlocks=[0,1,2,3]; ds.firstStartedAt=nowIso(); ds.elapsedSeconds=3300;
  ds.stats={attempted:84,correct:80,wrong:4,typed:4};
  await finishDay(false);
  return JSON.stringify({
    completed:!!ds.completedAt,
    days:runtime.state.completedDays,
    pending:runtime.state.pendingReports.length,
    accuracy:buildReport(1).summary.accuracy
  });
})()`));
assert.deepEqual(completed, { completed: true, days: [1], pending: 1, accuracy: 95 });

// Forced completion does not report a fabricated 100% accuracy.
const forced = JSON.parse(await value(`(async () => {
  runtime.state=sanitizeState(defaultState()); runtime.state.currentDay=2;
  const ds=dayState(2); await finishDay(true);
  const report=buildReport(2);
  return JSON.stringify({forced:ds.forced,accuracy:report.summary.accuracy,attempted:report.summary.attempted});
})()`));
assert.deepEqual(forced, { forced: true, accuracy: null, attempted: 0 });

// Final DAY state is visible and cannot be restarted accidentally.
const finalState = jsonValue(`(() => {
  runtime.state=sanitizeState(defaultState()); runtime.state.currentDay=18;
  const ds=dayState(18); ds.completedAt=nowIso(); ds.completedBlocks=[0,1,2,3];
  runtime.state.completedDays=[18]; renderHome();
  return {
    disabled:$('startButton').disabled,
    text:$('startButton').textContent,
    notice:$('resumeNotice').textContent
  };
})()`);
assert.deepEqual(finalState, {
  disabled: true,
  text: '18DAY 과정 완료',
  notice: '전체 18DAY 과정을 완료했습니다.',
});

console.log('PROGRESS_LOGIC_OK');
console.log(JSON.stringify({
  default_day: 1,
  default_email: 'sk01197375068@gmail.com',
  partial_progress_restored: true,
  corrupt_state_sanitized: true,
  duplicate_typing_blocked: true,
  incomplete_day_blocked: true,
  completed_day_queued_mail: true,
  forced_accuracy: null,
  final_course_locked: true,
}, null, 2));
