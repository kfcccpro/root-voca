const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
let source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
source = source.replace(/\nboot\(\);\s*$/, '\n');
const storage = new Map();
const fakeElement = () => ({
  textContent: '', innerHTML: '', className: '', disabled: false, value: '',
  style: { setProperty() {} }, classList: { add(){}, remove(){}, contains(){return false;} },
  appendChild(){}, addEventListener(){}, focus(){}, select(){}, querySelector(){return null;},
});
const elements = new Map();
const document = {
  hidden: false,
  body: fakeElement(),
  getElementById(id) { if (!elements.has(id)) elements.set(id, fakeElement()); return elements.get(id); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return fakeElement(); },
  addEventListener() {},
};
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON,
  performance: { now: () => 1000 },
  crypto: require('crypto').webcrypto,
  localStorage: {
    getItem: (k) => storage.has(k) ? storage.get(k) : null,
    setItem: (k,v) => storage.set(k,String(v)),
    removeItem: (k) => storage.delete(k),
  },
  document,
  window: { addEventListener(){}, alert(){}, requestAnimationFrame:(fn)=>fn() },
  requestAnimationFrame: (fn) => fn(),
  fetch: async () => ({ ok: true, json: async()=>({}) }),
  Blob: function(){},
  URL: { createObjectURL(){return 'blob:x';}, revokeObjectURL(){} },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'app.js' });
const learning = JSON.parse(fs.readFileSync(path.join(root,'data','learning_units.json'),'utf8'));
const schedule = JSON.parse(fs.readFileSync(path.join(root,'data','voca_schedule.json'),'utf8'));
vm.runInContext(`runtime.content=${JSON.stringify(learning)}; runtime.schedule=${JSON.stringify(schedule)}; runtime.unitMap=new Map(runtime.content.units.map(u=>[u.id,u])); runtime.state=defaultState();`, sandbox);
const results = {};
function test(name, expr) {
  try { results[name] = !!vm.runInContext(expr, sandbox); }
  catch (e) { results[name] = false; results[name+'_error'] = String(e.stack || e); }
}
test('data_18_days', 'runtime.schedule.days.length===18');
test('data_360_roots', 'runtime.content.units.length===360');
test('data_1410_words', 'runtime.content.units.reduce((n,u)=>n+u.words.length,0)===1410');
vm.runInContext(`(() => { const ds=dayState(1); const words=blockUnits(1,0).flatMap(u=>u.words).slice(0,6); ds.reviewQueue=words.map(w=>String(w.id)); words.forEach((w,i)=>{ds.answers[String(w.id)]='wrong'; wrongEntry(w.id).totalWrong=i+1;}); globalThis.__selected=prepareBlockReviewQueue(ds); })()`, sandbox);
test('block_review_max_4', '__selected.length===4');
test('block_review_prioritized', 'blockReviewPriority(__selected[0])>=blockReviewPriority(__selected[3])');
test('question_correct_fast', '!advanceWord.toString().includes("shouldShowMiniReward")');
test('root_click_removed', '!renderRoot.toString().includes("createElement") && renderRoot.toString().includes("root_auto_skip")');
test('wrong_explanation_state', 'answerChoice.toString().includes("wrongExplanation") && !answerChoice.toString().includes("ds.phase = \'review\'")');
test('wrong_no_immediate_typing', '!renderWrongExplanation.toString().includes("spellingInput") && renderWrongExplanation.toString().includes("확인하고 다음 단어")');
test('block_review_single_attempt', 'checkSpelling.toString().includes("ds.typingAttempts = 1") && !checkSpelling.toString().includes("한 번 더 입력")');
test('spaced_choice_no_typing_transition', '!answerSpacedChoice.toString().includes("spacedReviewMode = \'typing\'")');
test('spaced_typing_single_attempt', 'checkSpacedTyping.toString().includes("ds.spacedTypingAttempts = 1") && !checkSpacedTyping.toString().includes("spacedTypingAttempts >= 2")');
test('mandatory_mail_gate_logic', 'isMailGateRequired.toString().includes("completedBlocks.length >= 4") && closeMailGate.toString().includes("reinforceMailGate")');
const failed = Object.entries(results).filter(([k,v])=>!k.endsWith('_error') && v!==true);
console.log(JSON.stringify({ pass: failed.length===0, results, failed: failed.map(([k])=>k) }, null, 2));
process.exit(failed.length ? 1 : 0);
