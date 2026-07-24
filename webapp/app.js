'use strict';

const APP_KEY = 'vocaRoot18StateV3';
const LEGACY_V2_KEY = 'vocaRoot18StateV2';
const LEGACY_KEY = 'voca18State';
const SCHEMA_VERSION = 3;
const DATA_VERSION = 'voca18-final-360x1410-20260724';

const runtime = {
  schedule: null,
  content: null,
  unitMap: new Map(),
  sessionTimer: null,
  revealTimers: [],
  state: null,
};

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const nowIso = () => new Date().toISOString();

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: DATA_VERSION,
    currentDay: 1,
    completedDays: [],
    settings: {
      start: '19:30',
      end: '20:30',
      email: 'sk01197375068@gmail.com',
      autoMail: true,
      shortenMastered: true,
      blockMinutes: 15,
    },
    mastery: {},
    days: {},
    pendingReports: [],
    sentReportIds: [],
  };
}

function dayState(dayNo) {
  const key = String(dayNo);
  if (!runtime.state.days[key]) {
    runtime.state.days[key] = {
      startedAt: null,
      firstStartedAt: null,
      completedAt: null,
      elapsedSeconds: 0,
      completedBlocks: [],
      block: 0,
      phase: 'root',
      unitIndex: 0,
      wordIndex: 0,
      reviewQueue: [],
      reviewIndex: 0,
      typingAttempts: 0,
      reviewResolved: false,
      stats: { attempted: 0, correct: 0, wrong: 0, typed: 0 },
      answers: {},
      forced: false,
    };
  }
  return runtime.state.days[key];
}

function migrateLegacy() {
  const base = defaultState();
  try {
    const v2 = JSON.parse(localStorage.getItem(LEGACY_V2_KEY) || 'null');
    if (v2 && typeof v2 === 'object') {
      Object.assign(base, v2, { schemaVersion: SCHEMA_VERSION, dataVersion: DATA_VERSION });
      base.settings = { ...defaultState().settings, ...(v2.settings || {}) };
      base.days = v2.days || {};
      base.mastery = v2.mastery || {};
      localStorage.removeItem(LEGACY_V2_KEY);
      return base;
    }

    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (!old) return base;
    base.currentDay = clamp(Number(old.day || 1), 1, 18);
    if (old.settings) {
      base.settings.start = old.settings.start || base.settings.start;
      base.settings.end = old.settings.end || base.settings.end;
      base.settings.email = old.settings.email || base.settings.email;
      base.settings.autoMail = old.settings.autoMail !== false;
    }
    const d = dayStateWith(base, base.currentDay);
    const completedCount = clamp(Number(old.completedBlocks || 0), 0, 4);
    d.completedBlocks = Array.from({ length: completedCount }, (_, i) => i);
    d.block = Math.min(completedCount, 3);
    localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    console.warn('기존 기록 변환 실패', error);
  }
  return base;
}

function dayStateWith(state, dayNo) {
  const key = String(dayNo);
  if (!state.days[key]) {
    state.days[key] = {
      startedAt: null,
      firstStartedAt: null,
      completedAt: null,
      elapsedSeconds: 0,
      completedBlocks: [],
      block: 0,
      phase: 'root',
      unitIndex: 0,
      wordIndex: 0,
      reviewQueue: [],
      reviewIndex: 0,
      typingAttempts: 0,
      reviewResolved: false,
      stats: { attempted: 0, correct: 0, wrong: 0, typed: 0 },
      answers: {},
      forced: false,
    };
  }
  return state.days[key];
}

function sanitizeDayState(raw = {}) {
  const base = dayStateWith({ days: {} }, 1);
  const out = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  out.completedBlocks = [...new Set((Array.isArray(out.completedBlocks) ? out.completedBlocks : [])
    .map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 4))].sort((a, b) => a - b);
  out.block = clamp(Number(out.block || 0), 0, 3);
  out.phase = ['root', 'word', 'review', 'blockReward'].includes(out.phase) ? out.phase : 'root';
  out.unitIndex = Math.max(0, Number(out.unitIndex || 0));
  out.wordIndex = Math.max(0, Number(out.wordIndex || 0));
  out.reviewQueue = Array.isArray(out.reviewQueue) ? [...new Set(out.reviewQueue.map(String))] : [];
  out.reviewIndex = Math.max(0, Number(out.reviewIndex || 0));
  out.typingAttempts = Math.max(0, Number(out.typingAttempts || 0));
  out.reviewResolved = Boolean(out.reviewResolved);
  out.elapsedSeconds = Math.max(0, Number(out.elapsedSeconds || 0));
  out.answers = out.answers && typeof out.answers === 'object' ? out.answers : {};
  const stats = out.stats && typeof out.stats === 'object' ? out.stats : {};
  out.stats = {
    attempted: Math.max(0, Number(stats.attempted || 0)),
    correct: Math.max(0, Number(stats.correct || 0)),
    wrong: Math.max(0, Number(stats.wrong || 0)),
    typed: Math.max(0, Number(stats.typed || 0)),
  };
  if (out.completedAt) out.completedBlocks = [0, 1, 2, 3];
  return out;
}

function sanitizeState(raw) {
  const out = defaultState();
  if (raw && typeof raw === 'object') Object.assign(out, raw);
  out.schemaVersion = SCHEMA_VERSION;
  out.dataVersion = DATA_VERSION;
  out.settings = { ...defaultState().settings, ...(raw?.settings || {}) };
  out.settings.blockMinutes = [12, 15, 18].includes(Number(out.settings.blockMinutes))
    ? Number(out.settings.blockMinutes) : 15;
  out.currentDay = clamp(Number(out.currentDay || 1), 1, 18);
  out.completedDays = [...new Set((Array.isArray(out.completedDays) ? out.completedDays : [])
    .map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 18))].sort((a, b) => a - b);
  out.pendingReports = Array.isArray(out.pendingReports) ? out.pendingReports : [];
  out.sentReportIds = Array.isArray(out.sentReportIds) ? [...new Set(out.sentReportIds.map(String))] : [];
  out.mastery = out.mastery && typeof out.mastery === 'object' ? out.mastery : {};
  out.days = out.days && typeof out.days === 'object' ? out.days : {};
  Object.keys(out.days).forEach((key) => { out.days[key] = sanitizeDayState(out.days[key]); });
  Object.entries(out.days).forEach(([key, value]) => {
    const dayNo = Number(key);
    if (value.completedAt && dayNo >= 1 && dayNo <= 18 && !out.completedDays.includes(dayNo)) {
      out.completedDays.push(dayNo);
    }
  });
  out.completedDays.sort((a, b) => a - b);
  return out;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(APP_KEY) || 'null');
    if (!saved || saved.schemaVersion !== SCHEMA_VERSION) return sanitizeState(migrateLegacy());
    const merged = defaultState();
    Object.assign(merged, saved);
    merged.settings = { ...defaultState().settings, ...(saved.settings || {}) };
    merged.currentDay = clamp(Number(merged.currentDay || 1), 1, 18);
    merged.completedDays = Array.isArray(merged.completedDays) ? merged.completedDays : [];
    merged.pendingReports = Array.isArray(merged.pendingReports) ? merged.pendingReports : [];
    merged.sentReportIds = Array.isArray(merged.sentReportIds) ? merged.sentReportIds : [];
    merged.mastery = merged.mastery || {};
    merged.days = merged.days || {};
    return sanitizeState(merged);
  } catch (error) {
    console.warn('저장 기록을 불러오지 못했습니다.', error);
    return sanitizeState(defaultState());
  }
}

function persist() {
  localStorage.setItem(APP_KEY, JSON.stringify(runtime.state));
}

async function loadData() {
  const [scheduleRes, contentRes] = await Promise.all([
    fetch('data/voca18_schedule.json'),
    fetch('data/learning_units.json'),
  ]);
  if (!scheduleRes.ok) throw new Error('18DAY 배치 데이터를 불러오지 못했습니다.');
  if (!contentRes.ok) throw new Error('어원 학습 데이터를 불러오지 못했습니다.');
  runtime.schedule = await scheduleRes.json();
  runtime.content = await contentRes.json();
  runtime.content.units.forEach((unit) => runtime.unitMap.set(unit.id, unit));
  runtime.state = sanitizeState(loadState());
  persist();
}

function currentDayDef(dayNo = runtime.state.currentDay) {
  return runtime.schedule.days[dayNo - 1];
}

function blockDef(dayNo, blockIndex) {
  return currentDayDef(dayNo).blocks[blockIndex];
}

function blockUnits(dayNo, blockIndex) {
  const block = blockDef(dayNo, blockIndex);
  const units = [];
  for (let id = block.unit_start; id <= block.unit_end; id += 1) {
    const unit = runtime.unitMap.get(id);
    if (unit) units.push(unit);
  }
  return units;
}

function dayWords(dayNo) {
  const d = currentDayDef(dayNo);
  const words = [];
  for (let id = d.unit_start; id <= d.unit_end; id += 1) {
    const unit = runtime.unitMap.get(id);
    if (unit) words.push(...unit.words);
  }
  return words;
}

function mastery(wordId) {
  if (!runtime.state.mastery[wordId]) {
    runtime.state.mastery[wordId] = { score: 0, correct: 0, wrong: 0, lastSeen: null };
  }
  return runtime.state.mastery[wordId];
}

function cleanMeaning(value) {
  if (!value) return '뜻 정보 확인 필요';
  return value
    .replace(/^\[\]\s*/, '')
    .replace(/\s+[A-Za-z][A-Za-z,;/' -]*(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function quizMeaning(word) {
  const cleaned = word.quiz_meaning || cleanMeaning(word.meaning || word.meanings?.[0] || '');
  return cleaned || word.meaning || '뜻 정보 확인 필요';
}

function totalCompletedWords(dayNo) {
  const ds = dayState(dayNo);
  const validIds = new Set(dayWords(dayNo).map((word) => String(word.id)));
  return Object.keys(ds.answers || {}).filter((id) => validIds.has(String(id))).length;
}

function elapsedSeconds(dayNo) {
  const ds = dayState(dayNo);
  let elapsed = Number(ds.elapsedSeconds || 0);
  if (ds.startedAt && !ds.completedAt) {
    elapsed += Math.max(0, Math.floor((Date.now() - new Date(ds.startedAt).getTime()) / 1000));
  }
  return elapsed;
}

function setRing(element, percent) {
  element.style.setProperty('--p', clamp(percent, 0, 100));
}

function renderHome() {
  stopSessionTimer();
  showScreen('learnerHome');
  const dayNo = runtime.state.currentDay;
  const d = currentDayDef(dayNo);
  const ds = dayState(dayNo);
  const courseCompleted = dayNo === 18 && Boolean(ds.completedAt);
  const completedBlocks = ds.completedBlocks.length;
  const completedWords = totalCompletedWords(dayNo);
  const totalWords = d.words;
  const targetMinutes = Math.max(d.estimated_minutes, runtime.state.settings.blockMinutes * 4);
  const elapsedMin = elapsedSeconds(dayNo) / 60;
  const timePercent = clamp((elapsedMin / targetMinutes) * 100, 0, 100);
  const amountPercent = clamp((completedWords / totalWords) * 100, 0, 100);

  $('todayTitle').textContent = `DAY ${pad(dayNo)}`;
  $('goalTime').textContent = `${runtime.state.settings.start} - ${runtime.state.settings.end}`;
  $('goalAmount').textContent = `ROOT ${d.roots}개 · 단어 ${d.words}개`;
  $('timeRemain').textContent = `${Math.max(0, Math.ceil(targetMinutes - elapsedMin))}분`;
  $('amountRemain').textContent = `${Math.max(0, totalWords - completedWords)}개`;
  setRing($('timeRing'), timePercent);
  setRing($('amountRing'), amountPercent);
  $('blockStatus').textContent = `${completedBlocks} / 4 완료`;
  const hasProgress = ds.completedBlocks.length > 0 || Object.keys(ds.answers || {}).length > 0 || ds.unitIndex > 0 || ds.wordIndex > 0;
  $('startButton').textContent = courseCompleted ? '18DAY 과정 완료' : (hasProgress ? '학습 계속' : '학습 시작');
  $('startButton').disabled = courseCompleted;

  $('blockList').innerHTML = '';
  d.blocks.forEach((b, index) => {
    const card = document.createElement('article');
    const done = ds.completedBlocks.includes(index);
    const active = !done && index === completedBlocks;
    card.className = `block ${done ? 'done' : active ? 'active' : 'locked'}`;
    card.innerHTML = `
      <h3>BLOCK ${index + 1}</h3>
      <p>${escapeHtml(b.root_start)} - ${escapeHtml(b.root_end)}</p>
      <p>ROOT ${b.roots} · 단어 ${b.words}</p>
      <p>약 ${runtime.state.settings.blockMinutes}분</p>
    `;
    if (done) {
      const chip = document.createElement('span');
      chip.className = 'mini-badge';
      chip.textContent = '완료';
      card.appendChild(chip);
    } else if (active) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary';
      button.textContent = hasProgress ? '계속하기' : '시작하기';
      button.addEventListener('click', startOrResumeSession);
      card.appendChild(button);
    }
    $('blockList').appendChild(card);
  });

  if (courseCompleted) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').textContent = '전체 18DAY 과정을 완료했습니다.';
  } else if ((ds.firstStartedAt || hasProgress) && !ds.completedAt) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').textContent = `BLOCK ${ds.block + 1} 진행 중입니다. 저장된 위치에서 이어집니다.`;
  } else {
    $('resumeNotice').classList.add('hidden');
  }
}

function showScreen(id) {
  ['learnerHome', 'sessionScreen', 'completionScreen', 'adminView'].forEach((screenId) => {
    $(screenId).classList.toggle('hidden', screenId !== id);
  });
}

async function startOrResumeSession() {
  const dayNo = runtime.state.currentDay;
  const ds = dayState(dayNo);
  if (ds.completedAt) {
    renderCompletion(dayNo);
    return;
  }
  if (ds.completedBlocks.length >= 4) {
    await finishDay(false);
    return;
  }
  if (!ds.firstStartedAt) ds.firstStartedAt = nowIso();
  if (!ds.startedAt) ds.startedAt = nowIso();
  ds.block = ds.completedBlocks.length;
  persist();
  showScreen('sessionScreen');
  startSessionTimer();
  renderSessionStep();
}


function pauseActiveTimer() {
  if (!runtime.state) return;
  const ds = dayState(runtime.state.currentDay);
  if (ds.startedAt && !ds.completedAt) {
    ds.elapsedSeconds += Math.max(0, Math.floor((Date.now() - new Date(ds.startedAt).getTime()) / 1000));
    ds.startedAt = null;
    persist();
  }
}

function startSessionTimer() {
  stopSessionTimer();
  runtime.sessionTimer = setInterval(() => {
    updateSessionProgressHeader();
  }, 1000);
}

function stopSessionTimer() {
  if (runtime.sessionTimer) clearInterval(runtime.sessionTimer);
  runtime.sessionTimer = null;
  clearRevealTimers();
}

function clearRevealTimers() {
  runtime.revealTimers.forEach((timer) => clearTimeout(timer));
  runtime.revealTimers = [];
}

function currentSessionContext() {
  const dayNo = runtime.state.currentDay;
  const ds = dayState(dayNo);
  const units = blockUnits(dayNo, ds.block);
  const unit = units[ds.unitIndex] || null;
  const word = unit?.words[ds.wordIndex] || null;
  return { dayNo, ds, units, unit, word };
}

function updateSessionProgressHeader() {
  const { dayNo, ds, units } = currentSessionContext();
  const allWords = units.flatMap((u) => u.words);
  const answeredIds = new Set(Object.keys(ds.answers || {}));
  const answered = allWords.filter((w) => answeredIds.has(w.id)).length;
  $('sessionBlockLabel').textContent = `DAY ${pad(dayNo)} · BLOCK ${ds.block + 1}`;
  $('sessionProgressText').textContent = `${answered} / ${allWords.length}`;
  $('sessionProgressBar').style.width = `${allWords.length ? (answered / allWords.length) * 100 : 0}%`;
}

function renderSessionStep() {
  clearRevealTimers();
  updateSessionProgressHeader();
  const { ds, units, unit, word } = currentSessionContext();
  $('feedback').className = 'feedback hidden';
  $('feedback').textContent = '';
  $('answerArea').innerHTML = '';

  if (ds.phase === 'blockReward') {
    renderBlockReward();
    return;
  }
  if (ds.phase === 'review') {
    renderTypingReview();
    return;
  }
  if (!unit) {
    beginReviewOrCompleteBlock();
    return;
  }
  if (ds.phase === 'root') {
    renderRoot(unit);
    return;
  }
  if (word && ds.answers[word.id]) {
    ds.wordIndex += 1;
    persist();
    renderSessionStep();
    return;
  }
  if (!word) {
    ds.unitIndex += 1;
    ds.wordIndex = 0;
    ds.phase = 'root';
    persist();
    renderSessionStep();
    return;
  }
  renderWordQuestion(unit, word);
}

function renderRoot(unit) {
  $('stageBadge').textContent = 'ROOT 이해';
  const masteredCount = unit.words.filter((word) => mastery(word.id).score >= 3).length;
  const shortened = runtime.state.settings.shortenMastered && masteredCount === unit.words.length && unit.words.length > 0;
  $('learningContent').innerHTML = `
    <div class="root-panel">
      <div class="root-symbol">${escapeHtml(unit.root)}</div>
      <div class="root-meaning">${escapeHtml(unit.root_meaning || '어원 의미 확인')}</div>
      <div class="root-sub">${shortened ? '숙달 ROOT - 설명 단계를 단축합니다.' : `이 ROOT에서 ${unit.words.length}개 단어를 학습합니다.`}</div>
    </div>
  `;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary large';
  button.textContent = shortened ? '빠른 확인 시작' : '단어 학습 시작';
  button.addEventListener('click', () => {
    const ds = dayState(runtime.state.currentDay);
    ds.phase = 'word';
    persist();
    renderSessionStep();
  });
  $('answerArea').appendChild(button);
}

function renderWordQuestion(unit, word) {
  const mastered = mastery(word.id).score >= 3 && runtime.state.settings.shortenMastered;
  $('stageBadge').textContent = mastered ? '숙달 빠른 확인' : '어원 연결';
  const formula = word.etymology_formula?.[0] || `${unit.root} → ${word.word}`;
  const step = word.etymology_steps?.join(' ') || unit.root_meaning || '';
  $('learningContent').innerHTML = `
    <div class="word-panel">
      <h2 class="word-title">${escapeHtml(word.word)}</h2>
      <span class="word-source">${escapeHtml(word.importance || '')} 원문 p.${word.source_page}</span>
      <div class="reveal-stack">
        <div class="reveal-step" data-reveal="1"><span class="reveal-label">구성</span>${escapeHtml(formula)}</div>
        <div class="reveal-step" data-reveal="2"><span class="reveal-label">어원 흐름</span>${escapeHtml(step || '단어의 구성과 의미를 연결하세요.')}</div>
      </div>
    </div>
  `;

  const delay1 = mastered ? 0 : 100;
  const delay2 = mastered ? 0 : 260;
  const delayOptions = mastered ? 0 : 420;
  runtime.revealTimers.push(setTimeout(() => document.querySelector('[data-reveal="1"]')?.classList.add('show'), delay1));
  runtime.revealTimers.push(setTimeout(() => document.querySelector('[data-reveal="2"]')?.classList.add('show'), delay2));
  runtime.revealTimers.push(setTimeout(() => renderOptions(unit, word), delayOptions));
}

function renderOptions(unit, word) {
  const blockWords = blockUnits(runtime.state.currentDay, dayState(runtime.state.currentDay).block)
    .flatMap((u) => u.words)
    .filter((w) => w.meaning && w.id !== word.id);
  const correct = quizMeaning(word);
  const distractors = shuffle(blockWords)
    .map(quizMeaning)
    .filter((m, index, arr) => m && m !== correct && arr.indexOf(m) === index)
    .slice(0, 3);
  while (distractors.length < 3) distractors.push('뜻을 다시 확인해야 하는 단어');
  const options = shuffle([correct, ...distractors]);
  const grid = document.createElement('div');
  grid.className = 'option-grid';
  options.forEach((text) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-button';
    button.textContent = text;
    button.addEventListener('click', () => answerChoice(word, text === correct, button, correct));
    grid.appendChild(button);
  });
  $('answerArea').innerHTML = '';
  $('answerArea').appendChild(grid);
}

function answerChoice(word, correct, selectedButton, correctText) {
  const { ds } = currentSessionContext();
  if (ds.answers[word.id]) return;
  ds.stats.attempted += 1;
  const m = mastery(word.id);
  m.lastSeen = nowIso();
  document.querySelectorAll('.option-button').forEach((button) => { button.disabled = true; });

  if (correct) {
    ds.stats.correct += 1;
    ds.answers[word.id] = 'correct';
    m.correct += 1;
    m.score = clamp(m.score + 1, 0, 5);
    selectedButton.classList.add('correct');
    showFeedback('success', '정답입니다. 다음 단어로 이동합니다.');
    persist();
    runtime.revealTimers.push(setTimeout(advanceWord, 430));
  } else {
    ds.stats.wrong += 1;
    ds.answers[word.id] = 'wrong';
    m.wrong += 1;
    m.score = clamp(m.score - 1, 0, 5);
    selectedButton.classList.add('wrong');
    document.querySelectorAll('.option-button').forEach((button) => {
      if (button.textContent === correctText) button.classList.add('correct');
    });
    if (!ds.reviewQueue.includes(word.id)) ds.reviewQueue.push(word.id);
    showFeedback('error', `정답: ${correctText}`);
    const row = document.createElement('div');
    row.className = 'continue-row';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary';
    next.textContent = '다음';
    next.addEventListener('click', advanceWord);
    row.appendChild(next);
    $('answerArea').appendChild(row);
    persist();
  }
}

function showFeedback(type, text) {
  $('feedback').className = `feedback ${type}`;
  $('feedback').textContent = text;
}

function advanceWord() {
  const ds = dayState(runtime.state.currentDay);
  ds.wordIndex += 1;
  persist();
  renderSessionStep();
}

function beginReviewOrCompleteBlock() {
  const ds = dayState(runtime.state.currentDay);
  if (ds.reviewQueue.length > 0) {
    ds.phase = 'review';
    ds.reviewIndex = 0;
    ds.typingAttempts = 0;
    ds.reviewResolved = false;
  } else {
    completeCurrentBlock();
  }
  persist();
  renderSessionStep();
}

function findWordById(wordId) {
  for (const unit of runtime.content.units) {
    const found = unit.words.find((word) => word.id === wordId);
    if (found) return found;
  }
  return null;
}

function renderTypingReview() {
  const ds = dayState(runtime.state.currentDay);
  const wordId = ds.reviewQueue[ds.reviewIndex];
  if (!wordId) {
    completeCurrentBlock();
    persist();
    renderSessionStep();
    return;
  }
  const word = findWordById(wordId);
  if (!word) {
    ds.reviewIndex += 1;
    persist();
    renderSessionStep();
    return;
  }
  $('stageBadge').textContent = '오답 철자 각인';
  $('learningContent').innerHTML = `
    <div class="typing-wrap">
      <p class="typing-prompt">${escapeHtml(quizMeaning(word))}</p>
      <p class="word-source">영어 철자를 직접 입력하세요. 오답 항목에만 타이핑을 적용합니다.</p>
      <input id="spellingInput" type="text" inputmode="latin" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="영어 철자 입력">
      <div class="typing-actions">
        <button id="checkSpelling" class="primary" type="button">정답 확인</button>
        <button id="showSpelling" class="ghost" type="button">정답 보기</button>
      </div>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const input = $('spellingInput');
  input.focus();
  $('checkSpelling').addEventListener('click', () => checkSpelling(word, input.value));
  $('showSpelling').addEventListener('click', () => revealSpelling(word));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') checkSpelling(word, input.value);
  });
  if (ds.reviewResolved) {
    input.disabled = true;
    $('checkSpelling').disabled = true;
    $('showSpelling').disabled = true;
    showFeedback('success', '이미 확인한 철자 항목입니다. 다음으로 이동하세요.');
    renderReviewContinue();
  }
}

function normalizeAnswer(value) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function checkSpelling(word, value) {
  const ds = dayState(runtime.state.currentDay);
  if (ds.reviewResolved) return;
  ds.stats.typed += 1;
  ds.typingAttempts += 1;
  const answer = normalizeAnswer(word.word);
  const typed = normalizeAnswer(value);
  if (typed === answer) {
    const m = mastery(word.id);
    m.score = clamp(m.score + 1, 0, 5);
    ds.reviewResolved = true;
    $('spellingInput').disabled = true;
    $('checkSpelling').disabled = true;
    $('showSpelling').disabled = true;
    showFeedback('success', '철자 회상 성공. 오답 각인이 완료되었습니다.');
    persist();
    runtime.revealTimers.push(setTimeout(nextReviewWord, 500));
    return;
  }
  if (ds.typingAttempts >= 2) {
    ds.reviewResolved = true;
    $('spellingInput').disabled = true;
    $('checkSpelling').disabled = true;
    $('showSpelling').disabled = true;
    showFeedback('error', `정답은 ${word.word}입니다. 철자를 보고 한 번 더 확인하세요.`);
    renderReviewContinue();
  } else {
    showFeedback('error', '철자가 다릅니다. 한 번 더 입력하세요.');
    $('spellingInput').select();
  }
  persist();
}

function revealSpelling(word) {
  const ds = dayState(runtime.state.currentDay);
  if (ds.reviewResolved) return;
  ds.reviewResolved = true;
  $('spellingInput').disabled = true;
  $('checkSpelling').disabled = true;
  $('showSpelling').disabled = true;
  persist();
  showFeedback('error', `정답: ${word.word}`);
  renderReviewContinue();
}

function renderReviewContinue() {
  if ($('reviewContinue')) return;
  const row = document.createElement('div');
  row.className = 'continue-row';
  const button = document.createElement('button');
  button.id = 'reviewContinue';
  button.type = 'button';
  button.className = 'primary';
  button.textContent = '확인 완료';
  button.addEventListener('click', nextReviewWord);
  row.appendChild(button);
  $('answerArea').appendChild(row);
}

function nextReviewWord() {
  const ds = dayState(runtime.state.currentDay);
  ds.reviewIndex += 1;
  ds.typingAttempts = 0;
  ds.reviewResolved = false;
  persist();
  renderSessionStep();
}

function completeCurrentBlock() {
  const ds = dayState(runtime.state.currentDay);
  if (!ds.completedBlocks.includes(ds.block)) ds.completedBlocks.push(ds.block);
  ds.phase = 'blockReward';
  ds.unitIndex = 0;
  ds.wordIndex = 0;
  ds.reviewQueue = [];
  ds.reviewIndex = 0;
  ds.reviewResolved = false;
  persist();
}

function renderBlockReward() {
  const ds = dayState(runtime.state.currentDay);
  const completed = ds.completedBlocks.length;
  $('stageBadge').textContent = '즉시 완료 보상';
  $('learningContent').innerHTML = `
    <div class="block-reward">
      <div class="reward-mark">✓</div>
      <h2>집중블록 ${completed} 완료</h2>
      <p>정답 ${ds.stats.correct}개 · 오답 ${ds.stats.wrong}개 · 철자 회상 ${ds.stats.typed}회</p>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary large';
  button.textContent = completed >= 4 ? 'DAY 완료 결과 보기' : '다음 블록 시작';
  button.addEventListener('click', async () => {
    if (completed >= 4) {
      await finishDay(false);
    } else {
      ds.block = completed;
      ds.phase = 'root';
      ds.unitIndex = 0;
      ds.wordIndex = 0;
      persist();
      renderSessionStep();
    }
  });
  $('answerArea').appendChild(button);
}

async function finishDay(forced) {
  const dayNo = runtime.state.currentDay;
  const ds = dayState(dayNo);
  if (!forced && ds.completedBlocks.length < 4 && !ds.completedAt) {
    throw new Error('4개 집중블록을 모두 완료해야 DAY를 완료할 수 있습니다.');
  }
  if (!ds.completedAt) {
    if (ds.startedAt) ds.elapsedSeconds += Math.max(0, Math.floor((Date.now() - new Date(ds.startedAt).getTime()) / 1000));
    ds.startedAt = null;
    ds.completedAt = nowIso();
    ds.forced = Boolean(forced);
    ds.completedBlocks = [0, 1, 2, 3];
    if (!runtime.state.completedDays.includes(dayNo)) runtime.state.completedDays.push(dayNo);
  }
  const report = buildReport(dayNo);
  await queueOrSendReport(report);
  persist();
  renderCompletion(dayNo);
}

function buildReport(dayNo) {
  const d = currentDayDef(dayNo);
  const ds = dayState(dayNo);
  const reportId = `voca-day-${dayNo}-${(ds.completedAt || nowIso()).slice(0, 19).replace(/\D/g, '')}`;
  const wrongWords = Object.entries(ds.answers || {})
    .filter(([, result]) => result === 'wrong')
    .map(([wordId]) => findWordById(wordId)?.word)
    .filter(Boolean);
  return {
    reportId,
    email: runtime.state.settings.email,
    day: dayNo,
    startedAt: ds.firstStartedAt,
    completedAt: ds.completedAt,
    forced: ds.forced,
    summary: {
      roots: d.roots,
      words: d.words,
      source_day_range: d.source_day_range,
      elapsed_minutes: Math.max(1, Math.round(ds.elapsedSeconds / 60)),
      attempted: ds.stats.attempted,
      correct: ds.stats.correct,
      wrong: ds.stats.wrong,
      typed: ds.stats.typed,
      accuracy: ds.stats.attempted ? Math.round((ds.stats.correct / ds.stats.attempted) * 100) : null,
      wrong_words: wrongWords,
    },
  };
}

async function queueOrSendReport(report) {
  if (!runtime.state.settings.autoMail || !report.email) return { ok: false, skipped: true };
  if (runtime.state.sentReportIds.includes(report.reportId)) return { ok: true, duplicate: true };
  try {
    const response = await fetch('/.netlify/functions/send-day-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!response.ok) throw new Error(`메일 함수 응답 ${response.status}`);
    runtime.state.sentReportIds.push(report.reportId);
    runtime.state.pendingReports = runtime.state.pendingReports.filter((item) => item.reportId !== report.reportId);
    persist();
    return { ok: true };
  } catch (error) {
    if (!runtime.state.pendingReports.some((item) => item.reportId === report.reportId)) {
      runtime.state.pendingReports.push(report);
    }
    persist();
    return { ok: false, error: error.message };
  }
}

async function retryPendingReports() {
  const pending = [...runtime.state.pendingReports];
  let success = 0;
  for (const report of pending) {
    const result = await queueOrSendReport(report);
    if (result.ok) success += 1;
  }
  return { total: pending.length, success };
}

function renderCompletion(dayNo) {
  stopSessionTimer();
  showScreen('completionScreen');
  const report = buildReport(dayNo);
  $('completionTitle').textContent = `DAY ${pad(dayNo)} 완료`;
  const metrics = [
    ['학습 ROOT', `${report.summary.roots}개`],
    ['학습 단어', `${report.summary.words}개`],
    ['정답률', report.summary.accuracy === null ? '미측정' : `${report.summary.accuracy}%`],
    ['학습시간', `${report.summary.elapsed_minutes}분`],
  ];
  $('completionMetrics').innerHTML = metrics.map(([label, value]) => `
    <div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join('');
  if (!runtime.state.settings.autoMail) {
    $('mailStatus').textContent = '자동 메일 발송이 꺼져 있습니다.';
  } else if (runtime.state.sentReportIds.includes(report.reportId)) {
    $('mailStatus').textContent = `완료 보고서를 ${runtime.state.settings.email}로 발송했습니다.`;
  } else {
    $('mailStatus').textContent = '메일 발송이 대기 중입니다. 관리자 화면에서 재시도할 수 있습니다.';
  }
  $('completionConfirm').textContent = dayNo < 18 ? `DAY ${pad(dayNo + 1)}로 이동` : '전체 과정 확인';
  $('completionConfirm').onclick = () => {
    if (dayNo < 18) runtime.state.currentDay = Math.max(runtime.state.currentDay, dayNo + 1);
    persist();
    renderHome();
  };
}

function renderAdmin() {
  pauseActiveTimer();
  stopSessionTimer();
  showScreen('adminView');
  const s = runtime.state.settings;
  $('daySelect').innerHTML = runtime.schedule.days.map((d) => `
    <option value="${d.new_day}" ${d.new_day === runtime.state.currentDay ? 'selected' : ''}>DAY ${pad(d.new_day)} · ROOT ${d.roots} · 단어 ${d.words}</option>
  `).join('');
  $('startTime').value = s.start;
  $('endTime').value = s.end;
  $('reportEmail').value = s.email;
  $('autoMail').checked = s.autoMail;
  $('shortenMastered').checked = s.shortenMastered;
  $('blockMinutes').value = String(s.blockMinutes);
  $('adminProgressList').innerHTML = runtime.schedule.days.map((d) => {
    const done = runtime.state.completedDays.includes(d.new_day);
    const current = runtime.state.currentDay === d.new_day;
    return `<div class="admin-day ${done ? 'done' : ''} ${current ? 'current' : ''}"><strong>DAY ${pad(d.new_day)}</strong><span>${done ? '완료' : current ? '진행 중' : '대기'} · ${d.words}단어</span></div>`;
  }).join('');
}

function saveAdminSettings() {
  const selectedDay = clamp(Number($('daySelect').value), 1, 18);
  runtime.state.currentDay = selectedDay;
  runtime.state.settings = {
    start: $('startTime').value || '19:30',
    end: $('endTime').value || '20:30',
    email: $('reportEmail').value.trim(),
    autoMail: $('autoMail').checked,
    shortenMastered: $('shortenMastered').checked,
    blockMinutes: Number($('blockMinutes').value || 15),
  };
  persist();
  renderHome();
}

async function forceCompleteCurrentDay() {
  const dayNo = runtime.state.currentDay;
  const confirmed = window.confirm(`DAY ${pad(dayNo)}를 관리자 강제 완료 처리하시겠습니까?`);
  if (!confirmed) return;
  await finishDay(true);
}

function exportProgress() {
  pauseActiveTimer();
  const payload = {
    app: 'VOCA_ROOT_18DAY',
    schemaVersion: SCHEMA_VERSION,
    dataVersion: DATA_VERSION,
    exportedAt: nowIso(),
    state: runtime.state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `voca18_progress_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importProgressFile(file) {
  if (!file) return;
  const payload = JSON.parse(await file.text());
  if (payload?.app !== 'VOCA_ROOT_18DAY' || !payload?.state) {
    throw new Error('올바른 VOCA ROOT 18DAY 진도 백업 파일이 아닙니다.');
  }
  runtime.state = sanitizeState(payload.state);
  persist();
  renderAdmin();
}

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function bindEvents() {
  $('startButton').addEventListener('click', startOrResumeSession);
  $('exitSession').addEventListener('click', () => { pauseActiveTimer(); renderHome(); });
  $('adminToggle').addEventListener('click', renderAdmin);
  $('closeAdmin').addEventListener('click', renderHome);
  $('saveAdmin').addEventListener('click', saveAdminSettings);
  $('forceComplete').addEventListener('click', forceCompleteCurrentDay);
  $('exportProgress').addEventListener('click', exportProgress);
  $('importProgress').addEventListener('click', () => $('importProgressFile').click());
  $('importProgressFile').addEventListener('change', async (event) => {
    try {
      await importProgressFile(event.target.files?.[0]);
      window.alert('진도 기록을 복원했습니다.');
    } catch (error) {
      window.alert(error.message);
    } finally {
      event.target.value = '';
    }
  });
  window.addEventListener('pagehide', pauseActiveTimer);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseActiveTimer();
    else if (!$('sessionScreen').classList.contains('hidden')) {
      const ds = dayState(runtime.state.currentDay);
      if (!ds.startedAt && !ds.completedAt) ds.startedAt = nowIso();
      persist();
    }
  });
  $('retryMail').addEventListener('click', async () => {
    const result = await retryPendingReports();
    window.alert(result.total ? `${result.total}건 중 ${result.success}건을 발송했습니다.` : '대기 중인 메일이 없습니다.');
    renderAdmin();
  });
}

async function boot() {
  try {
    await loadData();
    bindEvents();
    renderHome();
    retryPendingReports().catch(() => {});
  } catch (error) {
    document.body.innerHTML = `<p style="padding:24px;font-family:system-ui">${escapeHtml(error.message)}</p>`;
  }
}

boot();
