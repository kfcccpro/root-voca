
'use strict';

const APP_KEY = '18dayRootStateV7';
const BACKUP_KEY = '18dayRootStateV7Backup';
const RECOVERY_KEY = '18dayRootStateV7Recovery';
const LEGACY_V6_KEY = '18dayRootStateV5';
const LEGACY_24_KEY = 'vocaRoot24StateV4';
const LEGACY_V3_KEY = 'vocaRoot18StateV3';
const LEGACY_V2_KEY = 'vocaRoot18StateV2';
const LEGACY_KEY = 'voca18State';
const SCHEMA_VERSION = 7;
const DATA_VERSION = '18day-root-integrated-360x1410-20260727-v7.15';
const MINI_SET_SIZE = 6;
const PRE_REVIEW_LIMIT = 8;
const APP_NAME = 'root_18day';
const ADMIN_REPORT_EMAIL = 'sk01197375068@gmail.com';
const WRONG_PRIMARY_HOLD_MS = 3500;
const WRONG_REINFORCE_HOLD_MS = 5000;
const WRONG_REVIEW_HOLD_MS = 5000;
const WRONG_COGNITION_CHAR_RISE_MS = 520;
const WRONG_COGNITION_FINAL_HOLD_MS = 2200;
const EMAILJS_SERVICE_ID = 'service_v23hns6';
const EMAILJS_TEMPLATE_ID = 'template_v2zb8ni';
const EMAILJS_PUBLIC_KEY = 'JJdWMghPhZrilD_ZQ';
const HUB_APP_ID = 'root_18day';
let emailJSReady = false;
let hubProgressTimer = null;
let hubCompletionSentFor = new Set();

function initEmailJS() {
  if (!globalThis.emailjs) return false;
  try {
    globalThis.emailjs.init(EMAILJS_PUBLIC_KEY);
    emailJSReady = true;
    return true;
  } catch (_error) {
    emailJSReady = false;
    return false;
  }
}

function hubEnabled() {
  try { return globalThis.parent && globalThis.parent !== globalThis; } catch (_error) { return false; }
}

function hubDetail(dayNo = runtime.state?.currentDay || 0) {
  try {
    const ds = runtime.state ? dayState(Number(dayNo || runtime.state.currentDay || 0)) : null;
    return {
      day: Number(dayNo || 0),
      completedDays: Array.isArray(runtime.state?.completedDays) ? runtime.state.completedDays.length : 0,
      totalDays: totalDays(),
      activeReview: runtime.state ? activeReviewEntries().length : 0,
      permanentWrong: runtime.state ? Object.keys(runtime.state.wrongHistory || {}).length : 0,
      completedAt: ds?.completedAt || null,
      mailConfirmedAt: ds?.mailConfirmedAt || null,
    };
  } catch (_error) {
    return { day: Number(dayNo || 0), totalDays: 18 };
  }
}

function sendHub(type, detail = {}) {
  if (!hubEnabled()) return;
  try {
    globalThis.parent.postMessage({
      channel: 'course-hub',
      type,
      appId: HUB_APP_ID,
      detail,
      at: nowIso(),
    }, '*');
  } catch (_error) { /* parent messaging is optional */ }
}

function scheduleHubProgress() {
  if (!hubEnabled()) return;
  clearTimeout(hubProgressTimer);
  hubProgressTimer = setTimeout(() => sendHub('progress', hubDetail()), 180);
}

function applyHubDayParameter() {
  try {
    const params = new URLSearchParams(globalThis.location.search);
    const requested = Number(params.get('day'));
    if (Number.isInteger(requested) && requested >= 1 && requested <= totalDays()) {
      runtime.state.currentDay = requested;
    }
  } catch (_error) { /* ignore malformed query */ }
}

function notifyHubComplete(dayNo) {
  const key = String(dayNo);
  if (hubCompletionSentFor.has(key)) return;
  hubCompletionSentFor.add(key);
  setTimeout(() => sendHub('complete', hubDetail(dayNo)), 850);
}


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
      email: ADMIN_REPORT_EMAIL,
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
      pendingWrong: null,
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
      mailFailCount: 0,
      offlineCompleted: false,
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
    pendingWrong: null,
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
    mailFailCount: 0,
    offlineCompleted: false,
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
  out.phase = ['root', 'word', 'wrongExplanation', 'review', 'spacedReview', 'miniReward', 'blockReward'].includes(out.phase) ? out.phase : 'root';
  out.unitIndex = Math.max(0, Number(out.unitIndex || 0));
  out.wordIndex = Math.max(0, Number(out.wordIndex || 0));
  out.reviewQueue = Array.isArray(out.reviewQueue) ? [...new Set(out.reviewQueue.map(String))] : [];
  out.reviewIndex = Math.max(0, Number(out.reviewIndex || 0));
  out.reviewReturn = ['word', 'block'].includes(out.reviewReturn) ? out.reviewReturn : 'word';
  out.typingAttempts = Math.max(0, Number(out.typingAttempts || 0));
  out.reviewResolved = Boolean(out.reviewResolved);
  out.pendingWrong = out.pendingWrong && typeof out.pendingWrong === 'object' ? out.pendingWrong : null;
  out.spacedReviewQueue = Array.isArray(out.spacedReviewQueue) ? [...new Set(out.spacedReviewQueue.map(String))] : [];
  out.spacedReviewIndex = Math.max(0, Number(out.spacedReviewIndex || 0));
  out.spacedReviewMode = ['choice', 'typing'].includes(out.spacedReviewMode) ? out.spacedReviewMode : 'choice';
  out.spacedTypingAttempts = Math.max(0, Number(out.spacedTypingAttempts || 0));
  out.spacedChoiceWrong = Boolean(out.spacedChoiceWrong);
  out.spacedReturnPhase = ['root', 'word'].includes(out.spacedReturnPhase) ? out.spacedReturnPhase : 'root';
  out.preReviewDate = typeof out.preReviewDate === 'string' ? out.preReviewDate : null;
  out.miniRewardAt = Math.max(0, Number(out.miniRewardAt || 0));
  out.resumePhase = ['root', 'word'].includes(out.resumePhase) ? out.resumePhase : 'word';
  if (['miniReward', 'blockReward'].includes(out.phase)) {
    out.phase = 'word';
    out.reviewQueue = [];
    out.reviewIndex = 0;
    out.reviewResolved = false;
  }
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
  out.settings.email = ADMIN_REPORT_EMAIL;
  out.settings.autoMail = true;
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

function isDirectV7Compatible(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const version = String(raw.dataVersion || '');
  return Number(raw.schemaVersion) === SCHEMA_VERSION
    && raw.days && typeof raw.days === 'object'
    && (!version || version.startsWith('18day-root-integrated-360x1410-'));
}

function progressMetrics(state) {
  const completed = new Set((Array.isArray(state?.completedDays) ? state.completedDays : []).map(Number));
  const answeredIds = new Set();
  let farthestDay = Math.max(1, Number(state?.currentDay || 1));
  let cursorDepth = 0;
  Object.entries(state?.days || {}).forEach(([key, day]) => {
    const dayNo = Number(key);
    const answers = day?.answers && typeof day.answers === 'object' ? Object.keys(day.answers) : [];
    answers.forEach((wordId) => answeredIds.add(String(wordId)));
    const hasEvidence = answers.length || day?.completedAt || Number(day?.unitIndex || 0) || Number(day?.wordIndex || 0) || Number(day?.block || 0);
    if (hasEvidence) farthestDay = Math.max(farthestDay, dayNo || 1);
    if (day?.completedAt) completed.add(dayNo);
    if (dayNo === Number(state?.currentDay || 1)) {
      cursorDepth = Math.max(0, Number(day?.block || 0)) * 100000
        + Math.max(0, Number(day?.unitIndex || 0)) * 1000
        + Math.max(0, Number(day?.wordIndex || 0));
    }
  });
  return {
    completed: completed.size,
    answered: answeredIds.size,
    farthestDay,
    cursorDepth,
    revision: Math.max(0, Number(state?.revision || 0)),
    updatedAt: Date.parse(state?.updatedAt || '') || 0,
  };
}

function cumulativeLearningSummary(state = runtime.state) {
  const metrics = progressMetrics(state || {});
  const totalWords = runtime.content?.units?.reduce((sum, unit) => sum + (unit.words?.length || 0), 0) || 1410;
  const activeReviews = state ? Object.values(state.reviewSchedule || {}).filter((entry) => entry && entry.status === 'ACTIVE').length : 0;
  const permanentWrong = state ? Object.keys(state.wrongHistory || {}).length : 0;
  const sentDays = state ? runtime.schedule.days.filter((d) => Boolean(dayStateWith(state, d.new_day).mailConfirmedAt)).length : 0;
  return {
    answered: metrics.answered,
    totalWords,
    completedDays: metrics.completed,
    totalDays: totalDays(),
    activeReviews,
    permanentWrong,
    sentDays,
    updatedAt: state?.updatedAt || null,
    storageStatus: state?.sync?.status || 'local-safe',
  };
}

function compareProgress(a, b) {
  const am = a.metrics || progressMetrics(a.state);
  const bm = b.metrics || progressMetrics(b.state);
  for (const key of ['completed', 'answered', 'farthestDay', 'cursorDepth', 'revision', 'updatedAt']) {
    if (am[key] !== bm[key]) return bm[key] - am[key];
  }
  return 0;
}

function mergeProgressStates(primary, candidates) {
  const merged = sanitizeState(JSON.parse(JSON.stringify(primary)));
  const reportIds = new Set((merged.pendingReports || []).map((item) => String(item?.reportId || '')));
  const sentIds = new Set((merged.sentReportIds || []).map(String));
  const sessionIds = new Set((merged.sessions || []).map((item) => String(item?.sessionId || '')));

  candidates.forEach((candidate) => {
    const other = candidate.state;
    if (!other || other === primary) return;
    (other.completedDays || []).forEach((dayNo) => {
      if (!merged.completedDays.includes(Number(dayNo))) merged.completedDays.push(Number(dayNo));
    });
    Object.entries(other.days || {}).forEach(([key, otherDay]) => {
      const target = dayStateWith(merged, Number(key));
      const source = sanitizeDayState(otherDay);
      target.answers = { ...(source.answers || {}), ...(target.answers || {}) };
      target.completedBlocks = [...new Set([...(target.completedBlocks || []), ...(source.completedBlocks || [])])].sort((a,b)=>a-b);
      target.firstStartedAt = target.firstStartedAt || source.firstStartedAt;
      target.startedAt = target.startedAt || source.startedAt;
      target.completedAt = target.completedAt || source.completedAt;
      target.elapsedSeconds = Math.max(Number(target.elapsedSeconds || 0), Number(source.elapsedSeconds || 0));
      if (!target.reviewQueue?.length && source.reviewQueue?.length) target.reviewQueue = [...source.reviewQueue];
      const values = Object.values(target.answers || {});
      target.stats.attempted = values.length;
      target.stats.correct = values.filter((v) => v === 'correct').length;
      target.stats.wrong = values.filter((v) => v === 'wrong').length;
      target.stats.typed = Math.max(Number(target.stats.typed || 0), Number(source.stats?.typed || 0));
      target.stats.reviewAttempted = Math.max(Number(target.stats.reviewAttempted || 0), Number(source.stats?.reviewAttempted || 0));
      target.stats.reviewCorrect = Math.max(Number(target.stats.reviewCorrect || 0), Number(source.stats?.reviewCorrect || 0));
      target.stats.reviewWrong = Math.max(Number(target.stats.reviewWrong || 0), Number(source.stats?.reviewWrong || 0));
    });
    Object.entries(other.mastery || {}).forEach(([wordId, value]) => {
      if (!(wordId in merged.mastery)) merged.mastery[wordId] = value;
    });
    Object.entries(other.spellingNotebook || {}).forEach(([wordId, value]) => {
      const current = merged.spellingNotebook[wordId] || {};
      merged.spellingNotebook[wordId] = {
        ...value,
        ...current,
        pending: Math.max(Number(value?.pending || 0), Number(current?.pending || 0)),
        successes: Math.max(Number(value?.successes || 0), Number(current?.successes || 0)),
        lastWrongAt: [value?.lastWrongAt, current?.lastWrongAt].filter(Boolean).sort().pop() || null,
        lastResolvedAt: [value?.lastResolvedAt, current?.lastResolvedAt].filter(Boolean).sort().pop() || null,
      };
    });
    Object.entries(other.wrongHistory || {}).forEach(([wordId, value]) => {
      const current = merged.wrongHistory[wordId];
      if (!current || Number(value?.totalWrong || 0) > Number(current?.totalWrong || 0)
          || String(value?.lastWrongAt || '') > String(current?.lastWrongAt || '')) {
        merged.wrongHistory[wordId] = value;
      }
    });
    Object.entries(other.reviewSchedule || {}).forEach(([wordId, value]) => {
      const current = merged.reviewSchedule[wordId];
      if (!current || String(value?.updatedAt || '') > String(current?.updatedAt || '')) merged.reviewSchedule[wordId] = value;
    });
    (other.pendingReports || []).forEach((item) => {
      const id = String(item?.reportId || '');
      if (id && !reportIds.has(id)) { merged.pendingReports.push(item); reportIds.add(id); }
    });
    (other.sentReportIds || []).forEach((id) => sentIds.add(String(id)));
    (other.sessions || []).forEach((item) => {
      const id = String(item?.sessionId || '');
      if (id && !sessionIds.has(id)) { merged.sessions.push(item); sessionIds.add(id); }
    });
  });
  merged.completedDays = [...new Set(merged.completedDays.map(Number))].filter((n)=>n>=1&&n<=totalDays()).sort((a,b)=>a-b);
  merged.sentReportIds = [...sentIds];
  merged.sessions = merged.sessions.slice(-300);
  merged.dataVersion = DATA_VERSION;
  return sanitizeState(merged);
}

function preserveRecoveryState(raw, metrics) {
  if (!raw || typeof raw !== 'object') return;
  try {
    const existing = readStoredJson(RECOVERY_KEY);
    const existingMetrics = existing ? progressMetrics(isDirectV7Compatible(existing) ? sanitizeState(existing) : migrateScheduleState(existing)) : null;
    const incomingMetrics = metrics || progressMetrics(isDirectV7Compatible(raw) ? sanitizeState(raw) : migrateScheduleState(raw));
    if (!existing || compareProgress({ metrics: incomingMetrics }, { metrics: existingMetrics }) < 0) {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(raw));
    }
  } catch (error) {
    console.warn('복구용 진도 스냅샷을 저장하지 못했습니다.', error);
  }
}

function loadState() {
  try {
    const sources = [
      [APP_KEY, readStoredJson(APP_KEY)],
      [BACKUP_KEY, readStoredJson(BACKUP_KEY)],
      [RECOVERY_KEY, readStoredJson(RECOVERY_KEY)],
      [LEGACY_V6_KEY, readStoredJson(LEGACY_V6_KEY)],
      [LEGACY_24_KEY, readStoredJson(LEGACY_24_KEY)],
      [LEGACY_V3_KEY, readStoredJson(LEGACY_V3_KEY)],
      [LEGACY_V2_KEY, readStoredJson(LEGACY_V2_KEY)],
      [LEGACY_KEY, readStoredJson(LEGACY_KEY)],
    ].filter(([, raw]) => raw && typeof raw === 'object');

    if (!sources.length) return sanitizeState(defaultState());

    const candidates = sources.map(([key, raw]) => {
      let state;
      let mode = 'schedule-migration';
      if (isDirectV7Compatible(raw)) {
        state = sanitizeState(raw);
        mode = raw.dataVersion === DATA_VERSION ? 'current' : 'direct-v7-restore';
      } else if (key === LEGACY_KEY) {
        state = sanitizeState(migrateLegacyCompact(raw));
        mode = 'compact-migration';
      } else {
        state = sanitizeState(migrateScheduleState(raw));
      }
      return { key, raw, state, mode, metrics: progressMetrics(state) };
    }).sort(compareProgress);

    const best = candidates[0];
    preserveRecoveryState(best.raw, best.metrics);
    const restored = mergeProgressStates(best.state, candidates.slice(1));
    restored.dataVersion = DATA_VERSION;
    const sourceLabel = best.key === APP_KEY ? '현재 저장 기록' : best.key === BACKUP_KEY ? '안전백업' : best.key === RECOVERY_KEY ? '복구 스냅샷' : '이전 버전 기록';
    if (best.mode !== 'current' || best.key !== APP_KEY) {
      restored.migrationNotice = `${sourceLabel}에서 DAY ${pad(restored.currentDay)}의 정확한 중단 지점과 누적 학습기록 ${best.metrics.answered}개 단어를 복원했습니다.`;
    }
    return sanitizeState(restored);
  } catch (error) {
    console.warn('저장 기록을 불러오지 못했습니다.', error);
    return sanitizeState(defaultState());
  }
}

function persist(reason = 'state') {
  if (!runtime.state) return false;
  try {
    const previous = localStorage.getItem(APP_KEY);
    if (previous) localStorage.setItem(BACKUP_KEY, previous);
    runtime.state.revision = Math.max(0, Number(runtime.state.revision || 0)) + 1;
    runtime.state.updatedAt = nowIso();
    runtime.state.lastPersistReason = reason;
    runtime.state.sync = { ...(runtime.state.sync || {}), status: 'local-safe', lastVerifiedAt: runtime.state.updatedAt, error: '' };
    localStorage.setItem(APP_KEY, JSON.stringify(runtime.state));
    preserveRecoveryState(runtime.state, progressMetrics(runtime.state));
    scheduleHubProgress();
    return true;
  } catch (error) {
    runtime.state.sync = { ...(runtime.state.sync || {}), status: 'storage-error', lastVerifiedAt: nowIso(), error: String(error?.message || error) };
    console.error('누적 진도 저장에 실패했습니다.', error);
    scheduleHubProgress();
    return false;
  }
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
  if (isMailGateRequired(dayNo)) {
    requestAnimationFrame(() => openMailGate(dayNo));
    return;
  }
  const completedBlocks = ds.completedBlocks.length;
  const completedWords = totalCompletedWords(dayNo);
  const dueReviews = selectDueReviews(Number(runtime.state.settings.preReviewLimit || PRE_REVIEW_LIMIT));
  const courseStudyCompleted = dayNo === totalDays() && Boolean(ds.completedAt);
  const postCourseDue = courseStudyCompleted && dueReviews.length > 0;
  const courseCompleted = courseStudyCompleted && !postCourseDue;
  const hasProgress = ds.completedBlocks.length > 0 || Object.keys(ds.answers || {}).length > 0 || ds.unitIndex > 0 || ds.wordIndex > 0;
  const awaitingMail = ds.completedBlocks.length >= 4 && !ds.completedAt;

  $('todayTitle').textContent = `DAY ${pad(dayNo)}`;
  const homeDay = $('homeDayNumber'); if (homeDay) homeDay.textContent = pad(dayNo);
  const eyebrow = $('courseEyebrow'); if (eyebrow) eyebrow.textContent = APP_NAME;
  const statusChip = $('statusChip');
  if (statusChip) statusChip.textContent = postCourseDue ? `REVIEW ${dueReviews.length}` : courseCompleted ? 'COMPLETE' : hasProgress ? 'IN PROGRESS' : 'READY';
  const adminCourseTitle = $('adminCourseTitle'); if (adminCourseTitle) adminCourseTitle.textContent = `${totalDays()}DAY`;
  $('goalAmount').textContent = `ROOT ${d.roots} · ${d.words} WORDS`;
  const cumulative = cumulativeLearningSummary();
  const cumulativeEl = $('cumulativeStatus');
  if (cumulativeEl) {
    const saveOk = cumulative.storageStatus !== 'storage-error';
    cumulativeEl.innerHTML = [
      ['누적 학습', `${cumulative.answered} / ${cumulative.totalWords}`],
      ['완료 DAY', `${cumulative.completedDays} / ${cumulative.totalDays}`],
      ['활성 오답', `${cumulative.activeReviews}`],
      ['자동 저장', saveOk ? '정상' : '점검 필요'],
    ].map(([label, value], index) => `<div class="${index === 3 ? (saveOk ? 'save-ok' : 'save-error') : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }
  $('startButton').textContent = postCourseDue ? 'REVIEW' : courseCompleted ? 'COMPLETE' : awaitingMail ? 'SEND REPORT' : hasProgress ? 'CONTINUE' : 'START';
  $('startButton').disabled = courseCompleted;

  const notice = $('resumeNotice');
  notice.classList.remove('pending-mail-notice');
  if (postCourseDue) {
    notice.classList.remove('hidden'); notice.textContent = `REVIEW ${dueReviews.length}`;
  } else if (courseCompleted) {
    notice.classList.remove('hidden'); notice.textContent = '18DAY COMPLETE';
  } else if (runtime.state.migrationNotice) {
    notice.classList.remove('hidden'); notice.textContent = 'DATA UPDATED';
    runtime.state.migrationNotice = '';
    persist();
  } else if (awaitingMail) {
    notice.classList.remove('hidden'); notice.classList.add('pending-mail-notice'); notice.textContent = 'REPORT REQUIRED';
  } else if ((ds.firstStartedAt || hasProgress) && !ds.completedAt) {
    notice.classList.remove('hidden'); notice.textContent = `${completedWords} / ${d.words}`;
  } else if (dueReviews.length) {
    notice.classList.remove('hidden'); notice.textContent = `REVIEW ${dueReviews.length}`;
  } else {
    notice.classList.add('hidden');
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
  const reviewingPastWrong = ds.phase === 'spacedReview' || (ds.phase === 'wrongExplanation' && ['spacedChoice','spacedTyping'].includes(ds.pendingWrong?.context));
  if (reviewingPastWrong && ds.spacedReviewQueue.length) {
    $('sessionBlockLabel').textContent = `오늘 기억 확인 · ${ds.spacedReviewIndex + 1}/${ds.spacedReviewQueue.length}`;
    $('sessionProgressText').textContent = `${ds.spacedReviewIndex} / ${ds.spacedReviewQueue.length}`;
    $('sessionProgressBar').style.width = `${ds.spacedReviewQueue.length ? (ds.spacedReviewIndex / ds.spacedReviewQueue.length) * 100 : 0}%`;
    return;
  }
  $('sessionBlockLabel').textContent = `DAY ${pad(dayNo)}`;
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
  if (ds.phase === 'wrongExplanation') {
    renderWrongExplanation(word);
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
  const optionTexts = Array.from(document.querySelectorAll('.option-button'))
    .map((button) => button.dataset.optionValue || button.querySelector?.('.option-text')?.textContent || '')
    .filter(Boolean);
  document.querySelectorAll('.option-button').forEach((button) => { button.disabled = true; });
  ds.stats.reviewAttempted += 1;
  const isCorrect = selectedText === correctText;
  updateDirectionMastery(word.id, 'recognition', isCorrect, responseMs);
  logEvent('spaced_choice', {
    wordId: word.id,
    stage: entry.stage,
    direction: 'recognition',
    result: isCorrect ? 'correct' : 'wrong',
    selectedAnswer: selectedText,
    correctAnswer: correctText,
    responseTimeMs: Math.round(responseMs),
  });
  if (isCorrect) {
    ds.stats.reviewCorrect += 1;
    selectedButton.classList.add('correct');
    recordReviewResult(word.id, entry.stage, 'correct', 'recognition', responseMs);
    routeReviewSuccess(word.id, entry, responseMs, false);
    showFeedback('success', entry.stage === 'D6_DUE' ? '기억 안정화 완료.' : '기억 확인 성공.');
    persist('spaced_choice_correct');
    runtime.revealTimers.push(setTimeout(advanceSpacedReview, 500));
    return;
  }

  ds.stats.reviewWrong += 1;
  recordWrong(word, {
    type: 'MEANING',
    direction: 'recognition',
    selectedAnswer: selectedText,
    correctAnswer: correctText,
    responseMs,
    stage: entry.stage,
  });
  recordReviewResult(word.id, entry.stage, 'wrong', 'recognition', responseMs);
  routeReviewFailure(word.id, entry, 'REVIEW_CHOICE_WRONG');
  ds.pendingWrong = {
    context: 'spacedChoice',
    wordId: String(word.id),
    selectedAnswer: selectedText,
    correctAnswer: correctText,
    options: optionTexts,
    reviewStage: entry.stage,
    presentationStage: 'choiceHold',
    holdStartedAt: nowIso(),
  };
  ds.phase = 'wrongExplanation';
  persist('spaced_choice_wrong_hold');
  renderWrongExplanation(word);
}

function renderSpacedTyping(word, entry) {
  const ds = dayState(runtime.state.currentDay);
  $('stageBadge').textContent = `${stageLabel(entry.stage)} ${ds.spacedReviewIndex + 1} / ${ds.spacedReviewQueue.length}`;
  $('learningContent').innerHTML = `
    <div class="typing-wrap spaced-typing simple-spaced-typing">
      <div class="review-stage-badge">${escapeHtml(stageLabel(entry.stage))}</div>
      <p class="typing-prompt">${escapeHtml(quizMeaning(word))}</p>
      <input id="spacedInput" type="text" inputmode="latin" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="복습 영어 철자 입력">
      <div class="typing-actions single-action">
        <button id="checkSpaced" class="primary" type="button">확인</button>
      </div>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const input = $('spacedInput');
  input.focus();
  runtime.questionStartedAt = performance.now();
  $('checkSpaced').addEventListener('click', () => checkSpacedTyping(word, entry, input.value));
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') checkSpacedTyping(word, entry, input.value); });
}

function checkSpacedTyping(word, entry, value) {
  const ds = dayState(runtime.state.currentDay);
  if (ds.spacedTypingAttempts > 0) return;
  ds.spacedTypingAttempts = 1;
  ds.stats.reviewAttempted += 1;
  const responseMs = Math.max(0, performance.now() - Number(runtime.questionStartedAt || performance.now()));
  const correct = normalizeAnswer(value) === normalizeAnswer(word.word);
  updateDirectionMastery(word.id, 'recall', correct, responseMs);
  logEvent('spaced_typing', {
    wordId: word.id,
    stage: entry.stage,
    direction: 'recall',
    result: correct ? 'correct' : 'wrong',
    responseTimeMs: Math.round(responseMs),
    attempt: 1,
  });
  if (correct) ds.stats.reviewCorrect += 1;
  else {
    ds.stats.reviewWrong += 1;
    recordWrong(word, {
      type: 'SPELLING',
      direction: 'recall',
      selectedAnswer: value,
      correctAnswer: word.word,
      responseMs,
      stage: entry.stage,
    });
  }
  finishSpacedTyping(word, entry, correct, false, responseMs, value);
}

function finishSpacedTyping(word, entry, correct, usedShowAnswer = false, responseMs = null, selectedAnswer = '') {
  const ds = dayState(runtime.state.currentDay);
  const input = $('spacedInput');
  if (input) input.disabled = true;
  if ($('checkSpaced')) $('checkSpaced').disabled = true;
  if (correct) {
    recordReviewResult(word.id, entry.stage, 'correct', 'recall', responseMs, { choiceWrong: false });
    routeReviewSuccess(word.id, entry, Number(responseMs || runtime.state.settings.slowResponseMs), false);
    showFeedback('success', entry.stage === 'D6_DUE' ? '기억 안정화 완료.' : '기억 확인 성공.');
    persist('spaced_typing_correct_simple');
    runtime.revealTimers.push(setTimeout(advanceSpacedReview, 500));
    return;
  }
  recordReviewResult(word.id, entry.stage, usedShowAnswer ? 'show_answer' : 'wrong', 'recall', responseMs, { usedShowAnswer });
  routeReviewFailure(word.id, entry, usedShowAnswer ? 'SHOW_ANSWER' : 'SPELLING_WRONG');
  showFeedback('error', 'WRONG · 예약 복습 재오답을 확인합니다');
  persist('spaced_typing_wrong_recorded');
  startSpacedTypingWrongFlow(word, entry, selectedAnswer);
}

function renderRoot(_unit) {
  const ds = dayState(runtime.state.currentDay);
  ds.phase = 'word';
  persist('root_auto_skip');
  renderSessionStep();
}

function renderWordQuestion(unit, word) {
  $('stageBadge').textContent = 'TEST';
  $('learningContent').innerHTML = `
    <div class="word-panel question-first-panel">
      <h2 class="word-title">${escapeHtml(word.word)}</h2>
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
  $('answerArea').innerHTML = '';
  $('answerArea').appendChild(grid);
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
  const optionTexts = Array.from(document.querySelectorAll('.option-button'))
    .map((button) => button.dataset.optionValue || button.querySelector?.('.option-text')?.textContent || '')
    .filter(Boolean);
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
    showFeedback('success', 'CORRECT');
    persist('regular_correct');
    runtime.revealTimers.push(setTimeout(advanceWord, 430));
    return;
  }

  ds.stats.wrong += 1;
  ds.answers[word.id] = 'wrong';
  m.wrong += 1;
  m.score = clamp(m.score - 1, 0, 5);
  const history = recordWrong(word, {
    type: 'MEANING',
    direction: 'recognition',
    selectedAnswer: selectedText,
    correctAnswer: correctText,
    responseMs,
    stage: 'D0',
  });
  scheduleInitialD1(word);
  if (!ds.reviewQueue.includes(String(word.id))) ds.reviewQueue.push(String(word.id));
  ds.pendingWrong = {
    context: 'regularChoice',
    wordId: String(word.id),
    selectedAnswer: selectedText,
    correctAnswer: correctText,
    options: optionTexts,
    totalWrong: history.totalWrong,
    presentationStage: 'choiceHold',
    holdStartedAt: nowIso(),
  };
  ds.phase = 'wrongExplanation';
  persist('regular_wrong_choice_hold');
  renderWrongExplanation(word);
}

function appendWrongHoldMeter(container, durationMs, label) {
  const note = document.createElement('p');
  note.className = 'wrong-focus-note';
  note.textContent = label;
  const meter = document.createElement('div');
  meter.className = 'wrong-hold-meter';
  meter.innerHTML = `<i style="animation-duration:${Math.max(800, Number(durationMs || 0))}ms"></i>`;
  container.appendChild(note);
  container.appendChild(meter);
}

function pendingWrongOptions(pending, word) {
  const unique = [];
  const push = (value) => {
    const text = String(value || '').trim();
    if (text && !unique.includes(text)) unique.push(text);
  };
  (Array.isArray(pending.options) ? pending.options : []).forEach(push);
  push(pending.selectedAnswer);
  push(pending.correctAnswer || quizMeaning(word));
  if (unique.length < 4) {
    const fallback = meaningOptionsForWord(word).options;
    fallback.forEach(push);
  }
  return unique.slice(0, 4);
}

function pendingHoldRemaining(pending, durationMs = WRONG_PRIMARY_HOLD_MS) {
  const started = Date.parse(pending.holdStartedAt || '');
  if (!Number.isFinite(started)) return durationMs;
  return Math.max(0, durationMs - (Date.now() - started));
}

function renderWrongChoiceHold(activeWord, pending) {
  const context = pending.context || 'regularChoice';
  const correctText = pending.correctAnswer || quizMeaning(activeWord);
  const selectedText = pending.selectedAnswer || '';
  const options = pendingWrongOptions(pending, activeWord);
  $('stageBadge').textContent = context === 'spacedChoice' ? 'REVIEW · WRONG' : 'TEST · WRONG';
  $('learningContent').innerHTML = `
    <div class="word-panel question-first-panel">
      <h2 class="word-title">${escapeHtml(activeWord.word)}</h2>
      <p class="wrong-choice-instruction">붉게 표시된 실제 정답을 확인하세요.</p>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'option-grid';
  options.forEach((text, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = true;
    button.className = 'option-button';
    if (text === correctText) button.classList.add('answer-correct-red');
    else if (text === selectedText) button.classList.add('selected-wrong-answer');
    const tag = text === correctText
      ? '<span class="wrong-choice-tag correct">정답</span>'
      : (text === selectedText ? '<span class="wrong-choice-tag selected">선택한 오답</span>' : '');
    button.innerHTML = `<span class="option-index">${index + 1}</span><span class="option-text">${escapeHtml(text)}</span>${tag}`;
    grid.appendChild(button);
  });
  $('answerArea').appendChild(grid);
  const hold = document.createElement('div');
  const remaining = pendingHoldRemaining(pending);
  appendWrongHoldMeter(hold, Math.max(800, remaining), context === 'spacedChoice'
    ? '예약 복습에서 다시 틀렸습니다. 붉은 정답을 확인한 뒤 인지 화면으로 이동합니다.'
    : '당일 DAY에는 인지 화면 없이 붉은 정답만 확인하고 다음 문제로 이동합니다.');
  $('answerArea').appendChild(hold);
  showFeedback('error', 'WRONG · 실제 정답은 붉은 선택지입니다');
  clearFlowTimer();
  runtime.flowTimer = setTimeout(() => {
    const ds = dayState(runtime.state.currentDay);
    const live = ds.pendingWrong;
    if (!live || String(live.wordId) !== String(activeWord.id)) return;
    const spaced = (live.context || 'regularChoice') === 'spacedChoice';
    if (spaced) {
      live.presentationStage = 'cognition';
      live.cognitionStartedAt = nowIso();
      persist('spaced_wrong_cognition_start');
      renderWrongExplanation(activeWord);
      return;
    }
    ds.pendingWrong = null;
    ds.phase = 'word';
    persist('regular_wrong_choice_complete');
    advanceWord();
  }, Math.max(20, remaining));
}


function koreanCognitionTiming(text) {
  const count = Math.max(1, Array.from(String(text || '')).length);
  const stagger = Math.max(70, Math.min(150, Math.floor(4200 / count)));
  const revealMs = (count - 1) * stagger + WRONG_COGNITION_CHAR_RISE_MS;
  return { stagger, revealMs, totalMs: revealMs + WRONG_COGNITION_FINAL_HOLD_MS };
}

function koreanRiseMarkup(text, staggerMs) {
  return Array.from(String(text || '')).map((char, index) => {
    if (/\s/.test(char)) return '<span class="korean-rise-char space" aria-hidden="true">&nbsp;</span>';
    return `<span class="korean-rise-char" style="--delay:${index * staggerMs}ms">${escapeHtml(char)}</span>`;
  }).join('');
}

function renderRepeatedErrorCognition(activeWord, pending) {
  const correctText = quizMeaning(activeWord);
  const timing = koreanCognitionTiming(correctText);
  $('stageBadge').textContent = `${stageLabel(pending.reviewStage || 'D1_DUE')} · 인지 강화`;
  $('learningContent').innerHTML = `
    <div class="cognition-panel">
      <span class="cognition-kicker">예약 복습 재오답 · 한글 뜻 인지</span>
      <h2 class="cognition-word">${escapeHtml(activeWord.word)}</h2>
      <div class="korean-rise-answer" aria-label="${escapeHtml(correctText)}">${koreanRiseMarkup(correctText, timing.stagger)}</div>
      <p class="cognition-note">영단어는 고정하고, 한글 정답만 글자별로 아래에서 위로 나타납니다.</p>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const focus = document.createElement('div');
  appendWrongHoldMeter(focus, timing.totalMs, '한글 뜻이 모두 완성된 뒤 2.2초간 유지되며, 그 후 NEXT가 활성화됩니다.');
  $('answerArea').appendChild(focus);
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'primary large simple-next-button locked-next';
  next.disabled = true;
  next.textContent = '한글 뜻 인지 중';
  $('answerArea').appendChild(next);
  showFeedback('error', 'REVIEW WRONG · 한글 정답을 다시 연결합니다');
  clearFlowTimer();
  runtime.flowTimer = setTimeout(() => {
    next.disabled = false;
    next.classList.add('ready');
    next.textContent = 'NEXT';
  }, timing.totalMs);
  next.addEventListener('click', () => {
    if (next.disabled) return;
    const ds = dayState(runtime.state.currentDay);
    ds.pendingWrong = null;
    ds.phase = 'spacedReview';
    persist('scheduled_review_cognition_complete');
    advanceSpacedReview();
  });
}

function renderSpacedTypingWrongHold(activeWord, pending) {
  const remaining = pendingHoldRemaining(pending);
  $('stageBadge').textContent = `${stageLabel(pending.reviewStage || 'D6_DUE')} · SPELLING WRONG`;
  $('learningContent').innerHTML = `
    <div class="spaced-spelling-wrong-panel">
      <span class="cognition-kicker">예약 복습 철자 오답</span>
      <p class="typing-prompt">${escapeHtml(quizMeaning(activeWord))}</p>
      <strong class="correct-spelling">${escapeHtml(activeWord.word)}</strong>
      ${pending.selectedAnswer ? `<div class="typed-wrong">입력한 철자: ${escapeHtml(pending.selectedAnswer)}</div>` : ''}
    </div>
  `;
  $('answerArea').innerHTML = '';
  const hold = document.createElement('div');
  appendWrongHoldMeter(hold, Math.max(800, remaining), '정답 철자를 확인한 뒤 한글 뜻 인지 화면으로 이동합니다.');
  $('answerArea').appendChild(hold);
  showFeedback('error', 'WRONG · 정답 철자를 확인하세요');
  clearFlowTimer();
  runtime.flowTimer = setTimeout(() => {
    const ds = dayState(runtime.state.currentDay);
    const live = ds.pendingWrong;
    if (!live || String(live.wordId) !== String(activeWord.id) || live.context !== 'spacedTyping') return;
    live.presentationStage = 'cognition';
    live.cognitionStartedAt = nowIso();
    persist('spaced_typing_cognition_start');
    renderWrongExplanation(activeWord);
  }, Math.max(20, remaining));
}

function startSpacedTypingWrongFlow(word, entry, selectedAnswer = '') {
  const ds = dayState(runtime.state.currentDay);
  ds.pendingWrong = {
    context: 'spacedTyping',
    wordId: String(word.id),
    selectedAnswer: String(selectedAnswer || ''),
    correctAnswer: word.word,
    reviewStage: entry.stage,
    presentationStage: 'spellingHold',
    holdStartedAt: nowIso(),
  };
  ds.phase = 'wrongExplanation';
  persist('spaced_typing_wrong_hold');
  renderWrongExplanation(word);
}

function renderWrongExplanation(_word = null) {
  clearRevealTimers();
  clearFlowTimer();
  clearOptionKeyHandler();
  const ds = dayState(runtime.state.currentDay);
  const pending = ds.pendingWrong || {};
  const activeWord = findWordById(pending.wordId);
  if (!activeWord) {
    const returnPhase = ['spacedChoice','spacedTyping'].includes(pending.context) ? 'spacedReview' : 'word';
    ds.pendingWrong = null;
    ds.phase = returnPhase;
    persist('wrong_flow_recover_missing_word');
    renderSessionStep();
    return;
  }
  const context = pending.context || 'regularChoice';
  const stage = pending.presentationStage || 'choiceHold';
  if (['spacedChoice','spacedTyping'].includes(context) && stage === 'cognition') {
    renderRepeatedErrorCognition(activeWord, pending);
    return;
  }
  if (context === 'spacedTyping' && stage === 'spellingHold') {
    renderSpacedTypingWrongHold(activeWord, pending);
    return;
  }
  renderWrongChoiceHold(activeWord, pending);
}

function showFeedback(type, text) {
  $('feedback').className = `feedback ${type}`;
  $('feedback').textContent = text;
}

function advanceWord() {
  const ds = dayState(runtime.state.currentDay);
  ds.wordIndex += 1;
  persist('advance_word');
  renderSessionStep();
}

function blockReviewPriority(wordId) {
  const word = findWordById(wordId);
  const history = wrongEntry(wordId);
  const importance = (String(word?.importance || '').match(/★/g) || []).length;
  const spellingRisk = Array.isArray(history.wrongTypes) && history.wrongTypes.includes('SPELLING') ? 5 : 0;
  return Number(history.totalWrong || 0) * 10 + importance * 4 + spellingRisk;
}

function prepareBlockReviewQueue(ds) {
  const selected = [...new Set((Array.isArray(ds.reviewQueue) ? ds.reviewQueue : []).map(String))]
    .filter((wordId) => ds.answers[wordId] === 'wrong' && findWordById(wordId))
    .sort((a, b) => blockReviewPriority(b) - blockReviewPriority(a))
    .slice(0, 4);
  ds.reviewQueue = selected;
  ds.reviewIndex = 0;
  ds.typingAttempts = 0;
  ds.reviewResolved = false;
  selected.forEach((wordId) => addSpellingPending(wordId, 1));
  return selected;
}

function beginReviewOrCompleteBlock() {
  const ds = dayState(runtime.state.currentDay);
  const selected = prepareBlockReviewQueue(ds);
  if (selected.length) {
    ds.phase = 'review';
    ds.reviewReturn = 'block';
    logEvent('block_review_selected', { count: selected.length, wordIds: selected });
    persist('block_review_start');
    renderSessionStep();
    return;
  }
  completeCurrentBlock();
}

function renderTypingReview() {
  const ds = dayState(runtime.state.currentDay);
  const totalQueue = ds.reviewQueue.length;
  const currentIdx = ds.reviewIndex + 1;
  const wordId = ds.reviewQueue[ds.reviewIndex];
  if (!wordId) {
    completeCurrentBlock();
    return;
  }
  const word = findWordById(wordId);
  if (!word) {
    ds.reviewIndex += 1;
    persist('block_review_skip_missing');
    renderSessionStep();
    return;
  }
  $('stageBadge').textContent = `오답 재시험 ${currentIdx}/${totalQueue}`;
  $('learningContent').innerHTML = `
    <div class="typing-wrap simple-block-review">
      <p class="typing-progress">당일 오답 재시험 · ${currentIdx} / ${totalQueue}</p>
      <p class="typing-prompt">${escapeHtml(quizMeaning(word))}</p>
      <input id="spellingInput" type="text" inputmode="latin" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="영어 철자 입력">
      <div class="typing-actions single-action">
        <button id="checkSpelling" class="primary" type="button">정답 확인</button>
      </div>
    </div>
  `;
  $('answerArea').innerHTML = '';
  const input = $('spellingInput');
  input.focus();
  runtime.questionStartedAt = performance.now();
  $('checkSpelling').addEventListener('click', () => checkSpelling(word, input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') checkSpelling(word, input.value);
  });
}

function normalizeAnswer(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}

function showLockedReviewAnswer(word, onContinue, label = '정답을 다시 확인하세요') {
  $('answerArea').innerHTML = '';
  const answer = document.createElement('div');
  answer.className = 'correct-answer-only review-answer-only wrong-reinforce-card';
  answer.innerHTML = `<span>ANSWER</span><strong>${escapeHtml(word.word)}</strong>`;
  $('answerArea').appendChild(answer);
  const focus = document.createElement('div');
  appendWrongHoldMeter(focus, WRONG_REVIEW_HOLD_MS, `${label} · 5초 동안 이동할 수 없습니다.`);
  $('answerArea').appendChild(focus);
  requestAnimationFrame(() => answer.classList.add('show'));
  runtime.revealTimers.push(setTimeout(onContinue, WRONG_REVIEW_HOLD_MS));
}

function checkSpelling(word, value) {
  const ds = dayState(runtime.state.currentDay);
  if (ds.reviewResolved) return;
  ds.reviewResolved = true;
  ds.stats.typed += 1;
  ds.typingAttempts = 1;
  const responseMs = Math.max(0, performance.now() - Number(runtime.questionStartedAt || performance.now()));
  const correct = normalizeAnswer(value) === normalizeAnswer(word.word);
  updateDirectionMastery(word.id, 'recall', correct, responseMs);
  logEvent('block_review_spelling', {
    wordId: word.id,
    stage: 'BLOCK_REVIEW',
    direction: 'recall',
    result: correct ? 'correct' : 'wrong',
    responseTimeMs: Math.round(responseMs),
  });
  const input = $('spellingInput');
  const button = $('checkSpelling');
  if (input) input.disabled = true;
  if (button) button.disabled = true;
  if (correct) {
    const m = mastery(word.id);
    m.score = clamp(m.score + 1, 0, 5);
    resolveSpellingPending(word.id);
    recordReviewResult(word.id, 'BLOCK_REVIEW', 'correct', 'recall', responseMs);
    showFeedback('success', 'CORRECT');
    persist('block_review_correct');
    runtime.revealTimers.push(setTimeout(nextReviewWord, 700));
    return;
  }
  recordWrong(word, {
    type: 'SPELLING',
    direction: 'recall',
    selectedAnswer: value,
    correctAnswer: word.word,
    responseMs,
    stage: 'BLOCK_REVIEW',
  });
  spellingEntry(word.id).pending = Math.max(1, Number(spellingEntry(word.id).pending || 0));
  showFeedback('error', 'WRONG · 정답을 5초 동안 확인하세요');
  persist('block_review_wrong');
  showLockedReviewAnswer(word, nextReviewWord, '철자와 발음을 함께 확인하세요');
}

function nextReviewWord() {
  const ds = dayState(runtime.state.currentDay);
  ds.reviewIndex += 1;
  ds.typingAttempts = 0;
  ds.reviewResolved = false;
  if (ds.reviewIndex < ds.reviewQueue.length) {
    persist('block_review_next');
    renderSessionStep();
    return;
  }
  ds.reviewQueue = [];
  ds.reviewIndex = 0;
  ds.reviewReturn = 'word';
  completeCurrentBlock();
}

function findWordById(wordId) {
  for (const unit of runtime.content.units) {
    const found = unit.words.find((word) => word.id === wordId);
    if (found) return found;
  }
  return null;
}

function completeCurrentBlock() {
  const ds = dayState(runtime.state.currentDay);
  if (!ds.completedBlocks.includes(ds.block)) ds.completedBlocks.push(ds.block);
  ds.unitIndex = 0;
  ds.wordIndex = 0;
  ds.reviewQueue = [];
  ds.reviewIndex = 0;
  ds.reviewResolved = false;
  ds.pendingWrong = null;
  const completed = ds.completedBlocks.length;
  if (completed >= 4) {
    ds.phase = 'word';
    persist('day_content_complete');
    openMailGate(runtime.state.currentDay);
    return;
  }
  ds.block = completed;
  ds.phase = 'root';
  persist('continuous_day_advance');
  renderSessionStep();
}

function isMailGateRequired(dayNo = runtime.state.currentDay) {
  if (!runtime.state) return false;
  const ds = dayState(dayNo);
  return ds.completedBlocks.length >= 4 && !ds.completedAt;
}

function reinforceMailGate() {
  const modal = $('mailGateModal');
  const card = modal?.querySelector('.mail-gate-card');
  const send = $('sendCompletionMail');
  if (card) {
    card.classList.remove('mail-gate-shake');
    void card.offsetWidth;
    card.classList.add('mail-gate-shake');
  }
  const status = $('mailGateStatus');
  if (status && isMailGateRequired()) {
    status.className = 'mail-gate-status mandatory';
    status.textContent = '관리자 이메일 전송 성공이 확인되어야 DAY가 완료됩니다';
  }
  send?.focus();
}

function prepareCompletion(dayNo) {
  const ds = dayState(dayNo);
  if (ds.completedBlocks.length < 4) throw new Error('오늘의 단어 학습을 모두 완료해야 관리자 보고를 보낼 수 있습니다.');
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
  $('mailGateEmail').textContent = ADMIN_REPORT_EMAIL;
  if ($('mailGateDay')) $('mailGateDay').textContent = `DAY ${pad(dayNo)} REPORT`;
  if ($('mailGateIncomplete')) $('mailGateIncomplete').textContent = `DAY ${pad(dayNo)} · 관리자 보고 전송 대기 · 아직 미완료`;
  $('mailGateMetrics').innerHTML = [
    ['학습 단어', `${summary.words}`],
    ['응답', `${summary.attempted}`],
    ['정답', `${summary.correct}`],
    ['오답', `${summary.wrong}`],
    ['정확도', summary.accuracy == null ? '-' : `${summary.accuracy}%`],
    ['활성 복습', `${summary.active_review_count}`],
    ['D+1', `${summary.d1_due}`],
    ['D+3 / D+6', `${summary.d3_due} / ${summary.d6_due}`],
  ].map(([label, value]) => `<div class="mail-gate-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  const status = $('mailGateStatus');
  status.className = 'mail-gate-status';
  status.textContent = ds.mailGateStatus === 'error'
    ? (ds.mailGateError || 'SEND FAILED')
    : '관리자 이메일 전송 성공이 확인되어야 DAY가 완료됩니다';
  if (ds.mailGateStatus === 'error') status.classList.add('error');
  const send = $('sendCompletionMail');
  send.disabled = false;
  send.textContent = `DAY ${pad(dayNo)} 보고서 이메일 보내고 완료 확정`;
  updateMailFallbackVisibility(dayNo);
  $('mailGateModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => send.focus());
}

function closeMailGate(force = false) {
  if (!force && isMailGateRequired()) {
    reinforceMailGate();
    return false;
  }
  $('mailGateModal').classList.add('hidden');
  document.body.classList.remove('modal-open');
  return true;
}

function finalizeDayRecord(dayNo, forced = false) {
  const ds = dayState(dayNo);
  const newlyCompleted = !ds.completedAt;
  if (newlyCompleted) {
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
  if (newlyCompleted && !forced) notifyHubComplete(dayNo);
}

async function sendCompletionReport() {
  const dayNo = runtime.state.currentDay;
  const ds = dayState(dayNo);
  if (!ADMIN_REPORT_EMAIL) {
    const status = $('mailGateStatus');
    status.className = 'mail-gate-status error';
    status.textContent = 'EMAIL REQUIRED';
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
  send.textContent = 'SENDING...';
  status.className = 'mail-gate-status sending';
  status.textContent = 'SENDING';
  const result = await queueOrSendReport(report);
  if (result.ok) {
    ds.mailGateStatus = 'sent';
    ds.mailGateError = '';
    finalizeDayRecord(dayNo, false);
    status.className = 'mail-gate-status success';
    status.textContent = `전송 완료 ✓ DAY ${pad(dayNo)} 완료가 확정되었습니다`;
    send.textContent = `DAY ${pad(dayNo)} 보고서 전송 완료 ✓`;
    persist();
    setTimeout(() => {
      closeMailGate(true);
      renderCompletion(dayNo);
    }, 650);
    return;
  }
  ds.mailGateStatus = 'error';
  ds.mailGateError = `메일 전송 실패: ${result.error || '배포 환경과 메일 설정을 확인하세요.'}`;
  ds.mailFailCount = Math.max(0, Number(ds.mailFailCount || 0)) + 1;
  persist();
  send.disabled = false;
  send.textContent = `DAY ${pad(dayNo)} 보고서 이메일 다시 보내기`;
  status.className = 'mail-gate-status error';
  status.textContent = `${ds.mailGateError} DAY는 아직 미완료 상태입니다.`;
  updateMailFallbackVisibility(dayNo);
}

/* ===== V7.15 오프라인 대체 완료 경로 ===== */
function mailFallbackUnlocked(dayNo = runtime.state.currentDay) {
  const ds = dayState(dayNo);
  return Number(ds.mailFailCount || 0) >= 2 || navigator.onLine === false;
}

function updateMailFallbackVisibility(dayNo = runtime.state.currentDay) {
  const box = $('mailGateFallback');
  if (!box) return;
  if (mailFallbackUnlocked(dayNo)) box.classList.remove('hidden');
  else box.classList.add('hidden');
}

function reportPlainText(report) {
  const s = report.summary || {};
  return [
    `[root_18day · DAY ${pad(Number(report.day))} 학습 보고]`,
    `보고 시각: ${new Date().toLocaleString('ko-KR')}`,
    `기기: ${runtime.state.deviceId}`,
    '─────────────────────────',
    `학습 ROOT: ${s.roots}개`,
    `학습 단어: ${s.words}개`,
    `응답: ${s.attempted} · 정답: ${s.correct} · 오답: ${s.wrong}`,
    `정확도: ${s.accuracy == null ? '미측정' : s.accuracy + '%'}`,
    `학습시간: ${s.elapsed_minutes}분`,
    `활성 복습: ${s.active_review_count}개`,
    `D+1: ${s.d1_due} · D+3: ${s.d3_due} · D+6: ${s.d6_due}`,
    '─────────────────────────',
    `오답 단어: ${(Array.isArray(s.wrong_words) && s.wrong_words.length) ? s.wrong_words.join(', ') : '없음'}`,
  ].join('\n');
}

function openMailAppFallback(dayNo = runtime.state.currentDay) {
  const report = buildReport(dayNo, true);
  const subject = encodeURIComponent(`[root_18day] DAY ${pad(dayNo)} 학습 보고`);
  const body = encodeURIComponent(reportPlainText(report));
  window.location.href = `mailto:${ADMIN_REPORT_EMAIL}?subject=${subject}&body=${body}`;
  const status = $('mailGateStatus');
  if (status) {
    status.className = 'mail-gate-status';
    status.textContent = '메일 앱을 열었습니다. 전송을 마친 뒤 아래 DAY 완료 버튼을 누르세요.';
  }
  logEvent('mail_fallback_mailto', { day: dayNo });
  persist('mail_fallback_mailto');
}

function completeDayOffline(dayNo = runtime.state.currentDay) {
  const ds = dayState(dayNo);
  if (ds.completedBlocks.length < 4) {
    reinforceMailGate();
    return;
  }
  const report = buildReport(dayNo, true);
  report.requiresCompletion = true;
  report.offlineQueued = true;
  if (!runtime.state.pendingReports.some((item) => item.reportId === report.reportId)) {
    runtime.state.pendingReports.push(report);
  }
  if (!ds.completionRequestedAt) ds.completionRequestedAt = nowIso();
  ds.offlineCompleted = true;
  finalizeDayRecord(dayNo, true);
  ds.mailGateStatus = 'queued';
  logEvent('day_complete_offline', { day: dayNo, failCount: ds.mailFailCount || 0 });
  persist('day_complete_offline');
  closeMailGate(true);
  renderCompletion(dayNo);
  queueOrSendReport(report).catch(() => {});
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
    email: ADMIN_REPORT_EMAIL,
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


function emailJsReportPayload(report) {
  const summary = report.summary || {};
  const wrongWords = Array.isArray(summary.wrong_words) ? summary.wrong_words.join(', ') : '';
  const text = [
    `[root_18day · DAY ${pad(report.day)} 완료 보고]`,
    `보고 시각: ${new Date().toLocaleString('ko-KR')}`,
    `ROOT: ${summary.roots || 0}개`,
    `단어: ${summary.words || 0}개`,
    `정답률: ${summary.accuracy == null ? '미측정' : `${summary.accuracy}%`}`,
    `오답: ${summary.wrong || 0}개`,
    `학습시간: ${summary.elapsed_minutes || 0}분`,
    `활성 복습: ${summary.active_review_count || 0}개`,
    `D+1: ${summary.d1_due || 0}개 · D+3: ${summary.d3_due || 0}개 · D+6: ${summary.d6_due || 0}개`,
    `영구 오답노트: ${summary.permanent_wrong_count || 0}개`,
    wrongWords ? `오답 단어: ${wrongWords}` : '오답 단어: 없음',
    `보고서 ID: ${report.reportId || ''}`,
  ].join('\n');
  return {
    to_email: report.email || ADMIN_REPORT_EMAIL,
    user_name: '학습자',
    report_date: new Date().toLocaleString('ko-KR'),
    day: report.day,
    progress: Math.round(((runtime.state?.completedDays?.length || 0) / totalDays()) * 100),
    mastered: runtime.state ? Object.keys(runtime.state.mastery || {}).length : 0,
    accuracy: summary.accuracy == null ? 0 : summary.accuracy,
    history_count: runtime.state?.sessions?.length || 0,
    recent_history: text,
    day_report: text,
    report_text: text,
    message: text,
    active_wrong: summary.active_review_count || 0,
    cumulative_wrong: summary.permanent_wrong_count || 0,
  };
}

async function sendReportViaEmailJS(report) {
  if (!emailJSReady && !initEmailJS()) throw new Error('EmailJS를 불러오지 못했습니다.');
  await globalThis.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, emailJsReportPayload(report));
  return { ok: true, method: 'emailjs' };
}

async function queueOrSendReport(report) {
  if (!runtime.state.settings.autoMail || !report.email) return { ok: false, skipped: true };
  if (runtime.state.sentReportIds.includes(report.reportId)) return { ok: true, duplicate: true, method: 'duplicate' };
  let lastError = null;
  try {
    const response = await fetch('/.netlify/functions/send-day-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!response.ok) throw new Error(`메일 함수 응답 ${response.status}`);
    const responseBody = await response.json().catch(() => ({ ok: true }));
    if (responseBody && responseBody.ok === false) throw new Error(responseBody.reason || 'Netlify 메일 전송 실패');
    runtime.state.sentReportIds.push(report.reportId);
    runtime.state.pendingReports = runtime.state.pendingReports.filter((item) => item.reportId !== report.reportId);
    persist('mail_sent_netlify');
    return { ok: true, method: 'netlify-function' };
  } catch (error) {
    lastError = error;
  }
  try {
    const emailResult = await sendReportViaEmailJS(report);
    runtime.state.sentReportIds.push(report.reportId);
    runtime.state.pendingReports = runtime.state.pendingReports.filter((item) => item.reportId !== report.reportId);
    persist('mail_sent_emailjs');
    return emailResult;
  } catch (error) {
    lastError = error;
  }
  if (!runtime.state.pendingReports.some((item) => item.reportId === report.reportId)) {
    runtime.state.pendingReports.push(report);
  }
  persist('mail_queued');
  return { ok: false, error: lastError?.message || '메일 전송 경로를 사용할 수 없습니다.' };
}

async function retryPendingReports() {
  const pending = [...runtime.state.pendingReports];
  let success = 0;
  for (const report of pending) {
    const result = await queueOrSendReport(report);
    if (result.ok) {
      success += 1;
      const dayNo = Number(report.day);
      const ds = dayState(dayNo);
      if (report.requiresCompletion && !ds.completedAt) {
        finalizeDayRecord(dayNo, false);
      } else if (report.requiresCompletion && ds.completedAt && !ds.mailConfirmedAt) {
        // 오프라인으로 먼저 완료한 DAY가 나중에 실제 전송에 성공한 경우 정식 완료로 승격
        ds.mailConfirmedAt = nowIso();
        ds.mailGateStatus = 'sent';
        ds.mailGateError = '';
        ds.forced = false;
        ds.offlineCompleted = false;
        logEvent('offline_day_mail_confirmed', { day: dayNo });
      }
    }
  }
  if (success) persist('pending_reports_flushed');
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
    $('mailStatus').textContent = 'FORCED';
  } else {
    $('mailStatus').textContent = 'REPORT SENT';
  }
  $('completionConfirm').textContent = dayNo < totalDays() ? `DAY ${pad(dayNo + 1)}로 이동` : '전체 과정 확인';
  $('completionConfirm').onclick = () => {
    if (dayNo < totalDays()) runtime.state.currentDay = Math.max(runtime.state.currentDay, dayNo + 1);
    persist();
    renderHome();
  };
}

function renderAdmin() {
  // V7.15: 메일 게이트가 열려 있어도 관리자 화면 진입을 허용한다.
  // (교사가 전송 실패를 진단하고 보류 보고서를 재전송할 수 있어야 하기 때문)
  closeMailGate(true);
  pauseActiveTimer();
  stopSessionTimer();
  showScreen('adminView');
  const s = runtime.state.settings;
  $('daySelect').innerHTML = runtime.schedule.days.map((d) => `
    <option value="${d.new_day}" ${d.new_day === runtime.state.currentDay ? 'selected' : ''}>DAY ${pad(d.new_day)} · ROOT ${d.roots} · 단어 ${d.words}</option>
  `).join('');
  $('startTime').value = s.start;
  $('endTime').value = s.end;
  $('reportEmail').value = ADMIN_REPORT_EMAIL;
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
  const cumulative = cumulativeLearningSummary();
  const saveStatus = cumulative.storageStatus === 'storage-error' ? '저장 점검 필요' : '자동저장 정상';
  $('storageSystemSummary').innerHTML = `
    <strong>누적 학습 ${cumulative.answered} / ${cumulative.totalWords} · 완료 DAY ${cumulative.completedDays} / ${cumulative.totalDays}</strong>
    <span>${saveStatus} · 현재/안전백업/복구스냅샷 3중 보존 · revision ${runtime.state.revision}</span>
    <span>관리자 보고 전송 완료 DAY ${cumulative.sentDays}개 · 이벤트 ${runtime.state.eventLog.length}건 · 실제 활성시간 ${Math.round(totalActiveSeconds / 60)}분</span>
  `;
  $('adminProgressList').innerHTML = runtime.schedule.days.map((d) => {
    const done = runtime.state.completedDays.includes(d.new_day);
    const current = runtime.state.currentDay === d.new_day;
    const ds = dayState(d.new_day);
    const answered = Object.keys(ds.answers || {}).length;
    const mailState = ds.mailConfirmedAt ? '보고 전송 완료' : ds.completedBlocks.length >= 4 && !ds.completedAt ? '보고 전송 필수 대기' : '보고 미도달';
    return `<div class="admin-day ${done ? 'done' : ''} ${current ? 'current' : ''}"><strong>DAY ${pad(d.new_day)}</strong><span>${done ? '완료' : current ? '진행 중' : '대기'} · 누적 ${answered}/${d.words} · 정답 ${ds.stats.correct} · 오답 ${ds.stats.wrong} · ${mailState}</span></div>`;
  }).join('');
}

function saveAdminSettings() {
  const selectedDay = clamp(Number($('daySelect').value), 1, totalDays());
  runtime.state.currentDay = selectedDay;
  runtime.state.settings = {
    ...runtime.state.settings,
    start: $('startTime').value || '19:30',
    end: $('endTime').value || '20:30',
    email: ADMIN_REPORT_EMAIL,
    autoMail: true,
    shortenMastered: $('shortenMastered').checked,
    blockMinutes: Number($('blockMinutes').value || 15),
  };
  logEvent('admin_settings_save', { selectedDay, start: runtime.state.settings.start, end: runtime.state.settings.end });
  persist();
  renderHome();
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
  link.download = `root_18day_progress_${new Date().toISOString().slice(0, 10)}.json`;
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
  const backupOk = Boolean(readStoredJson(BACKUP_KEY) || readStoredJson(APP_KEY));
  const recoveryOk = Boolean(readStoredJson(RECOVERY_KEY) || readStoredJson(APP_KEY));
  add('안전 백업', backupOk, backupOk ? '정상' : '없음');
  add('복구 스냅샷', recoveryOk, recoveryOk ? '정상' : '없음');
  add('관리자 메일 게이트', isMailGateRequired.toString().includes('completedBlocks.length >= 4'), ADMIN_REPORT_EMAIL);
  add('오프라인 대체 완료 경로', typeof completeDayOffline === 'function' && Boolean($('offlineCompleteDay')), '2회 실패 후 활성화');
  add('보류 보고서', Array.isArray(runtime.state.pendingReports), `${runtime.state.pendingReports.length}건 대기`);
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
  $('mailAppFallback')?.addEventListener('click', () => openMailAppFallback(runtime.state.currentDay));
  $('offlineCompleteDay')?.addEventListener('click', () => completeDayOffline(runtime.state.currentDay));
  $('mailGateAdmin')?.addEventListener('click', () => { closeMailGate(true); renderAdmin(); });
  window.addEventListener('online', () => { retryPendingReports().catch(() => {}); });
  $('mailGateModal').addEventListener('click', (event) => {
    if (event.target === $('mailGateModal') && isMailGateRequired()) {
      event.preventDefault();
      reinforceMailGate();
    }
  });
  document.addEventListener('keydown', (event) => {
    const gateOpen = !$('mailGateModal').classList.contains('hidden') && isMailGateRequired();
    if (!gateOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (mailFallbackUnlocked()) { closeMailGate(true); renderAdmin(); return; }
      reinforceMailGate();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const send = $('sendCompletionMail');
      if (send && !send.disabled) send.focus();
      else $('mailGateModal').querySelector('.mail-gate-card')?.focus();
    }
  }, true);
  window.addEventListener('pageshow', () => {
    if (isMailGateRequired()) openMailGate(runtime.state.currentDay);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isMailGateRequired()) openMailGate(runtime.state.currentDay);
  });
  $('exitSession').addEventListener('click', () => { pauseActiveTimer(); renderHome(); });
  $('adminToggle').addEventListener('click', renderAdmin);
  $('closeAdmin').addEventListener('click', renderHome);
  $('saveAdmin').addEventListener('click', saveAdminSettings);
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
  window.addEventListener('pagehide', () => { pauseActiveTimer(); persist('pagehide'); });
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
    applyHubDayParameter();
    initEmailJS();
    bindEvents();
    renderHome();
    sendHub('ready', hubDetail());
    retryPendingReports().catch(() => {});
  } catch (error) {
    sendHub('error', { message: error.message || '앱을 불러오지 못했습니다.' });
    document.body.innerHTML = `<p style="padding:24px;font-family:system-ui">${escapeHtml(error.message)}</p>`;
  }
}

window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.channel !== 'course-hub-command') return;
  if (data.type === 'request-progress') sendHub('progress', hubDetail());
  if (data.type === 'go-home') renderHome();
});
window.addEventListener('load', initEmailJS);

boot();

