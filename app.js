'use strict';

const APP_KEY = '18dayRootStateV5';
const LEGACY_24_KEY = 'vocaRoot24StateV4';
const LEGACY_V3_KEY = 'vocaRoot18StateV3';
const LEGACY_V2_KEY = 'vocaRoot18StateV2';
const LEGACY_KEY = 'voca18State';
const SCHEMA_VERSION = 5;
const DATA_VERSION = '18day-root-360x1410-20260726-v5';
const APP_NAME = '18day_root';

const runtime = {
  schedule: null,
  content: null,
  unitMap: new Map(),
  sessionTimer: null,
  revealTimers: [],
  optionKeyHandler: null,
  state: null,
};

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const nowIso = () => new Date().toISOString();
const totalDays = () => runtime.schedule?.days?.length || 18;

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
    spellingNotebook: {},
    pendingReports: [],
    sentReportIds: [],
    migrationNotice: '',
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
      completionRequestedAt: null,
      mailConfirmedAt: null,
      mailGateStatus: 'idle',
      mailGateError: '',
    };
  }
  return runtime.state.days[key];
}

function readStoredJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn(`${key} 기록을 읽지 못했습니다.`, error);
    return null;
  }
}

function blankDayState() {
  return {
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
    completionRequestedAt: null,
    mailConfirmedAt: null,
    mailGateStatus: 'idle',
    mailGateError: '',
  };
}

function dayStateWith(state, dayNo) {
  const key = String(dayNo);
  if (!state.days[key]) state.days[key] = blankDayState();
  return state.days[key];
}

function sanitizeDayState(raw = {}) {
  const out = { ...blankDayState(), ...(raw && typeof raw === 'object' ? raw : {}) };
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
  out.completionRequestedAt = out.completionRequestedAt || null;
  out.mailConfirmedAt = out.mailConfirmedAt || null;
  out.mailGateStatus = ['idle','ready','sending','error','sent'].includes(out.mailGateStatus) ? out.mailGateStatus : 'idle';
  out.mailGateError = typeof out.mailGateError === 'string' ? out.mailGateError : '';
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
  out.currentDay = clamp(Number(out.currentDay || 1), 1, totalDays());
  out.completedDays = [...new Set((Array.isArray(out.completedDays) ? out.completedDays : [])
    .map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= totalDays()))].sort((a, b) => a - b);
  out.pendingReports = Array.isArray(out.pendingReports) ? out.pendingReports : [];
  out.sentReportIds = Array.isArray(out.sentReportIds) ? [...new Set(out.sentReportIds.map(String))] : [];
  out.mastery = out.mastery && typeof out.mastery === 'object' ? out.mastery : {};
  out.days = out.days && typeof out.days === 'object' ? out.days : {};
  out.spellingNotebook = out.spellingNotebook && typeof out.spellingNotebook === 'object' ? out.spellingNotebook : {};
  out.migrationNotice = typeof out.migrationNotice === 'string' ? out.migrationNotice : '';
  Object.keys(out.days).forEach((key) => { out.days[key] = sanitizeDayState(out.days[key]); });
  Object.entries(out.days).forEach(([key, value]) => {
    const dayNo = Number(key);
    if (value.completedAt && dayNo >= 1 && dayNo <= totalDays() && !out.completedDays.includes(dayNo)) {
      out.completedDays.push(dayNo);
    }
  });
  out.completedDays.sort((a, b) => a - b);
  return out;
}

function wordsForBlockDefinition(dayDef, blockDefn) {
  const words = [];
  for (let id = blockDefn.unit_start; id <= blockDefn.unit_end; id += 1) {
    const unit = runtime.unitMap.get(id);
    if (unit) words.push(...unit.words);
  }
  return words;
}

function wordsForDayDefinition(dayDef) {
  const words = [];
  for (let id = dayDef.unit_start; id <= dayDef.unit_end; id += 1) {
    const unit = runtime.unitMap.get(id);
    if (unit) words.push(...unit.words);
  }
  return words;
}

function migrateScheduleState(raw) {
  const base = defaultState();
  base.settings = { ...base.settings, ...(raw?.settings || {}) };
  base.mastery = raw?.mastery && typeof raw.mastery === 'object' ? raw.mastery : {};
  base.pendingReports = Array.isArray(raw?.pendingReports) ? raw.pendingReports : [];
  base.sentReportIds = Array.isArray(raw?.sentReportIds) ? raw.sentReportIds : [];
  base.spellingNotebook = raw?.spellingNotebook && typeof raw.spellingNotebook === 'object' ? raw.spellingNotebook : {};

  const answerMap = {};
  const legacyDays = raw?.days && typeof raw.days === 'object' ? raw.days : {};
  Object.values(legacyDays).forEach((legacyDay) => {
    const answers = legacyDay?.answers && typeof legacyDay.answers === 'object' ? legacyDay.answers : {};
    Object.entries(answers).forEach(([wordId, result]) => {
      answerMap[String(wordId)] = result === 'wrong' ? 'wrong' : 'correct';
      if (result === 'wrong') {
        const existing = base.spellingNotebook[wordId] || {};
        base.spellingNotebook[wordId] = {
          ...existing,
          pending: Math.max(2, Number(existing.pending || 0)),
          successes: Number(existing.successes || 0),
          lastWrongAt: existing.lastWrongAt || nowIso(),
        };
      }
    });
    (Array.isArray(legacyDay?.reviewQueue) ? legacyDay.reviewQueue : []).forEach((wordId) => {
      const existing = base.spellingNotebook[wordId] || {};
      base.spellingNotebook[wordId] = {
        ...existing,
        pending: Math.max(2, Number(existing.pending || 0)),
        successes: Number(existing.successes || 0),
        lastWrongAt: existing.lastWrongAt || nowIso(),
      };
    });
  });

  runtime.schedule.days.forEach((dayDef) => {
    const ds = dayStateWith(base, dayDef.new_day);
    const words = wordsForDayDefinition(dayDef);
    words.forEach((word) => {
      if (answerMap[word.id]) ds.answers[word.id] = answerMap[word.id];
    });
    ds.stats.attempted = Object.keys(ds.answers).length;
    ds.stats.correct = Object.values(ds.answers).filter((result) => result === 'correct').length;
    ds.stats.wrong = Object.values(ds.answers).filter((result) => result === 'wrong').length;
    ds.reviewQueue = Object.entries(ds.answers).filter(([, result]) => result === 'wrong').map(([wordId]) => wordId);

    dayDef.blocks.forEach((blockDefn, index) => {
      const blockWords = wordsForBlockDefinition(dayDef, blockDefn);
      if (blockWords.length && blockWords.every((word) => ds.answers[word.id])) ds.completedBlocks.push(index);
    });
    const allAnswered = words.length > 0 && words.every((word) => ds.answers[word.id]);
    if (allAnswered) {
      ds.completedAt = nowIso();
      ds.completedBlocks = [0, 1, 2, 3];
      base.completedDays.push(dayDef.new_day);
    } else {
      ds.block = [0, 1, 2, 3].find((index) => !ds.completedBlocks.includes(index)) ?? 3;
      ds.phase = 'root';
    }
  });

  base.currentDay = runtime.schedule.days.find((dayDef) => !base.completedDays.includes(dayDef.new_day))?.new_day || totalDays();
  base.migrationNotice = Object.keys(answerMap).length
    ? `기존 학습기록 ${Object.keys(answerMap).length}개 단어를 18DAY 일정에 맞게 재배치했습니다.`
    : '18DAY 일정으로 변경되어 DAY 진도는 새 일정 기준으로 시작합니다. 기존 숙달 기록은 보존했습니다.';
  return base;
}

function migrateLegacyCompact(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  base.settings = { ...base.settings, ...(raw.settings || {}) };
  base.currentDay = 1;
  base.migrationNotice = '이전 간편 진도 형식은 DAY 구조가 달라 숙달 설정만 보존하고 18DAY 일정으로 시작합니다.';
  return base;
}

function loadState() {
  try {
    const current = readStoredJson(APP_KEY);
    if (current && current.schemaVersion === SCHEMA_VERSION && current.dataVersion === DATA_VERSION) {
      return sanitizeState(current);
    }
    if (current) return sanitizeState(migrateScheduleState(current));

    const legacy24 = readStoredJson(LEGACY_24_KEY);
    if (legacy24) return sanitizeState(migrateScheduleState(legacy24));

    const legacyV3 = readStoredJson(LEGACY_V3_KEY);
    if (legacyV3) return sanitizeState(migrateScheduleState(legacyV3));

    const legacyV2 = readStoredJson(LEGACY_V2_KEY);
    if (legacyV2) return sanitizeState(migrateScheduleState(legacyV2));

    const compact = readStoredJson(LEGACY_KEY);
    if (compact) return sanitizeState(migrateLegacyCompact(compact));

    return sanitizeState(defaultState());
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
    fetch('data/voca_schedule.json'),
    fetch('data/learning_units.json'),
  ]);
  if (!scheduleRes.ok) throw new Error('배치 데이터를 불러오지 못했습니다.');
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

function spellingEntry(wordId) {
  if (!runtime.state.spellingNotebook[wordId]) {
    runtime.state.spellingNotebook[wordId] = { pending: 0, successes: 0, lastWrongAt: null, lastResolvedAt: null };
  }
  return runtime.state.spellingNotebook[wordId];
}

function addSpellingPending(wordId, repeats = 2) {
  const entry = spellingEntry(wordId);
  entry.pending = Math.max(Number(entry.pending || 0), Number(repeats || 2));
  entry.successes = 0;
  entry.lastWrongAt = nowIso();
}

function resolveSpellingPending(wordId) {
  const entry = spellingEntry(wordId);
  entry.pending = Math.max(0, Number(entry.pending || 0) - 1);
  entry.successes = Number(entry.successes || 0) + 1;
  entry.lastResolvedAt = nowIso();
}

function pendingSpellingIds() {
  return Object.entries(runtime.state.spellingNotebook || {})
    .filter(([, entry]) => Number(entry?.pending || 0) > 0)
    .sort((a, b) => Number(b[1].pending || 0) - Number(a[1].pending || 0) || String(a[1].lastWrongAt || '').localeCompare(String(b[1].lastWrongAt || '')) || String(a[0]).localeCompare(String(b[0])))
    .map(([wordId]) => String(wordId));
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
  const courseCompleted = dayNo === totalDays() && Boolean(ds.completedAt);
  const completedBlocks = ds.completedBlocks.length;
  const completedWords = totalCompletedWords(dayNo);
  const totalWords = d.words;
  const targetMinutes = Math.max(d.estimated_minutes, runtime.state.settings.blockMinutes * 4);
  const elapsedMin = elapsedSeconds(dayNo) / 60;
  const timePercent = clamp((elapsedMin / targetMinutes) * 100, 0, 100);
  const amountPercent = clamp((completedWords / totalWords) * 100, 0, 100);

  $('todayTitle').textContent = `DAY ${pad(dayNo)}`;
  const courseText = `${APP_NAME} · ${totalDays()}DAY 영어 어원 집중 학습`;
  const eyebrow = $('courseEyebrow'); if (eyebrow) eyebrow.textContent = courseText;
  const statusChip = $('statusChip'); if (statusChip) statusChip.textContent = `총 ${totalDays()}DAY · 오늘 학습`;
  const adminCourseTitle = $('adminCourseTitle'); if (adminCourseTitle) adminCourseTitle.textContent = `${totalDays()}DAY 진행 현황`;
  $('goalTime').textContent = `${runtime.state.settings.start} - ${runtime.state.settings.end}`;
  $('goalAmount').textContent = `ROOT ${d.roots}개 · 단어 ${d.words}개`;
  $('timeRemain').textContent = `${Math.max(0, Math.ceil(targetMinutes - elapsedMin))}분`;
  $('amountRemain').textContent = `${Math.max(0, totalWords - completedWords)}개`;
  setRing($('timeRing'), timePercent);
  setRing($('amountRing'), amountPercent);
  $('blockStatus').textContent = `${completedBlocks} / 4 완료`;
  const hasProgress = ds.completedBlocks.length > 0 || Object.keys(ds.answers || {}).length > 0 || ds.unitIndex > 0 || ds.wordIndex > 0;
  const awaitingMail = ds.completedBlocks.length >= 4 && !ds.completedAt;
  $('startButton').textContent = courseCompleted ? `${totalDays()}DAY 과정 완료` : (awaitingMail ? '관리자 보고 후 DAY 완료' : (hasProgress ? '학습 계속' : '학습 시작'));
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
    $('resumeNotice').textContent = `전체 ${totalDays()}DAY 과정을 완료했습니다.`;
  } else if (runtime.state.migrationNotice) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').textContent = runtime.state.migrationNotice;
    runtime.state.migrationNotice = '';
    persist();
  } else if (ds.completedBlocks.length >= 4 && !ds.completedAt) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').classList.add('pending-mail-notice');
    $('resumeNotice').textContent = '학습 내용은 모두 끝났습니다. 관리자 완료 보고 메일을 보내야 DAY가 최종 완료됩니다.';
  } else if ((ds.firstStartedAt || hasProgress) && !ds.completedAt) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').classList.remove('pending-mail-notice');
    $('resumeNotice').textContent = `BLOCK ${ds.block + 1} 진행 중입니다. 저장된 위치에서 이어집니다.`;
  } else if (pendingSpellingIds().length) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').textContent = `오답 철자 반복 대기 ${pendingSpellingIds().length}개가 다음 집중블록에 포함됩니다.`;
  } else {
    $('resumeNotice').classList.remove('pending-mail-notice');
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
    openMailGate(dayNo);
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

function clearOptionKeyHandler() {
  if (runtime.optionKeyHandler) {
    document.removeEventListener('keydown', runtime.optionKeyHandler);
    runtime.optionKeyHandler = null;
  }
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
  clearOptionKeyHandler();
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

function teaserFlow(word, unit) {
  const rawSteps = Array.isArray(word.etymology_steps) ? word.etymology_steps.filter(Boolean) : [];
  let steps = rawSteps.length > 1 ? rawSteps.slice(0, -1) : rawSteps.slice();
  const answerBits = [quizMeaning(word), ...(Array.isArray(word.meanings) ? word.meanings : [])].join(' ');
  steps = steps.map((step) => String(step).replace(/^[→\s]+/, '').trim())
    .filter((step) => step && !answerBits.includes(step));
  if (!steps.length) {
    const clue = String(unit.root_meaning || '').trim();
    return clue ? [clue] : ['어원 흐름을 떠올려 보세요'];
  }
  return steps;
}

function highlightFormula(formula) {
  let chunkIndex = 0;
  return escapeHtml(formula).replace(/([A-Za-z-]+)\((=[^)]+|[^)]*)\)/g, (_match, rootText, rootMeaning) => {
    const html = `<span class="formula-chunk" style="--i:${chunkIndex}"><span class="formula-root">${rootText}</span><span class="formula-meaning">(${rootMeaning})</span></span>`;
    chunkIndex += 1;
    return html;
  });
}

function renderWordQuestion(unit, word) {
  const mastered = mastery(word.id).score >= 3 && runtime.state.settings.shortenMastered;
  $('stageBadge').textContent = mastered ? '숙달 빠른 확인' : '어원 연결';
  const formula = word.etymology_formula?.[0] || `${unit.root} → ${word.word}`;
  const flow = teaserFlow(word, unit);
  const flowHtml = flow.map((step, index) => `${index ? `<span class="flow-arrow" style="--i:${index}">→</span>` : ''}<span class="flow-piece" style="--i:${index}">${escapeHtml(step)}</span>`).join(' ');
  $('learningContent').innerHTML = `
    <div class="word-panel">
      <h2 class="word-title">${escapeHtml(word.word)}</h2>
      <span class="word-source">${escapeHtml(word.importance || '')} 원문 p.${word.source_page}</span>
      <div class="reveal-stack">
        <div class="reveal-step focus" data-reveal="1">
          <span class="reveal-label">구성</span>
          <span class="reveal-body formula-body">${highlightFormula(formula)}</span>
        </div>
        <div class="reveal-step" data-reveal="2">
          <span class="reveal-label">어원 흐름</span>
          <div class="flow-steps">${flowHtml}</div>
          <div class="inference-hint">마지막 정답 뜻은 아직 숨겨집니다. 위 흐름을 바탕으로 뜻을 추론해 보세요.</div>
        </div>
      </div>
    </div>
  `;

  const delay1 = mastered ? 0 : 180;
  const delay2 = mastered ? 0 : 780;
  const delayOptions = mastered ? 0 : 1500;
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
  options.forEach((text, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-button';
    button.innerHTML = `<span class="option-index">${index + 1}</span><span class="option-text">${escapeHtml(text)}</span>`;
    button.dataset.optionIndex = String(index + 1);
    button.dataset.optionValue = text;
    button.addEventListener('click', () => answerChoice(word, text === correct, button, correct));
    grid.appendChild(button);
  });
  const help = document.createElement('p');
  help.className = 'option-help';
  help.innerHTML = '키보드 <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> <span class="kbd">4</span> 또는 마우스/터치로 바로 선택할 수 있습니다.';
  $('answerArea').innerHTML = '';
  $('answerArea').appendChild(grid);
  $('answerArea').appendChild(help);

  runtime.optionKeyHandler = (event) => {
    const raw = event.key;
    const digit = /^([1-4])$/.test(raw) ? Number(raw) : (/^Numpad([1-4])$/.test(event.code || '') ? Number((event.code || '').replace('Numpad','')) : null);
    if (!digit) return;
    const target = Array.from(document.querySelectorAll('.option-button')).find((btn) => Number(btn.dataset.optionIndex) === digit && !btn.disabled);
    if (!target) return;
    event.preventDefault();
    target.click();
  };
  document.addEventListener('keydown', runtime.optionKeyHandler);
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
      if (button.dataset.optionValue === correctText) button.classList.add('correct');
    });
    if (!ds.reviewQueue.includes(word.id)) ds.reviewQueue.push(word.id);
    addSpellingPending(word.id, 2);
    showFeedback('error', `정답: ${correctText}`);
    const wrongNotice = document.createElement('div');
    wrongNotice.className = 'wrong-registered';
    wrongNotice.textContent = '오늘 오답으로 등록되었습니다. 이 학습 흐름 안에서 철자 회상으로 다시 등장합니다.';
    $('answerArea').appendChild(wrongNotice);
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
  const currentErrors = [...new Set(Array.isArray(ds.reviewQueue) ? ds.reviewQueue.map(String) : [])];
  const carryover = pendingSpellingIds().filter((wordId) => !currentErrors.includes(wordId)).slice(0, Math.max(0, 12 - currentErrors.length));
  const mergedQueue = [...currentErrors, ...carryover];
  if (mergedQueue.length > 0) {
    ds.phase = 'review';
    ds.reviewQueue = mergedQueue;
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
  const totalQueue = ds.reviewQueue.length;
  const currentIdx = ds.reviewIndex + 1;
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
  const isTodayError = ds.answers[wordId] === 'wrong';
  const originLabel = isTodayError ? '오늘 선택형 오답' : '누적 오답 반복';
  const originClass = isTodayError ? 'today' : 'carry';
  $('stageBadge').textContent = `오답 철자 각인 ${currentIdx} / ${totalQueue}`;
  $('learningContent').innerHTML = `
    <div class="typing-wrap">
      <div class="error-origin-badge ${originClass}">${originLabel}</div>
      <p class="typing-progress">오답 철자 각인 ${currentIdx} / ${totalQueue}</p>
      <p class="typing-prompt">${escapeHtml(quizMeaning(word))}</p>
      <p class="typing-memory-note">선택형에서 틀린 단어를 바로 철자로 회상합니다. 별도 메뉴로 이동하지 않습니다.</p>
      <p class="word-source">영어 철자를 직접 입력하세요. 오답 항목만 반복 관리합니다.</p>
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
    resolveSpellingPending(word.id);
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
    addSpellingPending(word.id, 2);
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
  addSpellingPending(word.id, 2);
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
  button.textContent = completed >= 4 ? '관리자 보고로 DAY 마무리' : '다음 블록 시작';
  button.addEventListener('click', async () => {
    if (completed >= 4) {
      openMailGate(runtime.state.currentDay);
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

function prepareCompletion(dayNo) {
  const ds = dayState(dayNo);
  if (ds.completedBlocks.length < 4) throw new Error('4개 집중블록을 모두 완료해야 관리자 보고를 보낼 수 있습니다.');
  pauseActiveTimer();
  if (!ds.completionRequestedAt) ds.completionRequestedAt = nowIso();
  if (!ds.mailGateStatus || ds.mailGateStatus === 'idle') ds.mailGateStatus = 'ready';
  persist();
  return buildReport(dayNo, true);
}

function openMailGate(dayNo = runtime.state.currentDay) {
  const ds = dayState(dayNo);
  if (ds.completedAt) {
    renderCompletion(dayNo);
    return;
  }
  const report = prepareCompletion(dayNo);
  const summary = report.summary;
  $('mailGateEmail').textContent = runtime.state.settings.email || '관리자 이메일 미설정';
  $('mailGateMetrics').innerHTML = [
    ['ROOT', `${summary.roots}개`],
    ['단어', `${summary.words}개`],
    ['오늘 오답', `${summary.wrong}개`],
    ['철자 반복', `${summary.pending_spelling}개`],
  ].map(([label, value]) => `<div class="mail-gate-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  const status = $('mailGateStatus');
  status.className = 'mail-gate-status';
  status.textContent = ds.mailGateStatus === 'error'
    ? (ds.mailGateError || '메일 전송에 실패했습니다. 다시 시도하세요.')
    : '메일 전송 성공 전에는 DAY 완료로 기록되지 않습니다.';
  if (ds.mailGateStatus === 'error') status.classList.add('error');
  const send = $('sendCompletionMail');
  send.disabled = false;
  send.textContent = '관리자에게 완료 보고 보내기';
  $('mailGateModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => send.focus());
}

function closeMailGate() {
  $('mailGateModal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function finalizeDayRecord(dayNo, forced = false) {
  const ds = dayState(dayNo);
  if (!ds.completedAt) {
    pauseActiveTimer();
    ds.completedAt = nowIso();
    ds.forced = Boolean(forced);
    ds.completedBlocks = [0, 1, 2, 3];
    ds.mailGateStatus = forced ? 'idle' : 'sent';
    if (!forced) ds.mailConfirmedAt = nowIso();
    if (!runtime.state.completedDays.includes(dayNo)) runtime.state.completedDays.push(dayNo);
    runtime.state.completedDays.sort((a, b) => a - b);
  }
  persist();
}

async function sendCompletionReport() {
  const dayNo = runtime.state.currentDay;
  const ds = dayState(dayNo);
  if (!runtime.state.settings.email) {
    const status = $('mailGateStatus');
    status.className = 'mail-gate-status error';
    status.textContent = '관리자 이메일이 설정되지 않았습니다. 관리자 화면에서 이메일을 입력하세요.';
    return;
  }
  const report = prepareCompletion(dayNo);
  report.requiresCompletion = true;
  ds.mailGateStatus = 'sending';
  ds.mailGateError = '';
  persist();
  const send = $('sendCompletionMail');
  const status = $('mailGateStatus');
  send.disabled = true;
  send.textContent = '완료 보고 전송 중…';
  status.className = 'mail-gate-status sending';
  status.textContent = '관리자 메일 전송 결과를 확인하고 있습니다.';
  const result = await queueOrSendReport(report);
  if (result.ok) {
    ds.mailGateStatus = 'sent';
    ds.mailGateError = '';
    finalizeDayRecord(dayNo, false);
    status.className = 'mail-gate-status success';
    status.textContent = '전송 성공 · DAY 학습이 최종 완료되었습니다.';
    send.textContent = '전송 성공 ✓';
    persist();
    setTimeout(() => {
      closeMailGate();
      renderCompletion(dayNo);
    }, 650);
    return;
  }
  ds.mailGateStatus = 'error';
  ds.mailGateError = `메일 전송 실패: ${result.error || '배포 환경과 메일 설정을 확인하세요.'}`;
  persist();
  send.disabled = false;
  send.textContent = '다시 전송하기';
  status.className = 'mail-gate-status error';
  status.textContent = `${ds.mailGateError} DAY는 아직 미완료 상태입니다.`;
}

async function finishDay(forced) {
  const dayNo = runtime.state.currentDay;
  const ds = dayState(dayNo);
  if (!forced) {
    openMailGate(dayNo);
    return;
  }
  if (ds.completedBlocks.length < 4 && !ds.completedAt) {
    ds.completedBlocks = [0, 1, 2, 3];
  }
  if (!ds.completionRequestedAt) ds.completionRequestedAt = nowIso();
  finalizeDayRecord(dayNo, true);
  const report = buildReport(dayNo, false);
  report.forced = true;
  queueOrSendReport(report).catch(() => {});
  renderCompletion(dayNo);
}

function buildReport(dayNo, requiresCompletion = false) {
  const d = currentDayDef(dayNo);
  const ds = dayState(dayNo);
  const reportTime = ds.completedAt || ds.completionRequestedAt || nowIso();
  const reportId = `18day-root-${dayNo}-${reportTime.slice(0, 19).replace(/\D/g, '')}`;
  const wrongWords = Object.entries(ds.answers || {})
    .filter(([, result]) => result === 'wrong')
    .map(([wordId]) => findWordById(wordId)?.word)
    .filter(Boolean);
  return {
    reportId,
    appName: APP_NAME,
    requiresCompletion,
    email: runtime.state.settings.email,
    day: dayNo,
    startedAt: ds.firstStartedAt,
    completedAt: ds.completedAt || ds.completionRequestedAt,
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
      pending_spelling: pendingSpellingIds().length,
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
    if (result.ok) {
      success += 1;
      if (report.requiresCompletion && !dayState(Number(report.day)).completedAt) finalizeDayRecord(Number(report.day), false);
    }
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
    ['철자 반복 대기', `${report.summary.pending_spelling}개`],
  ];
  $('completionMetrics').innerHTML = metrics.map(([label, value]) => `
    <div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join('');
  if (dayState(dayNo).forced) {
    $('mailStatus').textContent = '관리자 강제 완료로 처리되었습니다. 완료 보고 메일은 별도로 전송을 시도합니다.';
  } else {
    $('mailStatus').textContent = `완료 보고서를 ${runtime.state.settings.email}로 전송하여 DAY를 마무리했습니다.`;
  }
  $('completionConfirm').textContent = dayNo < totalDays() ? `DAY ${pad(dayNo + 1)}로 이동` : '전체 과정 확인';
  $('completionConfirm').onclick = () => {
    if (dayNo < totalDays()) runtime.state.currentDay = Math.max(runtime.state.currentDay, dayNo + 1);
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
  $('autoMail').checked = true;
  $('shortenMastered').checked = s.shortenMastered;
  $('blockMinutes').value = String(s.blockMinutes);
  const backlog = pendingSpellingIds();
  $('spellingBacklogSummary').innerHTML = backlog.length
    ? `<strong>오답 철자 반복 대기 ${backlog.length}개</strong><span>정답 철자 회상에 성공할 때마다 반복 횟수가 줄어듭니다.</span>`
    : '<strong>오답 철자 반복 대기 없음</strong><span>현재 누적된 철자 오답이 없습니다.</span>';
  $('adminProgressList').innerHTML = runtime.schedule.days.map((d) => {
    const done = runtime.state.completedDays.includes(d.new_day);
    const current = runtime.state.currentDay === d.new_day;
    return `<div class="admin-day ${done ? 'done' : ''} ${current ? 'current' : ''}"><strong>DAY ${pad(d.new_day)}</strong><span>${done ? '완료' : current ? '진행 중' : '대기'} · ${d.words}단어</span></div>`;
  }).join('');
}

function saveAdminSettings() {
  const email = $('reportEmail').value.trim();
  if (!email) { window.alert('DAY 완료에 필요한 관리자 이메일을 입력하세요.'); return; }
  const selectedDay = clamp(Number($('daySelect').value), 1, totalDays());
  runtime.state.currentDay = selectedDay;
  runtime.state.settings = {
    start: $('startTime').value || '19:30',
    end: $('endTime').value || '20:30',
    email,
    autoMail: true,
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
    app: '18DAY_ROOT',
    schemaVersion: SCHEMA_VERSION,
    dataVersion: DATA_VERSION,
    exportedAt: nowIso(),
    state: runtime.state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `18day_root_progress_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importProgressFile(file) {
  if (!file) return;
  const payload = JSON.parse(await file.text());
  if (!payload?.state || !['18DAY_ROOT','VOCA_ROOT_18DAY','VOCA_ROOT_FLEXDAY','VOCA_ROOT_24DAY'].includes(payload?.app)) {
    throw new Error('올바른 VOCA ROOT 진도 백업 파일이 아닙니다.');
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
  $('sendCompletionMail').addEventListener('click', sendCompletionReport);
  $('mailGateBack').addEventListener('click', () => { closeMailGate(); renderHome(); });
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
