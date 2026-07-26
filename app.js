'use strict';

const APP_KEY = '18dayRootStateV7';
const BACKUP_KEY = '18dayRootStateV7Backup';
const LEGACY_V6_KEY = '18dayRootStateV5';
const LEGACY_24_KEY = 'vocaRoot24StateV4';
const LEGACY_V3_KEY = 'vocaRoot18StateV3';
const LEGACY_V2_KEY = 'vocaRoot18StateV2';
const LEGACY_KEY = 'voca18State';
const SCHEMA_VERSION = 7;
const DATA_VERSION = '18day-root-integrated-360x1410-20260726-v7';
const MINI_SET_SIZE = 6;
const PRE_REVIEW_LIMIT = 8;
const APP_NAME = '18day_root';

const runtime = {
  schedule: null,
  content: null,
  unitMap: new Map(),
  sessionTimer: null,
  revealTimers: [],
  optionKeyHandler: null,
  flowTimer: null,
  questionStartedAt: null,
  activeSessionId: null,
  state: null,
};

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const nowIso = () => new Date().toISOString();
const todayKey = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const addDays = (dateKey, amount) => {
  const base = new Date(`${dateKey}T12:00:00`);
  base.setDate(base.getDate() + amount);
  return todayKey(base);
};
const totalDays = () => runtime.schedule?.days?.length || 18;

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: DATA_VERSION,
    revision: 0,
    updatedAt: null,
    deviceId: createDeviceId(),
    eventCounter: 0,
    eventLog: [],
    currentDay: 1,
    completedDays: [],
    settings: {
      start: '19:30',
      end: '20:30',
      email: 'sk01197375068@gmail.com',
      autoMail: true,
      shortenMastered: true,
      blockMinutes: 15,
      preReviewLimit: PRE_REVIEW_LIMIT,
      delayedReviewDailyLimit: 15,
      d3DailyLimit: 8,
      stableResponseMs: 4000,
      slowResponseMs: 6000,
    },
    mastery: {},
    days: {},
    spellingNotebook: {},
    wrongHistory: {},
    reviewSchedule: {},
    pendingReports: [],
    sentReportIds: [],
    sessions: [],
    sync: { status: 'local-safe', lastVerifiedAt: null, error: '' },
    migrationNotice: '',
  };
}


function createDeviceId() {
  try {
    const existing = localStorage.getItem('18dayRootDeviceId');
    if (existing) return existing;
    const created = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('18dayRootDeviceId', created);
    return created;
  } catch (_error) {
    return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function createSessionId() {
  return `session-${todayKey()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function logEvent(action, details = {}) {
  if (!runtime.state) return null;
  runtime.state.eventCounter = Number(runtime.state.eventCounter || 0) + 1;
  const event = {
    eventId: `${runtime.state.deviceId}-${Date.now()}-${runtime.state.eventCounter}`,
    sessionId: runtime.activeSessionId,
    deviceId: runtime.state.deviceId,
    day: runtime.state.currentDay,
    action,
    createdAt: nowIso(),
    ...details,
  };
  runtime.state.eventLog.push(event);
  if (runtime.state.eventLog.length > 2500) runtime.state.eventLog.splice(0, runtime.state.eventLog.length - 2500);
  return event;
}

function dayState(dayNo) {
  const key = String(dayNo);
  if (!runtime.state.days[key]) {
    runtime.state.days[key] = {
      startedAt: null,
      firstStartedAt: null,
      completedAt: null,
      elapsedSeconds: 0,
      postCourseSeconds: 0,
      postCourseStartedAt: null,
      completedBlocks: [],
      block: 0,
      phase: 'root',
      unitIndex: 0,
      wordIndex: 0,
      reviewQueue: [],
      reviewIndex: 0,
      reviewReturn: 'word',
      typingAttempts: 0,
      reviewResolved: false,
      spacedReviewQueue: [],
      spacedReviewIndex: 0,
      spacedReviewMode: 'choice',
      spacedTypingAttempts: 0,
      spacedChoiceWrong: false,
      spacedReturnPhase: 'root',
      preReviewDate: null,
      miniRewardAt: 0,
      resumePhase: 'word',
      stats: { attempted: 0, correct: 0, wrong: 0, typed: 0, reviewAttempted: 0, reviewCorrect: 0, reviewWrong: 0 },
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
    postCourseSeconds: 0,
    postCourseStartedAt: null,
    completedBlocks: [],
    block: 0,
    phase: 'root',
    unitIndex: 0,
    wordIndex: 0,
    reviewQueue: [],
    reviewIndex: 0,
    reviewReturn: 'word',
    typingAttempts: 0,
    reviewResolved: false,
    spacedReviewQueue: [],
    spacedReviewIndex: 0,
    spacedReviewMode: 'choice',
    spacedTypingAttempts: 0,
    spacedChoiceWrong: false,
    spacedReturnPhase: 'root',
    preReviewDate: null,
    miniRewardAt: 0,
    resumePhase: 'word',
    stats: { attempted: 0, correct: 0, wrong: 0, typed: 0, reviewAttempted: 0, reviewCorrect: 0, reviewWrong: 0 },
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
  out.phase = ['root', 'word', 'review', 'spacedReview', 'miniReward', 'blockReward'].includes(out.phase) ? out.phase : 'root';
  out.unitIndex = Math.max(0, Number(out.unitIndex || 0));
  out.wordIndex = Math.max(0, Number(out.wordIndex || 0));
  out.reviewQueue = Array.isArray(out.reviewQueue) ? [...new Set(out.reviewQueue.map(String))] : [];
  out.reviewIndex = Math.max(0, Number(out.reviewIndex || 0));
  out.reviewReturn = ['word', 'block'].includes(out.reviewReturn) ? out.reviewReturn : 'word';
  out.typingAttempts = Math.max(0, Number(out.typingAttempts || 0));
  out.reviewResolved = Boolean(out.reviewResolved);
  out.spacedReviewQueue = Array.isArray(out.spacedReviewQueue) ? [...new Set(out.spacedReviewQueue.map(String))] : [];
  out.spacedReviewIndex = Math.max(0, Number(out.spacedReviewIndex || 0));
  out.spacedReviewMode = ['choice', 'typing'].includes(out.spacedReviewMode) ? out.spacedReviewMode : 'choice';
  out.spacedTypingAttempts = Math.max(0, Number(out.spacedTypingAttempts || 0));
  out.spacedChoiceWrong = Boolean(out.spacedChoiceWrong);
  out.spacedReturnPhase = ['root', 'word'].includes(out.spacedReturnPhase) ? out.spacedReturnPhase : 'root';
  out.preReviewDate = typeof out.preReviewDate === 'string' ? out.preReviewDate : null;
  out.miniRewardAt = Math.max(0, Number(out.miniRewardAt || 0));
  out.resumePhase = ['root', 'word'].includes(out.resumePhase) ? out.resumePhase : 'word';
  out.elapsedSeconds = Math.max(0, Number(out.elapsedSeconds || 0));
  out.postCourseSeconds = Math.max(0, Number(out.postCourseSeconds || 0));
  out.postCourseStartedAt = out.postCourseStartedAt || null;
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
    reviewAttempted: Math.max(0, Number(stats.reviewAttempted || 0)),
    reviewCorrect: Math.max(0, Number(stats.reviewCorrect || 0)),
    reviewWrong: Math.max(0, Number(stats.reviewWrong || 0)),
  };
  if (out.completedAt) out.completedBlocks = [0, 1, 2, 3];
  return out;
}

function sanitizeState(raw) {
  const out = defaultState();
  if (raw && typeof raw === 'object') Object.assign(out, raw);
  out.schemaVersion = SCHEMA_VERSION;
  out.dataVersion = DATA_VERSION;
  out.revision = Math.max(0, Number(out.revision || 0));
  out.updatedAt = out.updatedAt || null;
  out.deviceId = typeof out.deviceId === 'string' && out.deviceId ? out.deviceId : createDeviceId();
  out.eventCounter = Math.max(0, Number(out.eventCounter || 0));
  out.eventLog = Array.isArray(out.eventLog) ? out.eventLog.slice(-2500) : [];
  out.settings = { ...defaultState().settings, ...(raw?.settings || {}) };
  out.settings.blockMinutes = [12, 15, 18].includes(Number(out.settings.blockMinutes))
    ? Number(out.settings.blockMinutes) : 15;
  out.settings.preReviewLimit = clamp(Number(out.settings.preReviewLimit || PRE_REVIEW_LIMIT), 1, 15);
  out.settings.delayedReviewDailyLimit = clamp(Number(out.settings.delayedReviewDailyLimit || 15), 5, 25);
  out.settings.d3DailyLimit = clamp(Number(out.settings.d3DailyLimit || 8), 3, 12);
  out.settings.stableResponseMs = clamp(Number(out.settings.stableResponseMs || 4000), 1500, 10000);
  out.settings.slowResponseMs = clamp(Number(out.settings.slowResponseMs || 6000), 2500, 15000);
  out.currentDay = clamp(Number(out.currentDay || 1), 1, totalDays());
  out.completedDays = [...new Set((Array.isArray(out.completedDays) ? out.completedDays : [])
    .map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= totalDays()))].sort((a, b) => a - b);
  out.pendingReports = Array.isArray(out.pendingReports) ? out.pendingReports : [];
  out.sentReportIds = Array.isArray(out.sentReportIds) ? [...new Set(out.sentReportIds.map(String))] : [];
  out.mastery = out.mastery && typeof out.mastery === 'object' ? out.mastery : {};
  out.days = out.days && typeof out.days === 'object' ? out.days : {};
  out.spellingNotebook = out.spellingNotebook && typeof out.spellingNotebook === 'object' ? out.spellingNotebook : {};
  out.wrongHistory = out.wrongHistory && typeof out.wrongHistory === 'object' ? out.wrongHistory : {};
  out.reviewSchedule = out.reviewSchedule && typeof out.reviewSchedule === 'object' ? out.reviewSchedule : {};
  out.sessions = Array.isArray(out.sessions) ? out.sessions.slice(-300) : [];
  out.sync = out.sync && typeof out.sync === 'object' ? { status: 'local-safe', lastVerifiedAt: null, error: '', ...out.sync } : { status: 'local-safe', lastVerifiedAt: null, error: '' };
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

  Object.entries(answerMap).forEach(([wordId, result]) => {
    if (result !== 'wrong') return;
    base.wrongHistory[wordId] = {
      wordId: String(wordId),
      firstWrongAt: nowIso(),
      lastWrongAt: nowIso(),
      totalWrong: 1,
      wrongTypes: ['MIGRATED'],
      directions: { recognition: 1, recall: 0, etymology: 0, context: 0 },
      selectedAnswer: null,
      correctAnswer: null,
      lastResponseMs: null,
      status: 'ACTIVE',
      reviewLog: [{ at: nowIso(), stage: 'MIGRATION', result: 'wrong', direction: 'recognition', type: 'MIGRATED' }],
    };
    base.reviewSchedule[wordId] = {
      wordId: String(wordId),
      originDate: todayKey(),
      stage: 'D1_DUE',
      dueDate: todayKey(),
      reason: ['MIGRATED_WRONG'],
      priority: 8,
      correctStreak: 0,
      retryCount: 0,
      status: 'ACTIVE',
      lastResult: null,
      updatedAt: nowIso(),
    };
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

    const backup = readStoredJson(BACKUP_KEY);
    if (backup) {
      const restored = sanitizeState(backup);
      restored.migrationNotice = '안전백업에서 진도를 복원했습니다.';
      return restored;
    }

    const legacyV6 = readStoredJson(LEGACY_V6_KEY);
    if (legacyV6) return sanitizeState(migrateScheduleState(legacyV6));

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

function persist(reason = 'state') {
  if (!runtime.state) return;
  const previous = localStorage.getItem(APP_KEY);
  if (previous) localStorage.setItem(BACKUP_KEY, previous);
  runtime.state.revision = Math.max(0, Number(runtime.state.revision || 0)) + 1;
  runtime.state.updatedAt = nowIso();
  runtime.state.lastPersistReason = reason;
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

function blankDirectionMastery() {
  return { correct: 0, wrong: 0, score: 0, lastResponseMs: null, lastSeen: null };
}

function mastery(wordId) {
  if (!runtime.state.mastery[wordId]) {
    runtime.state.mastery[wordId] = {
      score: 0,
      correct: 0,
      wrong: 0,
      lastSeen: null,
      recognition: blankDirectionMastery(),
      recall: blankDirectionMastery(),
      etymology: blankDirectionMastery(),
      context: blankDirectionMastery(),
    };
  }
  const entry = runtime.state.mastery[wordId];
  ['recognition', 'recall', 'etymology', 'context'].forEach((key) => {
    entry[key] = { ...blankDirectionMastery(), ...(entry[key] || {}) };
  });
  entry.score = clamp(Number(entry.score || 0), 0, 5);
  entry.correct = Math.max(0, Number(entry.correct || 0));
  entry.wrong = Math.max(0, Number(entry.wrong || 0));
  return entry;
}

function updateDirectionMastery(wordId, direction, correct, responseMs = null) {
  const entry = mastery(wordId);
  const dir = entry[direction] || (entry[direction] = blankDirectionMastery());
  dir.lastSeen = nowIso();
  dir.lastResponseMs = Number.isFinite(responseMs) ? Math.round(responseMs) : dir.lastResponseMs;
  if (correct) {
    dir.correct += 1;
    dir.score = clamp(Number(dir.score || 0) + 1, 0, 5);
  } else {
    dir.wrong += 1;
    dir.score = clamp(Number(dir.score || 0) - 1, 0, 5);
  }
  return dir;
}


function wrongEntry(wordId) {
  if (!runtime.state.wrongHistory[wordId]) {
    runtime.state.wrongHistory[wordId] = {
      wordId: String(wordId),
      firstWrongAt: null,
      lastWrongAt: null,
      totalWrong: 0,
      wrongTypes: [],
      directions: { recognition: 0, recall: 0, etymology: 0, context: 0 },
      selectedAnswer: null,
      correctAnswer: null,
      lastResponseMs: null,
      status: 'ACTIVE',
      reviewLog: [],
    };
  }
  return runtime.state.wrongHistory[wordId];
}

function recordWrong(word, { type = 'MEANING', direction = 'recognition', selectedAnswer = null, correctAnswer = null, responseMs = null, stage = 'D0' } = {}) {
  const entry = wrongEntry(word.id);
  const stamp = nowIso();
  if (!entry.firstWrongAt) entry.firstWrongAt = stamp;
  entry.lastWrongAt = stamp;
  entry.totalWrong = Math.max(0, Number(entry.totalWrong || 0)) + 1;
  entry.wrongTypes = Array.isArray(entry.wrongTypes) ? entry.wrongTypes : [];
  entry.reviewLog = Array.isArray(entry.reviewLog) ? entry.reviewLog : [];
  if (!entry.wrongTypes.includes(type)) entry.wrongTypes.push(type);
  entry.directions = { recognition: 0, recall: 0, etymology: 0, context: 0, ...(entry.directions || {}) };
  entry.directions[direction] = Math.max(0, Number(entry.directions[direction] || 0)) + 1;
  entry.selectedAnswer = selectedAnswer;
  entry.correctAnswer = correctAnswer;
  entry.lastResponseMs = Number.isFinite(responseMs) ? Math.round(responseMs) : entry.lastResponseMs;
  entry.status = 'ACTIVE';
  entry.reviewLog.push({ at: stamp, stage, result: 'wrong', direction, type, responseMs: entry.lastResponseMs });
  if (entry.reviewLog.length > 100) entry.reviewLog.splice(0, entry.reviewLog.length - 100);
  return entry;
}

function recordReviewResult(wordId, stage, result, direction, responseMs = null, extra = {}) {
  const entry = wrongEntry(wordId);
  entry.reviewLog = Array.isArray(entry.reviewLog) ? entry.reviewLog : [];
  entry.reviewLog.push({ at: nowIso(), stage, result, direction, responseMs: Number.isFinite(responseMs) ? Math.round(responseMs) : null, ...extra });
  if (entry.reviewLog.length > 100) entry.reviewLog.splice(0, entry.reviewLog.length - 100);
  entry.lastResult = result;
  return entry;
}

function scheduleReview(wordId, stage, dueDate, reason = [], priority = 5, originDate = todayKey()) {
  const key = String(wordId);
  const existing = runtime.state.reviewSchedule[key] || {};
  runtime.state.reviewSchedule[key] = {
    wordId: key,
    originDate: existing.originDate || originDate,
    stage,
    dueDate,
    reason: [...new Set([...(Array.isArray(existing.reason) ? existing.reason : []), ...(Array.isArray(reason) ? reason : [reason])])],
    priority: Math.max(Number(existing.priority || 0), Number(priority || 0)),
    correctStreak: Number(existing.correctStreak || 0),
    retryCount: Number(existing.retryCount || 0),
    status: 'ACTIVE',
    lastResult: existing.lastResult || null,
    updatedAt: nowIso(),
  };
  return runtime.state.reviewSchedule[key];
}

function scheduleInitialD1(word) {
  return scheduleReview(word.id, 'D1_DUE', addDays(todayKey(), 1), ['D0_WRONG'], 8, todayKey());
}

function activeReviewEntries() {
  return Object.values(runtime.state.reviewSchedule || {}).filter((entry) => entry && entry.status === 'ACTIVE');
}

function reviewStageRank(stage) {
  return ({ D1_DUE: 1, D6_DUE: 2, D3_DUE: 3, FOCUS_CARE: 4 })[stage] || 9;
}

function selectDueReviews(limit = PRE_REVIEW_LIMIT) {
  const today = todayKey();
  return activeReviewEntries()
    .filter((entry) => entry.dueDate && entry.dueDate <= today)
    .sort((a, b) => {
      const overdueA = Math.max(0, Math.floor((new Date(`${today}T12:00:00`) - new Date(`${a.dueDate}T12:00:00`)) / 86400000));
      const overdueB = Math.max(0, Math.floor((new Date(`${today}T12:00:00`) - new Date(`${b.dueDate}T12:00:00`)) / 86400000));
      return overdueB - overdueA || reviewStageRank(a.stage) - reviewStageRank(b.stage) || Number(b.priority || 0) - Number(a.priority || 0);
    })
    .slice(0, limit)
    .map((entry) => String(entry.wordId));
}

function stageLabel(stage) {
  return ({ D1_DUE: 'D+1 기억 확인', D3_DUE: 'D+3 강화 확인', D6_DUE: 'D+6 안정화 확인', FOCUS_CARE: '집중 케어' })[stage] || '복습 확인';
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
  return String(value)
    .replace(/^\[\]\s*/, '')
    .replace(/\s+[A-Za-z][A-Za-z,;/' -]*(?=\s|$)/g, ' ')
    .replace(/^\s*\d+\s*/g, '')
    .replace(/(^|\s)\d+(?=\s*[가-힣\[])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function quizMeaning(word) {
  const cleaned = word.quiz_meaning || cleanMeaning(word.meaning || word.meanings?.[0] || '');
  return cleaned || word.meaning || '뜻 정보 확인 필요';
}

function meaningFragments(word) {
  const raw = [word.quiz_meaning, word.meaning, ...(Array.isArray(word.meanings) ? word.meanings : [])]
    .filter(Boolean)
    .map((item) => cleanMeaning(String(item)));
  const parts = raw.flatMap((item) => [item, ...item.split(/[\/;,·]|\s{2,}/).map((part) => cleanMeaning(part))]);
  return Array.from(new Set(parts
    .map((item) => String(item || '').trim())
    .filter((item) => item && item !== '뜻 정보 확인 필요' && item.length >= 2)))
    .sort((a, b) => b.length - a.length);
}

function maskAnswerHints(text, word) {
  let out = String(text || '').trim();
  if (!out) return '??';
  meaningFragments(word).forEach((fragment) => {
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '??');
  });
  out = out.replace(/\?\?\s*→\s*\?\?/g, '??');
  out = out.replace(/\?{3,}/g, '??').replace(/\s+/g, ' ').trim();
  return out || '??';
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
  const completedBlocks = ds.completedBlocks.length;
  const completedWords = totalCompletedWords(dayNo);
  const totalWords = d.words;
  const dueReviews = selectDueReviews(Number(runtime.state.settings.preReviewLimit || PRE_REVIEW_LIMIT));
  const courseStudyCompleted = dayNo === totalDays() && Boolean(ds.completedAt);
  const postCourseDue = courseStudyCompleted && dueReviews.length > 0;
  const courseCompleted = courseStudyCompleted && !postCourseDue;
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
  $('goalAmount').textContent = `ROOT ${d.roots}개 · 신규 ${d.words}개${dueReviews.length ? ` · 오늘 복습 ${dueReviews.length}개` : ''}`;
  $('timeRemain').textContent = `${Math.max(0, Math.ceil(targetMinutes - elapsedMin))}분`;
  $('amountRemain').textContent = `${Math.max(0, totalWords - completedWords)}개`;
  setRing($('timeRing'), timePercent);
  setRing($('amountRing'), amountPercent);
  $('blockStatus').textContent = `${completedBlocks} / 4 구간 완료`;
  const hasProgress = ds.completedBlocks.length > 0 || Object.keys(ds.answers || {}).length > 0 || ds.unitIndex > 0 || ds.wordIndex > 0;
  const awaitingMail = ds.completedBlocks.length >= 4 && !ds.completedAt;
  $('startButton').textContent = postCourseDue
    ? `과정 후 기억 확인 ${dueReviews.length}개`
    : courseCompleted
      ? `${totalDays()}DAY 과정 완료`
      : (awaitingMail ? '관리자 보고 후 DAY 완료' : (hasProgress ? '저장된 위치에서 계속' : `DAY ${pad(dayNo)} 전체 학습 시작`));
  $('startButton').disabled = courseCompleted;

  $('blockList').innerHTML = '';
  d.blocks.forEach((b, index) => {
    const done = ds.completedBlocks.includes(index);
    const active = !done && index === completedBlocks;
    const segment = document.createElement('div');
    segment.className = `segment-step ${done ? 'done' : active ? 'active' : 'upcoming'}`;
    segment.setAttribute('aria-label', `${index + 1}구간 ${done ? '완료' : active ? '진행 예정' : '대기'}`);
    segment.innerHTML = `
      <span class="segment-number">${done ? '✓' : index + 1}</span>
      <span class="segment-label">${index + 1}구간</span>
      <small>단어 ${b.words}</small>
    `;
    $('blockList').appendChild(segment);
  });

  if (postCourseDue) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').textContent = `신규 학습은 완료되었습니다. 오늘은 과정 후 기억 확인 ${dueReviews.length}개만 진행합니다.`;
  } else if (courseCompleted) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').textContent = `전체 ${totalDays()}DAY 신규 학습을 완료했습니다.`;
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
    $('resumeNotice').textContent = `오늘 학습 ${ds.block + 1}/4 구간 진행 중입니다. 한 번 들어가면 남은 구간이 자동으로 이어집니다.`;
  } else if (dueReviews.length) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').textContent = `오늘 기억 확인 ${dueReviews.length}개가 신규 학습 전에 자동으로 진행됩니다.`;
  } else if (activeReviewEntries().length) {
    $('resumeNotice').classList.remove('hidden');
    $('resumeNotice').textContent = `오답노트에 ${activeReviewEntries().length}개가 저장되어 있으며 예정일에 자동으로 다시 나옵니다.`;
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

function prepareDueReviewForDay(dayNo) {
  const ds = dayState(dayNo);
  if (ds.phase === 'spacedReview' && ds.spacedReviewQueue.length) return;
  if (ds.preReviewDate === todayKey()) return;
  const due = selectDueReviews(Number(runtime.state.settings.preReviewLimit || PRE_REVIEW_LIMIT));
  ds.spacedReturnPhase = ['root', 'word'].includes(ds.phase) ? ds.phase : 'root';
  ds.spacedReviewQueue = due;
  ds.spacedReviewIndex = 0;
  ds.spacedReviewMode = 'choice';
  ds.spacedTypingAttempts = 0;
  ds.spacedChoiceWrong = false;
  if (due.length) ds.phase = 'spacedReview';
  else ds.preReviewDate = todayKey();
}

async function startOrResumeSession() {
  const dayNo = runtime.state.currentDay;
  const ds = dayState(dayNo);
  if (ds.completedAt) {
    const due = selectDueReviews(Number(runtime.state.settings.preReviewLimit || PRE_REVIEW_LIMIT));
    if (!due.length) {
      renderCompletion(dayNo);
      return;
    }
    ds.spacedReviewQueue = due;
    ds.spacedReviewIndex = 0;
    ds.spacedReviewMode = 'choice';
    ds.spacedTypingAttempts = 0;
    ds.spacedChoiceWrong = false;
    ds.spacedReturnPhase = 'root';
    ds.phase = 'spacedReview';
    if (!ds.postCourseStartedAt) ds.postCourseStartedAt = nowIso();
    if (!runtime.activeSessionId) runtime.activeSessionId = createSessionId();
    logEvent('post_course_review_start', { count: due.length });
    persist('post_course_review_start');
    showScreen('sessionScreen');
    startSessionTimer();
    renderSessionStep();
    return;
  }
  if (ds.completedBlocks.length >= 4) {
    openMailGate(dayNo);
    return;
  }
  if (!ds.firstStartedAt) ds.firstStartedAt = nowIso();
  if (!ds.startedAt) ds.startedAt = nowIso();
  if (!runtime.activeSessionId) {
    runtime.activeSessionId = createSessionId();
    runtime.state.sessions.push({ sessionId: runtime.activeSessionId, deviceId: runtime.state.deviceId, day: dayNo, startedAt: nowIso(), endedAt: null, activeSeconds: 0 });
    if (runtime.state.sessions.length > 300) runtime.state.sessions.splice(0, runtime.state.sessions.length - 300);
    logEvent('session_start', { day: dayNo });
  }
  ds.block = ds.completedBlocks.length;
  prepareDueReviewForDay(dayNo);
  persist('session_start');
  showScreen('sessionScreen');
  startSessionTimer();
  renderSessionStep();
}


function pauseActiveTimer() {
  if (!runtime.state) return;
  const ds = dayState(runtime.state.currentDay);
  let delta = 0;
  if (ds.startedAt && !ds.completedAt) {
    delta = Math.max(0, Math.floor((Date.now() - new Date(ds.startedAt).getTime()) / 1000));
    ds.elapsedSeconds += delta;
    ds.startedAt = null;
  } else if (ds.completedAt && ds.postCourseStartedAt) {
    delta = Math.max(0, Math.floor((Date.now() - new Date(ds.postCourseStartedAt).getTime()) / 1000));
    ds.postCourseSeconds += delta;
    ds.postCourseStartedAt = null;
  }
  if (delta > 0) {
    const session = runtime.state.sessions.find((item) => item.sessionId === runtime.activeSessionId);
    if (session) {
      session.activeSeconds = Math.max(0, Number(session.activeSeconds || 0)) + delta;
      session.lastPausedAt = nowIso();
    }
    logEvent('timer_pause', { activeSecondsAdded: delta, postCourse: Boolean(ds.completedAt) });
    persist('timer_pause');
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
  clearFlowTimer();
}

function clearRevealTimers() {
  runtime.revealTimers.forEach((timer) => clearTimeout(timer));
  runtime.revealTimers = [];
}

function clearFlowTimer() {
  if (runtime.flowTimer) clearTimeout(runtime.flowTimer);
  runtime.flowTimer = null;
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
  const dayNo = runtime.state.currentDay;
  const ds = dayState(dayNo);
  const allWords = dayWords(dayNo);
  const answeredIds = new Set(Object.keys(ds.answers || {}).map(String));
  const answered = allWords.filter((word) => answeredIds.has(String(word.id))).length;
  if (ds.phase === 'spacedReview' && ds.spacedReviewQueue.length) {
    $('sessionBlockLabel').textContent = `오늘 기억 확인 · ${ds.spacedReviewIndex + 1}/${ds.spacedReviewQueue.length}`;
    $('sessionProgressText').textContent = `${ds.spacedReviewIndex} / ${ds.spacedReviewQueue.length}`;
    $('sessionProgressBar').style.width = `${ds.spacedReviewQueue.length ? (ds.spacedReviewIndex / ds.spacedReviewQueue.length) * 100 : 0}%`;
    return;
  }
  const currentSegment = Math.min(4, Math.max(1, Number(ds.block || 0) + 1));
  const miniPosition = answered === 0 ? 0 : ((answered - 1) % MINI_SET_SIZE) + 1;
  $('sessionBlockLabel').textContent = `DAY ${pad(dayNo)} · ${currentSegment}/4구간 · 짧은 목표 ${miniPosition}/${MINI_SET_SIZE}`;
  $('sessionProgressText').textContent = `${answered} / ${allWords.length}`;
  $('sessionProgressBar').style.width = `${allWords.length ? (answered / allWords.length) * 100 : 0}%`;
}

function renderSessionStep() {
  clearRevealTimers();
  clearOptionKeyHandler();
  clearFlowTimer();
  updateSessionProgressHeader();
  const { ds, units, unit, word } = currentSessionContext();
  $('feedback').className = 'feedback hidden';
  $('feedback').textContent = '';
  $('answerArea').innerHTML = '';

  if (ds.phase === 'spacedReview') {
    renderSpacedReview();
    return;
  }
  if (ds.phase === 'miniReward') {
    renderMiniSetReward();
    return;
  }
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

function futureDue(targetDate) {
  return targetDate <= todayKey() ? addDays(todayKey(), 1) : targetDate;
}

function markReviewStable(wordId, stage) {
  const scheduled = runtime.state.reviewSchedule[wordId];
  if (scheduled) {
    scheduled.status = 'STABLE';
    scheduled.stage = 'STABLE';
    scheduled.dueDate = null;
    scheduled.lastResult = 'correct';
    scheduled.updatedAt = nowIso();
  }
  const wrong = wrongEntry(wordId);
  wrong.status = 'STABLE';
  recordReviewResult(wordId, stage, 'stable', 'recall');
}

function routeReviewSuccess(wordId, entry, responseMs, hadChoiceWrong = false) {
  const origin = entry.originDate || todayKey();
  entry.lastResult = 'correct';
  entry.updatedAt = nowIso();
  if (entry.stage === 'D1_DUE') {
    if (!hadChoiceWrong && responseMs <= Number(runtime.state.settings.stableResponseMs || 4000)) {
      scheduleReview(wordId, 'D6_DUE', futureDue(addDays(origin, 6)), ['D1_FAST_CORRECT'], Math.max(5, Number(entry.priority || 0)), origin);
    } else {
      scheduleReview(wordId, 'D3_DUE', futureDue(addDays(origin, 3)), ['D1_UNSTABLE'], Math.max(7, Number(entry.priority || 0)), origin);
    }
    return;
  }
  if (entry.stage === 'D3_DUE') {
    scheduleReview(wordId, 'D6_DUE', futureDue(addDays(origin, 6)), ['D3_CORRECT'], Math.max(6, Number(entry.priority || 0)), origin);
    return;
  }
  if (entry.stage === 'D6_DUE') {
    markReviewStable(wordId, 'D6_DUE');
    return;
  }
  if (entry.stage === 'FOCUS_CARE') {
    entry.correctStreak = Number(entry.correctStreak || 0) + 1;
    if (entry.correctStreak >= 2) markReviewStable(wordId, 'FOCUS_CARE');
    else scheduleReview(wordId, 'FOCUS_CARE', addDays(todayKey(), 1), ['FOCUS_NEEDS_SECOND_DATE'], Math.max(10, Number(entry.priority || 0)), origin);
  }
}

function routeReviewFailure(wordId, entry, reason = 'REVIEW_WRONG') {
  const origin = entry.originDate || todayKey();
  entry.retryCount = Number(entry.retryCount || 0) + 1;
  entry.correctStreak = 0;
  entry.lastResult = 'wrong';
  if (entry.stage === 'D1_DUE') {
    scheduleReview(wordId, 'D3_DUE', futureDue(addDays(origin, 3)), [reason], Math.max(9, Number(entry.priority || 0)), origin);
  } else {
    scheduleReview(wordId, 'FOCUS_CARE', addDays(todayKey(), 1), [reason], Math.max(11, Number(entry.priority || 0)), origin);
  }
}

function completeSpacedReview() {
  const ds = dayState(runtime.state.currentDay);
  ds.preReviewDate = todayKey();
  ds.spacedReviewQueue = [];
  ds.spacedReviewIndex = 0;
  ds.spacedReviewMode = 'choice';
  ds.spacedTypingAttempts = 0;
  ds.spacedChoiceWrong = false;
  ds.phase = ds.spacedReturnPhase || 'root';
  logEvent('due_review_complete', { reviewed: ds.stats.reviewAttempted, postCourse: Boolean(ds.completedAt) });
  persist('due_review_complete');
  if (ds.completedAt) {
    pauseActiveTimer();
    stopSessionTimer();
    runtime.activeSessionId = null;
    renderHome();
    return;
  }
  renderSessionStep();
}

function advanceSpacedReview() {
  const ds = dayState(runtime.state.currentDay);
  ds.spacedReviewIndex += 1;
  ds.spacedReviewMode = 'choice';
  ds.spacedTypingAttempts = 0;
  ds.spacedChoiceWrong = false;
  if (ds.spacedReviewIndex >= ds.spacedReviewQueue.length) {
    completeSpacedReview();
    return;
  }
  persist('due_review_next');
  renderSessionStep();
}

function meaningOptionsForWord(word) {
  const correct = quizMeaning(word);
  const distractors = shuffle(runtime.content.units.flatMap((unit) => unit.words))
    .filter((candidate) => candidate.id !== word.id)
    .map(quizMeaning)
    .filter((meaning, index, all) => meaning && meaning !== correct && all.indexOf(meaning) === index)
    .slice(0, 3);
  while (distractors.length < 3) distractors.push('뜻을 다시 확인해야 하는 단어');
  return { correct, options: shuffle([correct, ...distractors]) };
}

function renderSpacedReview() {
  const ds = dayState(runtime.state.currentDay);
  const wordId = ds.spacedReviewQueue[ds.spacedReviewIndex];
  if (!wordId) {
    completeSpacedReview();
    return;
  }
  const entry = runtime.state.reviewSchedule[wordId];
  const word = findWordById(wordId);
  if (!entry || !word || entry.status !== 'ACTIVE') {
    advanceSpacedReview();
    return;
  }
  if (ds.spacedReviewMode === 'typing' || ['D6_DUE', 'FOCUS_CARE'].includes(entry.stage)) {
    renderSpacedTyping(word, entry);
    return;
  }
  $('stageBadge').textContent = `${stageLabel(entry.stage)} ${ds.spacedReviewIndex + 1} / ${ds.spacedReviewQueue.length}`;
  $('learningContent').innerHTML = `
    <div class="spaced-review-panel">
      <div class="review-stage-badge">${escapeHtml(stageLabel(entry.stage))}</div>
      <h2 class="word-title">${escapeHtml(word.word)}</h2>
      <p class="review-guidance">뜻을 빠르게 판단하세요. 불안정한 단어만 D+3 강화로 이어집니다.</p>
    </div>
  `;
  const { correct, options } = meaningOptionsForWord(word);
  const grid = document.createElement('div');
  grid.className = 'option-grid';
  options.forEach((text, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-button';
    button.dataset.optionIndex = String(index + 1);
    button.dataset.optionValue = text;
    button.innerHTML = `<span class="option-index">${index + 1}</span><span class="option-text">${escapeHtml(text)}</span>`;
    button.addEventListener('click', () => answerSpacedChoice(word, entry, text, correct, button));
    grid.appendChild(button);
  });
  $('answerArea').innerHTML = '';
  $('answerArea').appendChild(grid);
  runtime.questionStartedAt = performance.now();
  runtime.optionKeyHandler = (event) => {
    const digit = /^[1-4]$/.test(event.key) ? Number(event.key) : (/^Numpad[1-4]$/.test(event.code || '') ? Number(event.code.replace('Numpad', '')) : null);
    if (!digit) return;
    const target = grid.querySelector(`[data-option-index="${digit}"]:not(:disabled)`);
    if (target) { event.preventDefault(); target.click(); }
  };
  document.addEventListener('keydown', runtime.optionKeyHandler);
}

function answerSpacedChoice(word, entry, selectedText, correctText, selectedButton) {
  const ds = dayState(runtime.state.currentDay);
  const responseMs = Math.max(0, performance.now() - Number(runtime.questionStartedAt || performance.now()));
  document.querySelectorAll('.option-button').forEach((button) => { button.disabled = true; });
  ds.stats.reviewAttempted += 1;
  const isCorrect = selectedText === correctText;
  updateDirectionMastery(word.id, 'recognition', isCorrect, responseMs);
  logEvent('spaced_choice', { wordId: word.id, stage: entry.stage, direction: 'recognition', result: isCorrect ? 'correct' : 'wrong', selectedAnswer: selectedText, correctAnswer: correctText, responseTimeMs: Math.round(responseMs) });
  if (isCorrect) {
    ds.stats.reviewCorrect += 1;
    selectedButton.classList.add('correct');
    recordReviewResult(word.id, entry.stage, 'correct', 'recognition', responseMs);
    routeReviewSuccess(word.id, entry, responseMs, false);
    showFeedback('success', entry.stage === 'D6_DUE' ? '기억 안정화 완료.' : '기억 확인 성공. 다음 일정으로 이동합니다.');
    persist('spaced_choice_correct');
    runtime.revealTimers.push(setTimeout(advanceSpacedReview, 650));
    return;
  }
  ds.stats.reviewWrong += 1;
  ds.spacedChoiceWrong = true;
  selectedButton.classList.add('wrong');
  document.querySelectorAll('.option-button').forEach((button) => {
    if (button.dataset.optionValue === correctText) button.classList.add('correct');
  });
  const history = recordWrong(word, { type: 'MEANING', direction: 'recognition', selectedAnswer: selectedText, correctAnswer: correctText, responseMs, stage: entry.stage });
  const compare = document.createElement('div');
  compare.className = 'wrong-compare-card';
  compare.innerHTML = `
    <span class="wrong-compare-label">${escapeHtml(stageLabel(entry.stage))} 오답 · 누적 ${history.totalWrong}회</span>
    <div><small>내 선택</small><strong>${escapeHtml(selectedText)}</strong></div>
    <div><small>실제 정답</small><strong>${escapeHtml(correctText)}</strong></div>
    <p>두 답의 의미를 구분한 뒤 철자로 한 번 회상합니다.</p>
  `;
  $('answerArea').appendChild(compare);
  const row = document.createElement('div');
  row.className = 'continue-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.textContent = '철자로 바로 확인';
  button.addEventListener('click', () => {
    ds.spacedReviewMode = 'typing';
    ds.spacedTypingAttempts = 0;
    persist('spaced_choice_to_typing');
    renderSessionStep();
  });
  row.appendChild(button);
  $('answerArea').appendChild(row);
  showFeedback('error', '오답노트 DB에 저장했습니다.');
  persist('spaced_choice_wrong');
}

function renderSpacedTyping(word, entry) {
  const ds = dayState(runtime.state.currentDay);
  $('stageBadge').textContent = `${stageLabel(entry.stage)} ${ds.spacedReviewIndex + 1} / ${ds.spacedReviewQueue.length}`;
  $('learningContent').innerHTML = `
    <div class="typing-wrap spaced-typing">
      <div class="review-stage-badge">${escapeHtml(stageLabel(entry.stage))}</div>
      <p class="typing-prompt">${escapeHtml(quizMeaning(word))}</p>
      <p class="typing-memory-note">영어 철자를 직접 회상하세요. 같은 자리에서는 최대 두 번만 시도합니다.</p>
      <input id="spacedInput" type="text" inputmode="latin" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="복습 영어 철자 입력">
      <div class="typing-actions">
        <button id="checkSpaced" class="primary" type="button">정답 확인</button>
        <button id="showSpaced" class="ghost" type="button">정답 보기</button>
      </div>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const input = $('spacedInput');
  input.focus();
  runtime.questionStartedAt = performance.now();
  $('checkSpaced').addEventListener('click', () => checkSpacedTyping(word, entry, input.value));
  $('showSpaced').addEventListener('click', () => {
    ds.stats.reviewAttempted += 1;
    ds.stats.reviewWrong += 1;
    updateDirectionMastery(word.id, 'recall', false, null);
    recordWrong(word, { type: 'HINT_DEPENDENT', direction: 'recall', selectedAnswer: null, correctAnswer: word.word, responseMs: null, stage: entry.stage });
    logEvent('spaced_show_answer', { wordId: word.id, stage: entry.stage, direction: 'recall', result: 'show_answer' });
    finishSpacedTyping(word, entry, false, true);
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') checkSpacedTyping(word, entry, input.value); });
}

function checkSpacedTyping(word, entry, value) {
  const ds = dayState(runtime.state.currentDay);
  ds.spacedTypingAttempts += 1;
  ds.stats.reviewAttempted += 1;
  const responseMs = Math.max(0, performance.now() - Number(runtime.questionStartedAt || performance.now()));
  const correct = normalizeAnswer(value) === normalizeAnswer(word.word);
  updateDirectionMastery(word.id, 'recall', correct, responseMs);
  logEvent('spaced_typing', { wordId: word.id, stage: entry.stage, direction: 'recall', result: correct ? 'correct' : 'wrong', responseTimeMs: Math.round(responseMs), attempt: ds.spacedTypingAttempts });
  if (correct) {
    ds.stats.reviewCorrect += 1;
    finishSpacedTyping(word, entry, true, false, responseMs);
    return;
  }
  ds.stats.reviewWrong += 1;
  recordWrong(word, { type: 'SPELLING', direction: 'recall', selectedAnswer: value, correctAnswer: word.word, responseMs, stage: entry.stage });
  if (ds.spacedTypingAttempts >= 2) finishSpacedTyping(word, entry, false, false, responseMs);
  else {
    showFeedback('error', '철자가 다릅니다. 한 번 더 입력하세요.');
    $('spacedInput').select();
    persist('spaced_typing_retry');
  }
}

function finishSpacedTyping(word, entry, correct, usedShowAnswer = false, responseMs = null) {
  const ds = dayState(runtime.state.currentDay);
  const input = $('spacedInput');
  if (input) input.disabled = true;
  if ($('checkSpaced')) $('checkSpaced').disabled = true;
  if ($('showSpaced')) $('showSpaced').disabled = true;
  if (correct) {
    recordReviewResult(word.id, entry.stage, 'correct', 'recall', responseMs, { choiceWrong: ds.spacedChoiceWrong });
    routeReviewSuccess(word.id, entry, Number(responseMs || runtime.state.settings.slowResponseMs), ds.spacedChoiceWrong);
    showFeedback('success', entry.stage === 'D6_DUE' ? '기억 안정화 완료.' : '철자 회상 성공. 다음 일정으로 이동합니다.');
  } else {
    recordReviewResult(word.id, entry.stage, usedShowAnswer ? 'show_answer' : 'wrong', 'recall', responseMs, { usedShowAnswer });
    routeReviewFailure(word.id, entry, usedShowAnswer ? 'SHOW_ANSWER' : 'SPELLING_WRONG');
    showFeedback('error', `정답: ${word.word} · 다음 복습일에 다시 확인합니다.`);
  }
  const row = document.createElement('div');
  row.className = 'continue-row';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'primary';
  next.textContent = '다음 기억 확인';
  next.addEventListener('click', advanceSpacedReview);
  row.appendChild(next);
  $('answerArea').appendChild(row);
  persist('spaced_typing_finish');
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
  steps = steps
    .map((step) => maskAnswerHints(String(step).replace(/^[→\s]+/, '').trim(), word))
    .filter((step) => step && step !== '??' ? true : rawSteps.length <= 1);
  if (!steps.length) {
    const clue = String(unit.root_meaning || '').trim();
    return clue ? [maskAnswerHints(clue, word)] : ['어원 흐름을 떠올려 보세요 → ??'];
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

function buildRevealMarkup(unit, word) {
  const formula = word.etymology_formula?.[0] || `${unit.root} → ${word.word}`;
  const flow = teaserFlow(word, unit);
  const flowHtml = flow.map((step, index) => `${index ? `<span class="flow-arrow" style="--i:${index}">→</span>` : ''}<span class="flow-piece" style="--i:${index}">${escapeHtml(step)}</span>`).join(' ');
  return `
    <div class="reveal-stack reveal-study-stack">
      <div class="reveal-step focus strong-formula" data-reveal="1">
        <span class="reveal-label">어원 구성</span>
        <span class="reveal-body formula-body">${highlightFormula(formula)}</span>
      </div>
      <div class="reveal-step strong-flow" data-reveal="2">
        <span class="reveal-label">어원 흐름 추론</span>
        <div class="flow-steps">${flowHtml}</div>
        <div class="inference-hint">최종 뜻은 끝까지 숨깁니다. 마지막 의미는 <strong>??</strong> 상태로 두고, 보기에서 정답을 추론해 보세요.</div>
      </div>
    </div>
  `;
}

function showRevealLearning(unit, word, triggerButton = null) {
  const host = $('revealCanvas');
  if (!host) return;
  clearRevealTimers();
  host.classList.remove('hidden');
  host.innerHTML = buildRevealMarkup(unit, word);
  if (triggerButton) {
    triggerButton.textContent = '나타내기 다시 보기';
    triggerButton.classList.add('active');
  }
  runtime.revealTimers.push(setTimeout(() => host.querySelector('[data-reveal="1"]')?.classList.add('show'), 20));
  runtime.revealTimers.push(setTimeout(() => host.querySelector('[data-reveal="2"]')?.classList.add('show'), 220));
}

function shouldShowMiniReward(dayNo) {
  const ds = dayState(dayNo);
  const completed = totalCompletedWords(dayNo);
  if (!completed || completed % MINI_SET_SIZE !== 0) return false;
  if (completed === ds.miniRewardAt) return false;
  if (completed >= currentDayDef(dayNo).words) return false;
  ds.miniRewardAt = completed;
  return true;
}

function enterMiniReward(resumePhase = 'word') {
  const ds = dayState(runtime.state.currentDay);
  ds.resumePhase = resumePhase;
  ds.phase = 'miniReward';
  logEvent('mini_set_complete', { completedWords: totalCompletedWords(runtime.state.currentDay), miniSetSize: MINI_SET_SIZE });
  persist('mini_set_complete');
}

function continueAfterMiniReward() {
  const ds = dayState(runtime.state.currentDay);
  clearFlowTimer();
  ds.phase = ds.resumePhase || 'word';
  persist('mini_set_continue');
  renderSessionStep();
}

function renderMiniSetReward() {
  const dayNo = runtime.state.currentDay;
  const completed = totalCompletedWords(dayNo);
  const remaining = Math.max(0, currentDayDef(dayNo).words - completed);
  $('stageBadge').textContent = '짧은 목표 완료';
  $('learningContent').innerHTML = `
    <div class="mini-reward-panel">
      <div class="mini-reward-mark">✓</div>
      <h2>${MINI_SET_SIZE}개 학습 완료</h2>
      <p>DAY 전체 ${completed}개 완료 · ${remaining}개 남음</p>
      <strong>흐름을 끊지 않고 다음 ${MINI_SET_SIZE}개로 이어갑니다.</strong>
      <div class="auto-next-bar" aria-hidden="true"><span></span></div>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost auto-next-skip';
  button.textContent = '바로 계속';
  button.addEventListener('click', continueAfterMiniReward);
  $('answerArea').appendChild(button);
  runtime.flowTimer = setTimeout(continueAfterMiniReward, 1050);
}


function renderWordQuestion(unit, word) {
  const mastered = mastery(word.id).score >= 3 && runtime.state.settings.shortenMastered;
  $('stageBadge').textContent = mastered ? '보기 먼저 · 빠른 확인' : '4지선다 먼저 풀기';
  $('learningContent').innerHTML = `
    <div class="word-panel question-first-panel">
      <h2 class="word-title">${escapeHtml(word.word)}</h2>
      <span class="word-source">${escapeHtml(word.importance || '')} 원문 p.${word.source_page}</span>
      <div class="question-first-tip">
        <strong>먼저 4지선다 보기를 보고 정답을 선택하세요.</strong>
        <span>정답이면 바로 다음으로 넘어가고, <b>오답이면 자동으로 어원 + 단어 구조 해설</b>이 나타납니다.</span>
      </div>
      <div id="revealCanvas" class="reveal-canvas hidden" aria-live="polite"></div>
    </div>
  `;
  renderOptions(unit, word);
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
    button.addEventListener('click', () => answerChoice(word, text === correct, button, correct, unit));
    grid.appendChild(button);
  });
  const tip = document.createElement('p');
  tip.className = 'question-first-help';
  tip.innerHTML = '아는 단어는 보기만 보고 바로 맞히고, <strong>틀린 단어만</strong> 해설을 보며 각인합니다.';
  const help = document.createElement('p');
  help.className = 'option-help';
  help.innerHTML = '키보드 <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> <span class="kbd">4</span> 또는 마우스/터치로 바로 선택할 수 있습니다.';
  $('answerArea').innerHTML = '';
  $('answerArea').appendChild(grid);
  $('answerArea').appendChild(tip);
  $('answerArea').appendChild(help);
  runtime.questionStartedAt = performance.now();

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

function answerChoice(word, correct, selectedButton, correctText, unit = null) {
  const { ds } = currentSessionContext();
  if (ds.answers[word.id]) return;
  const responseMs = Math.max(0, performance.now() - Number(runtime.questionStartedAt || performance.now()));
  const selectedText = selectedButton.dataset.optionValue || selectedButton.textContent.trim();
  ds.stats.attempted += 1;
  const m = mastery(word.id);
  m.lastSeen = nowIso();
  document.querySelectorAll('.option-button').forEach((button) => { button.disabled = true; });
  updateDirectionMastery(word.id, 'recognition', correct, responseMs);
  logEvent('regular_choice', {
    wordId: word.id,
    direction: 'recognition',
    stage: 'D0',
    result: correct ? 'correct' : 'wrong',
    selectedAnswer: selectedText,
    correctAnswer: correctText,
    responseTimeMs: Math.round(responseMs),
  });

  if (correct) {
    ds.stats.correct += 1;
    ds.answers[word.id] = 'correct';
    m.correct += 1;
    m.score = clamp(m.score + 1, 0, 5);
    selectedButton.classList.add('correct');
    showFeedback('success', '정답입니다. 다음 단어로 이동합니다.');
    persist('regular_correct');
    runtime.revealTimers.push(setTimeout(advanceWord, 430));
    return;
  }

  ds.stats.wrong += 1;
  ds.answers[word.id] = 'wrong';
  m.wrong += 1;
  m.score = clamp(m.score - 1, 0, 5);
  selectedButton.classList.add('wrong');
  document.querySelectorAll('.option-button').forEach((button) => {
    if (button.dataset.optionValue === correctText) button.classList.add('correct');
  });
  const history = recordWrong(word, {
    type: 'MEANING',
    direction: 'recognition',
    selectedAnswer: selectedText,
    correctAnswer: correctText,
    responseMs,
    stage: 'D0',
  });
  scheduleInitialD1(word);
  addSpellingPending(word.id, 1);
  ds.reviewQueue = [String(word.id)];
  ds.reviewIndex = 0;
  ds.reviewReturn = 'word';
  ds.typingAttempts = 0;
  ds.reviewResolved = false;
  ds.phase = 'review';

  showFeedback('error', '오늘 오답으로 저장했습니다. 아래에서 어원 + 단어 구조 해설을 확인한 뒤 철자로 각인합니다.');
  const compare = document.createElement('div');
  compare.className = 'wrong-compare-card';
  compare.innerHTML = `
    <span class="wrong-compare-label">방금 틀린 항목 · 누적 ${history.totalWrong}회</span>
    <div><small>내 선택</small><strong>${escapeHtml(selectedText)}</strong></div>
    <div><small>실제 정답</small><strong>${escapeHtml(correctText)}</strong></div>
    <p>정답을 틀렸으므로 지금 바로 어원 + 단어 구조 해설을 보여줍니다.</p>
  `;
  $('answerArea').appendChild(compare);
  const revealHost = $('revealCanvas');
  if (revealHost && unit) {
    revealHost.classList.remove('hidden');
    revealHost.innerHTML = `
      <div class="wrong-reveal-intro">오답 해설 · 어원 + 단어 구조</div>
      ${buildRevealMarkup(unit, word)}
    `;
    clearRevealTimers();
    runtime.revealTimers.push(setTimeout(() => revealHost.querySelector('[data-reveal="1"]')?.classList.add('show'), 30));
    runtime.revealTimers.push(setTimeout(() => revealHost.querySelector('[data-reveal="2"]')?.classList.add('show'), 260));
  }
  const row = document.createElement('div');
  row.className = 'continue-row';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'primary';
  next.textContent = '해설 확인 후 철자로 각인';
  next.addEventListener('click', () => {
    persist('d0_to_spelling');
    renderSessionStep();
  });
  row.appendChild(next);
  $('answerArea').appendChild(row);
  persist('regular_wrong');
}

function showFeedback(type, text) {
  $('feedback').className = `feedback ${type}`;
  $('feedback').textContent = text;
}

function advanceWord() {
  const ds = dayState(runtime.state.currentDay);
  ds.wordIndex += 1;
  if (shouldShowMiniReward(runtime.state.currentDay)) {
    enterMiniReward('word');
    renderSessionStep();
    return;
  }
  persist('advance_word');
  renderSessionStep();
}

function beginReviewOrCompleteBlock() {
  const ds = dayState(runtime.state.currentDay);
  const unresolved = Array.isArray(ds.reviewQueue) && ds.reviewIndex < ds.reviewQueue.length;
  if (unresolved) {
    ds.phase = 'review';
    ds.reviewReturn = 'block';
  } else {
    completeCurrentBlock();
  }
  persist('block_review_check');
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
  runtime.questionStartedAt = performance.now();
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
  const responseMs = Math.max(0, performance.now() - Number(runtime.questionStartedAt || performance.now()));
  const answer = normalizeAnswer(word.word);
  const typed = normalizeAnswer(value);
  const correct = typed === answer;
  updateDirectionMastery(word.id, 'recall', correct, responseMs);
  logEvent('d0_spelling', { wordId: word.id, stage: 'D0', direction: 'recall', result: correct ? 'correct' : 'wrong', responseTimeMs: Math.round(responseMs), attempt: ds.typingAttempts });
  if (correct) {
    const m = mastery(word.id);
    m.score = clamp(m.score + 1, 0, 5);
    resolveSpellingPending(word.id);
    recordReviewResult(word.id, 'D0', 'correct', 'recall', responseMs);
    ds.reviewResolved = true;
    $('spellingInput').disabled = true;
    $('checkSpelling').disabled = true;
    $('showSpelling').disabled = true;
    showFeedback('success', '철자 회상 성공. 내일 D+1에서 다시 짧게 확인합니다.');
    persist('d0_spelling_correct');
    runtime.revealTimers.push(setTimeout(nextReviewWord, 500));
    return;
  }
  recordWrong(word, { type: 'SPELLING', direction: 'recall', selectedAnswer: value, correctAnswer: word.word, responseMs, stage: 'D0' });
  if (ds.typingAttempts >= 2) {
    ds.reviewResolved = true;
    spellingEntry(word.id).pending = 0;
    $('spellingInput').disabled = true;
    $('checkSpelling').disabled = true;
    $('showSpelling').disabled = true;
    showFeedback('error', `정답은 ${word.word}입니다. 같은 자리에서 더 반복하지 않고 내일 다시 확인합니다.`);
    renderReviewContinue();
  } else {
    showFeedback('error', '철자가 다릅니다. 한 번 더 입력하세요.');
    $('spellingInput').select();
  }
  persist('d0_spelling_wrong');
}

function revealSpelling(word) {
  const ds = dayState(runtime.state.currentDay);
  if (ds.reviewResolved) return;
  ds.reviewResolved = true;
  spellingEntry(word.id).pending = 0;
  $('spellingInput').disabled = true;
  $('checkSpelling').disabled = true;
  $('showSpelling').disabled = true;
  recordReviewResult(word.id, 'D0', 'show_answer', 'recall', null, { usedShowAnswer: true });
  logEvent('d0_show_answer', { wordId: word.id, stage: 'D0', direction: 'recall', result: 'show_answer' });
  showFeedback('error', `정답: ${word.word} · 내일 D+1에서 다시 확인합니다.`);
  renderReviewContinue();
  persist('d0_show_answer');
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
  if (ds.reviewIndex < ds.reviewQueue.length) {
    persist('d0_review_next');
    renderSessionStep();
    return;
  }
  const returnTarget = ds.reviewReturn;
  ds.reviewQueue = [];
  ds.reviewIndex = 0;
  ds.reviewReturn = 'word';
  if (returnTarget === 'block') {
    completeCurrentBlock();
    persist('d0_review_block_complete');
    renderSessionStep();
    return;
  }
  ds.phase = 'word';
  ds.wordIndex += 1;
  if (shouldShowMiniReward(runtime.state.currentDay)) {
    enterMiniReward('word');
    renderSessionStep();
    return;
  }
  persist('d0_review_return_word');
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

function continueContinuousDay() {
  const ds = dayState(runtime.state.currentDay);
  const completed = ds.completedBlocks.length;
  clearFlowTimer();
  if (completed >= 4) {
    openMailGate(runtime.state.currentDay);
    return;
  }
  ds.block = completed;
  ds.phase = 'root';
  ds.unitIndex = 0;
  ds.wordIndex = 0;
  persist();
  renderSessionStep();
}

function renderBlockReward() {
  const ds = dayState(runtime.state.currentDay);
  const completed = ds.completedBlocks.length;
  const finalSegment = completed >= 4;
  $('stageBadge').textContent = finalSegment ? 'DAY 학습 내용 완료' : '연속 학습 중';
  $('learningContent').innerHTML = `
    <div class="block-reward continuous-reward">
      <div class="reward-mark">✓</div>
      <h2>${finalSegment ? '오늘의 4개 학습구간 완료' : `학습구간 ${completed} 완료`}</h2>
      <p>정답 ${ds.stats.correct}개 · 오답 ${ds.stats.wrong}개 · 철자 회상 ${ds.stats.typed}회</p>
      <div class="auto-next-notice">
        <strong>${finalSegment ? '관리자 완료 보고 화면으로 자동 이동합니다.' : `다음 ${completed + 1}구간을 자동으로 이어갑니다.`}</strong>
        <span>별도로 홈으로 나가거나 다시 들어올 필요가 없습니다.</span>
      </div>
      <div class="auto-next-bar" aria-hidden="true"><span></span></div>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost auto-next-skip';
  button.textContent = finalSegment ? '관리자 보고 바로 열기' : '다음 구간 바로 계속';
  button.addEventListener('click', continueContinuousDay);
  $('answerArea').appendChild(button);
  runtime.flowTimer = setTimeout(continueContinuousDay, 1400);
}

function prepareCompletion(dayNo) {
  const ds = dayState(dayNo);
  if (ds.completedBlocks.length < 4) throw new Error('오늘의 4개 학습구간을 모두 완료해야 관리자 보고를 보낼 수 있습니다.');
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
    ['신규 단어', `${summary.words}개`],
    ['오늘 오답', `${summary.wrong}개`],
    ['D+1 예약', `${summary.d1_due}개`],
    ['D+3 강화', `${summary.d3_due}개`],
    ['D+6 확인', `${summary.d6_due}개`],
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
    const session = runtime.state.sessions.find((item) => item.sessionId === runtime.activeSessionId);
    if (session) session.endedAt = nowIso();
    logEvent('day_complete', { day: dayNo, forced: Boolean(forced), activeSeconds: ds.elapsedSeconds });
    runtime.activeSessionId = null;
  }
  persist('day_complete');
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
  const activeReviews = activeReviewEntries();
  const stageCounts = activeReviews.reduce((acc, entry) => {
    acc[entry.stage] = (acc[entry.stage] || 0) + 1;
    return acc;
  }, {});
  return {
    reportId,
    appName: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    revision: runtime.state.revision,
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
      review_attempted: ds.stats.reviewAttempted,
      review_correct: ds.stats.reviewCorrect,
      review_wrong: ds.stats.reviewWrong,
      accuracy: ds.stats.attempted ? Math.round((ds.stats.correct / ds.stats.attempted) * 100) : null,
      wrong_words: wrongWords,
      permanent_wrong_count: Object.keys(runtime.state.wrongHistory || {}).length,
      active_review_count: activeReviews.length,
      d1_due: stageCounts.D1_DUE || 0,
      d3_due: stageCounts.D3_DUE || 0,
      d6_due: stageCounts.D6_DUE || 0,
      focus_care: stageCounts.FOCUS_CARE || 0,
      pending_spelling: pendingSpellingIds().length,
      event_count: runtime.state.eventLog.length,
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
    ['활성 복습', `${report.summary.active_review_count}개`],
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
  const activeReviews = activeReviewEntries();
  const wrongCount = Object.keys(runtime.state.wrongHistory || {}).length;
  const stageCounts = activeReviews.reduce((acc, entry) => {
    acc[entry.stage] = (acc[entry.stage] || 0) + 1;
    return acc;
  }, {});
  $('spellingBacklogSummary').innerHTML = wrongCount
    ? `<strong>영구 오답노트 ${wrongCount}개</strong><span>활성 복습 ${activeReviews.length}개 · 안정화 기록도 삭제하지 않습니다.</span>`
    : '<strong>영구 오답노트 없음</strong><span>아직 저장된 오답 이력이 없습니다.</span>';
  $('reviewSystemSummary').innerHTML = [
    ['D+1', stageCounts.D1_DUE || 0],
    ['D+3', stageCounts.D3_DUE || 0],
    ['D+6', stageCounts.D6_DUE || 0],
    ['집중 케어', stageCounts.FOCUS_CARE || 0],
  ].map(([label, value]) => `<div class="admin-system-metric"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('');
  const totalActiveSeconds = runtime.schedule.days.reduce((sum, d) => sum + Number(dayState(d.new_day).elapsedSeconds || 0) + Number(dayState(d.new_day).postCourseSeconds || 0), 0);
  $('storageSystemSummary').innerHTML = `
    <strong>저장 revision ${runtime.state.revision}</strong>
    <span>이벤트 ${runtime.state.eventLog.length}건 · 기기 ${escapeHtml(runtime.state.deviceId)} · 실제 활성시간 ${Math.round(totalActiveSeconds / 60)}분</span>
  `;
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
    ...runtime.state.settings,
    start: $('startTime').value || '19:30',
    end: $('endTime').value || '20:30',
    email,
    autoMail: true,
    shortenMastered: $('shortenMastered').checked,
    blockMinutes: Number($('blockMinutes').value || 15),
  };
  logEvent('admin_settings_save', { selectedDay, start: runtime.state.settings.start, end: runtime.state.settings.end });
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

function runSelfCheck() {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  add('18DAY 일정', runtime.schedule?.days?.length === 18, `${runtime.schedule?.days?.length || 0}DAY`);
  add('ROOT 데이터', runtime.content?.units?.length === 360, `${runtime.content?.units?.length || 0}개`);
  const wordCount = runtime.content?.units?.reduce((sum, unit) => sum + unit.words.length, 0) || 0;
  add('표제어 데이터', wordCount === 1410, `${wordCount}개`);
  add('이벤트 로그', Array.isArray(runtime.state.eventLog), `${runtime.state.eventLog?.length || 0}건`);
  add('오답 DB', runtime.state.wrongHistory && typeof runtime.state.wrongHistory === 'object', `${Object.keys(runtime.state.wrongHistory || {}).length}개`);
  add('복습 스케줄', runtime.state.reviewSchedule && typeof runtime.state.reviewSchedule === 'object', `${activeReviewEntries().length}개 활성`);
  add('저장 revision', Number.isInteger(runtime.state.revision) && runtime.state.revision >= 0, String(runtime.state.revision));
  let storageOk = false;
  try {
    const key = '__18day_root_self_check__';
    localStorage.setItem(key, 'ok');
    storageOk = localStorage.getItem(key) === 'ok';
    localStorage.removeItem(key);
  } catch (_error) { storageOk = false; }
  add('로컬 저장', storageOk, storageOk ? '정상' : '실패');
  const failed = checks.filter((item) => !item.ok);
  logEvent('self_check', { result: failed.length ? 'fail' : 'pass', failed: failed.map((item) => item.name) });
  persist('self_check');
  window.alert(`${failed.length ? '점검 필요' : '자가점검 통과'}\n\n${checks.map((item) => `${item.ok ? '✓' : '✕'} ${item.name}: ${item.detail}`).join('\n')}`);
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
  $('selfCheck').addEventListener('click', runSelfCheck);
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
      if (!ds.completedAt && !ds.startedAt) ds.startedAt = nowIso();
      if (ds.completedAt && ds.phase === 'spacedReview' && !ds.postCourseStartedAt) ds.postCourseStartedAt = nowIso();
      persist('visibility_resume');
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
