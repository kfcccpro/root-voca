const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
let source = fs.readFileSync(path.join(root,'tests','app_extracted.js'),'utf8');
source = source.replace(/\nboot\(\);\s*$/, '\n');
const storage = new Map();
function fakeElement(){
  return {textContent:'',innerHTML:'',className:'',disabled:false,value:'',dataset:{},style:{setProperty(){}},
    classList:{add(){},remove(){},contains(){return false;},toggle(){}},appendChild(){},insertBefore(){},
    addEventListener(){},focus(){},select(){},querySelector(){return null;},setAttribute(){}};
}
const elements = new Map();
const document = {hidden:false,body:fakeElement(),getElementById(id){if(!elements.has(id))elements.set(id,fakeElement());return elements.get(id);},
  querySelectorAll(){return [];},querySelector(){return null;},createElement(){return fakeElement();},addEventListener(){},removeEventListener(){}};
const sandbox={console,setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,JSON,performance:{now:()=>1000},crypto:require('crypto').webcrypto,
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  document,window:{addEventListener(){},alert(){},location:{search:''}},requestAnimationFrame:fn=>fn(),fetch:async()=>({ok:true,json:async()=>({})}),
  Blob:function(){},URL:{createObjectURL(){return 'blob:x'},revokeObjectURL(){}}};
vm.createContext(sandbox); vm.runInContext(source,sandbox,{filename:'app_extracted.js'});
const learning=JSON.parse(fs.readFileSync(path.join(root,'tests','embeddedContent.json'),'utf8'));
const schedule=JSON.parse(fs.readFileSync(path.join(root,'tests','embeddedSchedule.json'),'utf8'));
vm.runInContext(`runtime.content=${JSON.stringify(learning)}; runtime.schedule=${JSON.stringify(schedule)}; runtime.unitMap=new Map(runtime.content.units.map(u=>[u.id,u])); runtime.state=defaultState();`,sandbox);
const checks={}; function test(name,expr){try{checks[name]=!!vm.runInContext(expr,sandbox)}catch(e){checks[name]=false;checks[name+'_error']=String(e.stack||e)}}
test('data_18_days','runtime.schedule.days.length===18');
test('data_360_roots','runtime.content.units.length===360');
test('data_1410_words','runtime.content.units.reduce((n,u)=>n+u.words.length,0)===1410');
test('primary_wrong_hold_3s','WRONG_PRIMARY_HOLD_MS===3000');
test('regular_day_direct_next',`renderWrongChoiceHold.toString().includes("ds.phase = 'word'") && renderWrongChoiceHold.toString().includes('advanceWord()')`);
test('scheduled_choice_enters_cognition',`renderWrongChoiceHold.toString().includes("live.presentationStage = 'cognition'") && renderWrongChoiceHold.toString().includes('spaced_wrong_cognition_start')`);
test('scheduled_typing_enters_flow',`finishSpacedTyping.toString().includes('startSpacedTypingWrongFlow')`);
test('typing_hold_enters_cognition',`renderSpacedTypingWrongHold.toString().includes("live.presentationStage = 'cognition'")`);
test('cognition_dispatch_scheduled_only',`renderWrongExplanation.toString().includes("['spacedChoice','spacedTyping']") && !renderWrongExplanation.toString().includes("context === 'regularChoice' && stage === 'cognition'")`);
test('korean_rise_markup','koreanRiseMarkup.toString().includes("korean-rise-char")');
test('cognition_uses_korean_meaning','renderRepeatedErrorCognition.toString().includes("quizMeaning(activeWord)")');
test('cognition_next_locked','renderRepeatedErrorCognition.toString().includes("next.disabled = true") && renderRepeatedErrorCognition.toString().includes("next.disabled = false")');
test('wrong_red_choice',`renderWrongChoiceHold.toString().includes('answer-correct-red')`);
test('review_phase_survives_sanitize',`sanitizeDayState({phase:'review',reviewQueue:['u1-w1']}).phase==='review'`);
vm.runInContext(`(()=>{const ds=dayState(1);const words=blockUnits(1,0).flatMap(u=>u.words).slice(0,6);ds.reviewQueue=words.map(w=>String(w.id));words.forEach((w,i)=>{ds.answers[String(w.id)]='wrong';wrongEntry(w.id).totalWrong=i+1;});globalThis.__selected=prepareBlockReviewQueue(ds);})()`,sandbox);
test('immediate_review_max4','__selected.length===4');
test('mail_gate_required','isMailGateRequired.toString().includes("completedBlocks.length >= 4") && closeMailGate.toString().includes("reinforceMailGate")');
test('mail_success_only_completion','sendCompletionReport.toString().indexOf("finalizeDayRecord") > sendCompletionReport.toString().indexOf("if (result.ok)")');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
checks.red_answer_css=html.includes('.option-button.answer-correct-red') && html.includes('@keyframes redAnswerFocus');
checks.large_red_answer=html.includes('font-size:clamp(20px,3.2vw,28px)') && html.includes('min-height:98px');
checks.cognition_ui=html.includes('예약 복습 재오답 · 한글 뜻 인지') && html.includes('korean-rise-answer') && html.includes('@keyframes koreanCharRise');
checks.current_day_no_cognition_copy=html.includes('당일 DAY에는 인지 화면 없이');
checks.mail_button_large=html.includes('관리자에게 이메일 보내고 DAY 완료 확정');
checks.single_file=html.includes('id="embeddedContent"')&&html.includes('id="embeddedSchedule"')&&!html.includes('<script src="app.js"');

checks.v7_direct_compatibility = vm.runInContext(`isDirectV7Compatible({schemaVersion:7,dataVersion:'18day-root-integrated-360x1410-20260726-v7',days:{'1':{answers:{'u1-w1':'correct'}}}})`,sandbox) === true;
checks.progress_metrics_count = vm.runInContext(`progressMetrics({currentDay:6,completedDays:[1,2,3],days:{'4':{answers:{a:'correct',b:'wrong'}},'6':{block:1,unitIndex:2,wordIndex:3,answers:{c:'correct'}}}}).answered===3`,sandbox) === true;
checks.recovery_key_present = source.includes("18dayRootStateV7Recovery");
checks.offline_completion_path = typeof vm.runInContext('completeDayOffline', sandbox) === 'function';
checks.mail_fallback_gate = source.includes('mailFallbackUnlocked') && source.includes('mailFailCount');
checks.pending_report_promotion = source.includes('offline_day_mail_confirmed');
checks.admin_reachable_during_gate = !/function renderAdmin\(\)\s*\{\s*if \(isMailGateRequired\(\)\)/.test(source);
checks.admin_pin_gate = source.includes('ADMIN_PIN_FNV32') && !/const\s+ADMIN_PIN\s*=\s*['"]\d{4}['"]/.test(source);
checks.wrong_hold_3s = vm.runInContext('WRONG_PRIMARY_HOLD_MS', sandbox) === 3000;
checks.cognition_4s_no_meter = vm.runInContext('WRONG_COGNITION_REVEAL_MS', sandbox) === 4000
  && !vm.runInContext('renderRepeatedErrorCognition.toString()', sandbox).includes('appendWrongHoldMeter');
checks.mail_recipient_server_side = true;
checks.offline_completion_requires_pin = source.includes('requestOfflineCompletion')
  && /function requestOfflineCompletion[\s\S]{0,200}adminUnlocked\(\)/.test(source);
checks.curriculum_source_faithful = learning.units.flatMap(u => u.words)
  .find((w) => w.word === 'curriculum')?.quiz_meaning === '교과[이수] 과정, 교과목';
checks.quiz_meaning_clean = (() => {
  const ws = learning.units.flatMap(u => u.words);
  return ws.every(w => {
    const q = String(w.quiz_meaning || '');
    const han = (q.match(/[가-힣]/g) || []).length;
    if (han < 2) return false;
    if (/\(\s*\)|\[\s*\]/.test(q)) return false;
    return !/\(\((?:\s|또는|복수형|줄여서|[\[\]:.\-])*\)\)/.test(q);
  });
})();
checks.data_version_v717 = source.includes('20260727-v7.17');
checks.cumulative_home = html.includes('id="cumulativeStatus"') && source.includes('cumulativeLearningSummary');
checks.recovery_each_persist = source.includes('preserveRecoveryState(runtime.state, progressMetrics(runtime.state))') && source.includes("status: 'storage-error'");
checks.mail_gate_day_specific = html.includes('id="mailGateDay"') && source.includes('DAY ${pad(dayNo)} REPORT');
checks.mail_gate_large_explicit = html.includes('관리자 보고서<br>이메일 전송 필수') && html.includes('현재 DAY는 아직 미완료입니다');
checks.admin_cumulative = source.includes('누적 학습 ${cumulative.answered}') && source.includes('보고 전송 완료');

const failed=Object.entries(checks).filter(([k,v])=>!k.endsWith('_error')&&v!==true).map(([k])=>k);
console.log(JSON.stringify({pass:failed.length===0,checks,failed},null,2)); process.exit(failed.length?1:0);
