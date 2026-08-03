"use strict";

const APP_VERSION = "1.10.0";
const ROUND_LENGTH = 10;
const OPTION_COUNT = 4;
const HISTORY_MAX = 300;
const PROFILE_KEY = "dutch-vocab-profile";
const USERS_KEY = "dutch-vocab-users";
const SETTINGS_KEY = "dutch-vocab-settings";
const COFFEE_URL = "https://buymeacoffee.com/rockstonepebble"; // placeholder — swap for the real link

// Adaptive tuning
const ABILITY_SIGMA = 0.85;   // spread of the level mix around the ability
const START_ABILITY = 3.0;    // default = B1-ish
const PLACEMENT_SIZE = 12;
const PLACEMENT_START_IDX = 2; // B1
const ADAPT_TARGET = 0.7;      // score above this drifts harder, below drifts easier
const ADAPT_K = 0.8;
const ADAPT_MAX = 0.4;         // max ability change per round

const MODES = {
  "nl-en": "NL → EN",
  "en-nl": "EN → NL",
  "mixed": "Mixed",
  "mistakes": "Mistakes",
};

// ── State ──
let round = null; // { mode, questions, index, score, mistakes, ... }
let profile = null; // { name, study, ability } — study is "adaptive" or a level code
let regChoice = null; // choice on the registration screen: "adaptive" or a level code
let regEditing = false;

// ── Elements ──
const $ = (id) => document.getElementById(id);
const screens = {
  register: $("screen-register"),
  home: $("screen-home"),
  quiz: $("screen-quiz"),
  result: $("screen-result"),
  scores: $("screen-scores"),
  options: $("screen-options"),
};
let scoresBackTarget = "home";

function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  window.scrollTo(0, 0);
}

// ── Utilities ──
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Split a translation into comparable word segments so near-synonym
// entries (e.g. two words both translated with "cause") are never
// offered side by side as answer options.
function segments(text) {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .split(/[,;]/)
    .map((s) => s.replace(/^(to|the|a|an|de|het|zich)\s+/g, "").trim())
    .filter(Boolean);
}

function overlaps(a, b) {
  const sa = segments(a);
  const sb = new Set(segments(b));
  return sa.some((s) => sb.has(s));
}

function wordClass(entry) {
  if (/^(de|het) /.test(entry.nl)) return "noun";
  if (/^to /.test(entry.en) || /^zich /.test(entry.nl)) return "verb";
  return "other";
}

function levelVocab(level) {
  return VOCAB_BY_LEVEL[level] || [];
}
function allVocab() {
  return LEVELS.flatMap((l) => VOCAB_BY_LEVEL[l]);
}

// ── Settings + "look-alike" (cognate) filter ──
let settings = (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
})();
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function cnorm(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
}
function ceng(s) {
  return cnorm(s).replace(/ph/g, "f").replace(/c/g, "k").replace(/y/g, "i").replace(/qu/g, "kw").replace(/th/g, "t");
}
function editDist(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
// True when the Dutch word is essentially the same as EVERY English sense
// (so words with an extra/different meaning are never treated as look-alikes).
function isLookAlike(entry) {
  const w = entry.nl.replace(/^(de|het|zich)\s+/, "").trim();
  if (/\s/.test(w)) return false;
  const ws = cnorm(w), wc = ceng(w);
  const senses = entry.en.replace(/\([^)]*\)/g, "").split(/[,;]/)
    .map((s) => s.replace(/^(to|the|a|an)\s+/, "").trim()).filter(Boolean);
  if (!senses.length) return false;
  for (const s of senses) {
    const sn = cnorm(s), scn = ceng(s);
    const L = Math.min(editDist(ws, sn), editDist(wc, scn));
    const maxlen = Math.max(ws.length, sn.length);
    const ok = sn === ws || L === 0 || (L <= 1 && maxlen >= 4) || (L <= 2 && maxlen >= 6);
    if (!ok) return false;
  }
  return true;
}

let _poolCache = null;
let _lookAlikeCount = null;
function invalidatePools() { _poolCache = null; }
// The vocab pool for a level, minus look-alikes when the setting is on.
function activePool(level) {
  if (!settings.hideCognates) return VOCAB_BY_LEVEL[level];
  if (!_poolCache) {
    _poolCache = {};
    for (const l of LEVELS) _poolCache[l] = VOCAB_BY_LEVEL[l].filter((e) => !isLookAlike(e));
  }
  return _poolCache[level];
}
function lookAlikeCount() {
  if (_lookAlikeCount == null) {
    _lookAlikeCount = LEVELS.reduce((n, l) => n + VOCAB_BY_LEVEL[l].filter(isLookAlike).length, 0);
  }
  return _lookAlikeCount;
}
function activeTotal() {
  return LEVELS.reduce((n, l) => n + activePool(l).length, 0);
}

// ── Ability → level mix ──
function abilityWeights(ability) {
  return LEVELS.map((_, i) => Math.exp(-Math.pow((i + 1) - ability, 2) / (2 * ABILITY_SIGMA * ABILITY_SIGMA)));
}

function sampleLevel(ability) {
  const w = abilityWeights(ability);
  const sum = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return LEVELS[i];
  }
  return LEVELS[LEVELS.length - 1];
}

// A readable mix like [{level:"A2",pct:20},{level:"B1",pct:55},{level:"B2",pct:25}]
function abilityMix(ability) {
  const w = abilityWeights(ability);
  const sum = w.reduce((a, b) => a + b, 0);
  let mix = LEVELS.map((lv, i) => ({ level: lv, pct: w[i] / sum })).filter((m) => m.pct >= 0.06);
  const s2 = mix.reduce((a, m) => a + m.pct, 0);
  mix.forEach((m) => { m.pct = Math.round((m.pct / s2) * 100); });
  const diff = 100 - mix.reduce((a, m) => a + m.pct, 0);
  if (mix.length) mix.sort((a, b) => b.pct - a.pct)[0].pct += diff; // absorb rounding
  return mix.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
}

function nearestLevel(ability) {
  return LEVELS[clamp(Math.round(ability) - 1, 0, LEVELS.length - 1)];
}

// ── Profiles (username + study choice + ability) ──
function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (raw && raw.name) {
      const study = raw.study || raw.level; // migrate old {name,level}
      const ability = typeof raw.ability === "number" ? raw.ability : START_ABILITY;
      if (study === "adaptive" || LEVELS.includes(study)) {
        return { name: raw.name, study, ability };
      }
    }
  } catch {}
  return null;
}

function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  upsertUser(p);
}

// ── Registered users (so a returning user can be picked, not retyped) ──
function loadUsers() {
  try {
    const raw = JSON.parse(localStorage.getItem(USERS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveUsers(list) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list));
}
function upsertUser(p) {
  const list = loadUsers();
  const i = list.findIndex((u) => u.name === p.name);
  const entry = { name: p.name, study: p.study, ability: p.ability };
  if (i >= 0) list[i] = entry; else list.push(entry);
  saveUsers(list);
}
// Discover any usernames that already have saved data but aren't in the
// registry yet (e.g. from before this feature existed), so they still appear.
function syncUsers() {
  const byName = new Map(loadUsers().map((u) => [u.name, u]));
  for (let i = 0; i < localStorage.length; i++) {
    const m = /^dutch-vocab-(?:scores|mistakes)::(.+)$/.exec(localStorage.key(i));
    if (m && !byName.has(m[1])) {
      byName.set(m[1], { name: m[1], study: "adaptive", ability: START_ABILITY });
    }
  }
  saveUsers([...byName.values()]);
}
function chooseUser(name) {
  const u = loadUsers().find((x) => x.name === name);
  if (!u) return;
  const study = u.study === "adaptive" || LEVELS.includes(u.study) ? u.study : "adaptive";
  profile = { name: u.name, study, ability: typeof u.ability === "number" ? u.ability : START_ABILITY };
  saveProfile(profile);
  applyProfile();
  show("home");
}

function isAdaptive() {
  return profile.study === "adaptive";
}
function studyLabel() {
  return isAdaptive() ? "Adaptive" : profile.study;
}

// Per-user storage keys, so each username keeps its own scores/mistakes.
function scoresKey() { return "dutch-vocab-scores::" + profile.name; }
function mistakesKey() { return "dutch-vocab-mistakes::" + profile.name; }

// ── Mistakes bank (per user) ──
// Each item: { nl, en, dir, level, count, last }, keyed by nl+dir+level.
function loadMistakes() {
  try {
    const raw = JSON.parse(localStorage.getItem(mistakesKey()));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveMistakes(list) {
  localStorage.setItem(mistakesKey(), JSON.stringify(list));
}
function mistakeKey(nl, dir, level) {
  return nl + "|" + dir + "|" + level;
}
function recordMistake(q) {
  const list = loadMistakes();
  const key = mistakeKey(q.nl, q.dir, q.level);
  const existing = list.find((x) => mistakeKey(x.nl, x.dir, x.level) === key);
  const now = new Date().toISOString();
  if (existing) {
    existing.count++;
    existing.last = now;
  } else {
    list.push({ nl: q.nl, en: q.en, dir: q.dir, level: q.level, count: 1, last: now });
  }
  saveMistakes(list);
}
function masterMistake(q) {
  const key = mistakeKey(q.nl, q.dir, q.level);
  saveMistakes(loadMistakes().filter((x) => mistakeKey(x.nl, x.dir, x.level) !== key));
}
function isInBank(nl, dir, level) {
  const k = mistakeKey(nl, dir, level);
  return loadMistakes().some((x) => mistakeKey(x.nl, x.dir, x.level) === k);
}
function addToBank(info, dir, level) {
  const list = loadMistakes();
  const k = mistakeKey(info.nl, dir, level);
  if (list.some((x) => mistakeKey(x.nl, x.dir, x.level) === k)) return;
  list.push({ nl: info.nl, en: info.en, dir, level, count: 1, last: new Date().toISOString() });
  saveMistakes(list);
}
function removeFromBank(nl, dir, level) {
  const k = mistakeKey(nl, dir, level);
  saveMistakes(loadMistakes().filter((x) => mistakeKey(x.nl, x.dir, x.level) !== k));
}

// ── Round building ──
function makeQuestion(entry, dir, pool, level) {
  const promptKey = dir === "nl-en" ? "nl" : "en";
  const answerKey = dir === "nl-en" ? "en" : "nl";
  const answer = entry[answerKey];

  const cls = wordClass(entry);
  const shuffled = shuffle(pool);
  const distractors = []; // { val, other }
  for (const sameClassOnly of [true, false]) {
    for (const cand of shuffled) {
      if (distractors.length >= OPTION_COUNT - 1) break;
      if (cand.nl === entry.nl) continue;
      if (sameClassOnly && wordClass(cand) !== cls) continue;
      const val = cand[answerKey];
      if (val === answer) continue;
      if (overlaps(val, answer)) continue;
      if (distractors.some((d) => d.val === val || overlaps(d.val, val))) continue;
      distractors.push({ val, other: cand[promptKey] });
    }
  }

  const translations = { [answer]: entry[promptKey] };
  const optionInfo = { [answer]: { nl: entry.nl, en: entry.en } };
  distractors.forEach((d) => {
    translations[d.val] = d.other;
    optionInfo[d.val] = dir === "nl-en" ? { nl: d.other, en: d.val } : { nl: d.val, en: d.other };
  });

  return {
    dir,
    nl: entry.nl,
    en: entry.en,
    level,
    prompt: entry[promptKey],
    answer,
    options: shuffle([answer, ...distractors.map((d) => d.val)]),
    translations,
    optionInfo,
  };
}

function pickDir(mode) {
  return mode === "mixed" ? (Math.random() < 0.5 ? "nl-en" : "en-nl") : mode;
}

function buildRound(mode) {
  let questions;
  if (mode === "mistakes") {
    const bank = loadMistakes()
      .slice()
      .sort((a, b) => b.count - a.count || new Date(b.last) - new Date(a.last));
    questions = bank.slice(0, ROUND_LENGTH).map((m) => {
      const pool = activePool(m.level).length ? activePool(m.level) : allVocab();
      return makeQuestion({ nl: m.nl, en: m.en }, m.dir, pool, m.level);
    });
  } else if (isAdaptive()) {
    // Sample each question's level from the ability distribution.
    const used = new Set();
    questions = [];
    for (let i = 0; i < ROUND_LENGTH; i++) {
      let entry, level, tries = 0;
      do {
        level = sampleLevel(profile.ability);
        const pool = activePool(level);
        entry = pool[Math.floor(Math.random() * pool.length)];
        tries++;
      } while (used.has(entry.nl) && tries < 12);
      used.add(entry.nl);
      questions.push(makeQuestion(entry, pickDir(mode), activePool(level), level));
    }
  } else {
    const level = profile.study;
    const pool = activePool(level);
    const picked = shuffle(pool).slice(0, ROUND_LENGTH);
    questions = picked.map((entry) => makeQuestion(entry, pickDir(mode), pool, level));
  }
  return { mode, questions, index: 0, score: 0, mistakes: [] };
}

// ── Quiz flow ──
function startRound(mode) {
  if (mode === "mistakes" && loadMistakes().length === 0) return;
  round = buildRound(mode);
  show("quiz");
  renderQuestion();
}

function roundTotal() {
  return round.size || round.questions.length;
}

function renderQuestion() {
  const q = round.questions[round.index];
  const total = roundTotal();

  $("progress-fill").style.width = `${(round.index / total) * 100}%`;
  const label = round.mode === "placement" ? "Placement" : `Question`;
  $("q-number").textContent = `${label} ${round.index + 1}/${total}`;
  $("q-score").textContent = round.mode === "placement" ? "" : `✓ ${round.score}`;
  $("direction-label").textContent =
    q.dir === "nl-en" ? "What does this mean in English?" : "What is the Dutch word?";
  $("prompt-word").textContent = q.prompt;

  const box = $("options");
  box.innerHTML = "";
  q.options.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "option-row";
    const btn = document.createElement("button");
    btn.className = "option";
    btn.dataset.value = opt;
    const lbl = document.createElement("span");
    lbl.className = "opt-label";
    lbl.textContent = opt;
    btn.appendChild(lbl);
    btn.addEventListener("click", () => lockAnswer(opt, btn));
    const add = document.createElement("button");
    add.type = "button";
    add.className = "opt-add gone";
    add.dataset.value = opt;
    add.addEventListener("click", () => toggleAdd(add));
    row.append(btn, add);
    box.appendChild(row);
  });

  $("btn-dunno").classList.remove("gone");
  $("btn-reveal").classList.add("gone");
  $("add-hint").classList.add("gone");
  $("btn-next").classList.add("hidden");
}

function setAddState(btn, added) {
  btn.classList.toggle("added", added);
  btn.textContent = added ? "✓" : "＋";
  btn.setAttribute("aria-label", added ? "Remove from practice list" : "Add to practice list");
}

function toggleAdd(btn) {
  const q = round.questions[round.index];
  const info = q.optionInfo[btn.dataset.value];
  if (!info) return;
  if (isInBank(info.nl, q.dir, q.level)) {
    removeFromBank(info.nl, q.dir, q.level);
    setAddState(btn, false);
  } else {
    addToBank(info, q.dir, q.level);
    setAddState(btn, true);
    if (navigator.vibrate) navigator.vibrate(10);
  }
}

function lockAnswer(chosen, chosenBtn) {
  const q = round.questions[round.index];
  const total = roundTotal();
  const buttons = [...$("options").querySelectorAll(".option")];
  buttons.forEach((b) => (b.disabled = true));

  const correct = chosen !== null && chosen === q.answer;
  if (correct) {
    round.score++;
    if (chosenBtn) chosenBtn.classList.add("correct");
    if (navigator.vibrate) navigator.vibrate(15);
  } else {
    if (chosenBtn) chosenBtn.classList.add("wrong");
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
  }
  buttons.forEach((b) => {
    if (b.dataset.value === q.answer) b.classList.add("correct");
    else if (b !== chosenBtn) b.classList.add("dimmed");
  });

  $("q-score").textContent = round.mode === "placement" ? "" : `✓ ${round.score}`;
  $("progress-fill").style.width = `${((round.index + 1) / total) * 100}%`;
  $("btn-dunno").classList.add("gone");

  if (round.mode === "placement") {
    // Adaptive staircase: harder after a correct answer, easier after a wrong one.
    round.results.push({ levelIdx: q.levelIdx, correct });
    round.levelIdx = clamp(round.levelIdx + (correct ? 1 : -1), 0, LEVELS.length - 1);
  } else {
    if (correct) {
      if (round.mode === "mistakes") masterMistake(q);
    } else {
      round.mistakes.push({
        prompt: q.prompt,
        answer: q.answer,
        chosen: chosen === null ? "(didn't know)" : chosen,
      });
      recordMistake(q);
    }
    // Reveal the meaning + per-option add buttons.
    $("btn-reveal").classList.remove("gone");
    [...$("options").querySelectorAll(".opt-add")].forEach((ab) => {
      ab.classList.remove("gone");
      const info = q.optionInfo[ab.dataset.value];
      setAddState(ab, !!info && isInBank(info.nl, q.dir, q.level));
    });
    $("add-hint").classList.remove("gone");
  }

  const nextBtn = $("btn-next");
  nextBtn.textContent = round.index + 1 < total ? "Next" : "See result";
  nextBtn.classList.remove("hidden");
}

function showTranslations() {
  const q = round.questions[round.index];
  [...$("options").querySelectorAll(".option")].forEach((btn) => {
    btn.classList.remove("dimmed");
    if (!btn.querySelector(".opt-tr")) {
      const tr = document.createElement("span");
      tr.className = "opt-tr";
      tr.textContent = q.translations[btn.dataset.value] || "";
      btn.appendChild(tr);
    }
  });
  $("btn-reveal").classList.add("gone");
}

function nextQuestion() {
  if (round.mode === "placement") {
    if (round.index + 1 < round.size) {
      round.index++;
      round.questions.push(placementQuestion(round.levelIdx));
      renderQuestion();
    } else {
      finishPlacement();
    }
    return;
  }
  round.index++;
  if (round.index < round.questions.length) {
    renderQuestion();
  } else {
    finishRound();
  }
}

// ── Placement test ──
function placementQuestion(levelIdx) {
  const level = LEVELS[levelIdx];
  const pool = activePool(level);
  const entry = pool[Math.floor(Math.random() * pool.length)];
  const q = makeQuestion(entry, Math.random() < 0.5 ? "nl-en" : "en-nl", pool, level);
  q.levelIdx = levelIdx;
  return q;
}

function startPlacement() {
  round = {
    mode: "placement",
    size: PLACEMENT_SIZE,
    index: 0,
    score: 0,
    mistakes: [],
    levelIdx: PLACEMENT_START_IDX,
    results: [],
    questions: [],
  };
  round.questions.push(placementQuestion(round.levelIdx));
  show("quiz");
  renderQuestion();
}

function finishPlacement() {
  const idxs = round.results.map((r) => r.levelIdx);
  const tail = idxs.slice(Math.floor(idxs.length / 3)); // drop burn-in
  const meanIdx = tail.reduce((a, b) => a + b, 0) / (tail.length || 1);
  const ability = clamp(1 + meanIdx, 1, 5);
  profile = { name: profile.name, study: "adaptive", ability };
  saveProfile(profile);
  showPlacementResult(ability);
}

function showPlacementResult(ability) {
  const mix = abilityMix(ability);
  $("result-emoji").textContent = "📈";
  $("result-title").textContent = `You're mostly ${nearestLevel(ability)}`;
  $("result-score").parentElement.style.display = "none";
  $("result-total").textContent = "";
  $("result-detail").innerHTML = "Your mix: " + mix.map((m) => `${m.level} ${m.pct}%`).join(" · ");
  $("review").innerHTML = "";
  $("btn-again").style.display = "none";
  $("btn-result-scores").style.display = "none";
  $("btn-result-home").textContent = "Start studying";
  applyProfile();
  show("result");
}

// ── Round history (per user) — every completed round, in time order ──
function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(scoresKey()));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveHistory(list) {
  localStorage.setItem(scoresKey(), JSON.stringify(list));
}
function recordHistory(score, mode, level, diff) {
  const list = loadHistory();
  const prevBest = list.length ? Math.max(...list.map((s) => s.score)) : -1;
  list.push({ score, mode, level, diff, date: new Date().toISOString() });
  saveHistory(list.slice(-HISTORY_MAX));
  return list.length > 1 && score > prevBest; // a genuine improvement, not the first round
}

// The A1–C1 difficulty (1–5) a history entry represents. Falls back to the
// level code for older entries that pre-date the stored average.
function entryDiff(h) {
  if (typeof h.diff === "number") return clamp(h.diff, 1, 5);
  if (LEVELS.includes(h.level)) return LEVELS.indexOf(h.level) + 1;
  return null;
}
function diffLabel(v) {
  return LEVELS[clamp(Math.round(v) - 1, 0, LEVELS.length - 1)];
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function finishRound() {
  const { score, mode, mistakes, questions } = round;
  const total = questions.length;

  // Reset any result-screen tweaks left over from the placement result.
  $("result-score").parentElement.style.display = "";
  $("btn-result-scores").style.display = "";
  $("btn-result-home").textContent = "Home";

  // Average difficulty (A1–C1 → 1–5) of the questions in this round.
  const diffVals = questions.map((q) => LEVELS.indexOf(q.level) + 1).filter((v) => v >= 1);
  const roundDiff = diffVals.length ? diffVals.reduce((a, b) => a + b, 0) / diffVals.length : null;
  const isNewBest = mode === "mistakes" ? false : recordHistory(score, mode, studyLabel(), roundDiff);
  const pct = total ? Math.round((score / total) * 100) : 0;

  // Per-round adaptive difficulty adjustment.
  let driftNote = "";
  if (mode !== "mistakes" && isAdaptive()) {
    const before = profile.ability;
    const delta = clamp((score / total - ADAPT_TARGET) * ADAPT_K, -ADAPT_MAX, ADAPT_MAX);
    profile.ability = clamp(before + delta, 1, 5);
    saveProfile(profile);
    const d = profile.ability - before;
    driftNote = d > 0.03 ? " · difficulty ↑" : d < -0.03 ? " · difficulty ↓" : "";
  }

  const remaining = loadMistakes().length;
  let emoji, title;
  if (mode === "mistakes" && remaining === 0) {
    emoji = "🎉"; title = "All caught up!";
  } else if (score === total) {
    emoji = "🏆"; title = "Perfect round!";
  } else if (pct >= 85) {
    emoji = "🎉"; title = "Uitstekend!";
  } else if (pct >= 70) {
    emoji = "👏"; title = "Goed gedaan!";
  } else if (pct >= 50) {
    emoji = "💪"; title = "Niet slecht!";
  } else {
    emoji = "📚"; title = "Blijven oefenen!";
  }

  $("result-emoji").textContent = emoji;
  $("result-title").textContent = title;
  $("result-score").textContent = score;
  $("result-total").textContent = `/${total}`;

  const modeLabel = mode === "mistakes" ? MODES[mode] : `${studyLabel()} · ${MODES[mode]}`;
  let detail = `${pct}% · ${modeLabel}`;
  if (mode === "mistakes") {
    detail += remaining === 0
      ? ' · <span class="new-best">no mistakes left!</span>'
      : ` · ${remaining} word${remaining === 1 ? "" : "s"} still to review`;
  } else {
    if (isNewBest) detail += ' · <span class="new-best">New best score!</span>';
    detail += driftNote;
  }
  $("result-detail").innerHTML = detail;

  const review = $("review");
  review.innerHTML = "";
  if (mistakes.length) {
    const heading = document.createElement("p");
    heading.className = "review-title";
    heading.textContent = `Review (${mistakes.length})`;
    review.appendChild(heading);
    mistakes.forEach((m) => {
      const item = document.createElement("div");
      item.className = "review-item";
      const q = document.createElement("div");
      q.className = "ri-q";
      q.textContent = m.prompt;
      const a = document.createElement("div");
      const x = document.createElement("span");
      x.className = m.chosen.startsWith("(") ? "ri-note" : "ri-x";
      x.textContent = m.chosen;
      const ok = document.createElement("span");
      ok.className = "ri-a";
      ok.textContent = m.answer;
      a.append(x, ok);
      item.append(q, a);
      review.appendChild(item);
    });
  }

  const again = $("btn-again");
  if (mode === "mistakes" && remaining === 0) {
    again.style.display = "none";
  } else {
    again.style.display = "";
    again.textContent = mode === "mistakes" ? "Practise again" : "Play again";
  }

  show("result");
  applyProfile();
}

// Build an inline SVG line chart of question difficulty over time: the A1–C1
// scale (1–5) on the y axis, real timestamps on the x axis. Each point is the
// average difficulty of a round's questions. No external libraries — offline.
function buildChartSVG(pts) {
  const W = 320, H = 200;
  const padL = 30, padR = 10, padT = 12, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const n = pts.length;
  // Even steps by round order: oldest on the left, newest on the right, so the
  // line always marches rightward as more rounds are played.
  const x = (i) => (n > 1 ? padL + (i / (n - 1)) * plotW : padL + plotW / 2);
  const y = (v) => padT + (1 - (v - 1) / 4) * plotH; // v in [1..5]

  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Question difficulty over time">`;
  // gridlines + y labels A1..C1 (values 1..5)
  LEVELS.forEach((lv, i) => {
    const yy = y(i + 1).toFixed(1);
    svg += `<line class="chart-grid" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/>`;
    svg += `<text class="chart-axis-label" x="${padL - 5}" y="${(y(i + 1) + 3).toFixed(1)}" text-anchor="end">${lv}</text>`;
  });
  if (n > 1) {
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const area = `${padL},${y(1).toFixed(1)} ` + line + ` ${x(n - 1).toFixed(1)},${y(1).toFixed(1)}`;
    svg += `<polygon class="chart-area" points="${area}"/>`;
    svg += `<polyline class="chart-line" points="${line}"/>`;
  }
  pts.forEach((p, i) => {
    svg += `<circle class="chart-dot" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${n > 40 ? 1.6 : 3}"/>`;
  });
  const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const yLbl = H - 6;
  if (n === 1) {
    svg += `<text class="chart-axis-label" x="${(padL + plotW / 2).toFixed(1)}" y="${yLbl}" text-anchor="middle">${shortDate(pts[0].t)}</text>`;
  } else {
    svg += `<text class="chart-axis-label" x="${padL}" y="${yLbl}" text-anchor="start">${shortDate(pts[0].t)}</text>`;
    svg += `<text class="chart-axis-label" x="${W - padR}" y="${yLbl}" text-anchor="end">${shortDate(pts[n - 1].t)}</text>`;
  }
  svg += `</svg>`;
  return svg;
}

function difficultyPoints(history) {
  return history
    .map((h) => ({ t: new Date(h.date).getTime(), v: entryDiff(h) }))
    .filter((p) => !isNaN(p.t) && p.v != null)
    .sort((a, b) => a.t - b.t);
}

function renderProgress() {
  const history = loadHistory();
  const chart = $("progress-chart");
  const stats = $("progress-stats");

  const nMistakes = loadMistakes().length;
  $("btn-clear-mistakes").style.display = nMistakes ? "" : "none";
  $("btn-clear-mistakes").textContent = `Clear saved mistakes (${nMistakes})`;

  const pts = difficultyPoints(history);
  if (!pts.length) {
    chart.innerHTML = '<div class="scores-empty">No rounds yet.<br>Finish a round and your difficulty chart will appear here.</div>';
    stats.textContent = "";
    $("btn-clear-scores").style.display = history.length ? "" : "none";
    return;
  }
  $("btn-clear-scores").style.display = "";

  chart.innerHTML = buildChartSVG(pts);

  const vals = pts.map((p) => p.v);
  const cur = diffLabel(vals[vals.length - 1]);
  const peak = diffLabel(Math.max(...vals));
  stats.innerHTML =
    `<strong>${history.length}</strong> round${history.length === 1 ? "" : "s"} · ` +
    `currently <strong>${cur}</strong> · peak <strong>${peak}</strong>`;
}

function renderHomeStats() {
  const history = loadHistory();
  const box = $("home-best");
  const pts = difficultyPoints(history);
  if (!history.length) {
    box.innerHTML = "";
    return;
  }
  const cur = pts.length ? ` &middot; currently <strong>${diffLabel(pts[pts.length - 1].v)}</strong>` : "";
  box.innerHTML = `<strong>${history.length}</strong> round${history.length === 1 ? "" : "s"} played${cur}`;
}

function renderHomeMistakes() {
  const n = loadMistakes().length;
  const btn = $("btn-mistakes");
  const sub = $("mistakes-sub");
  if (n === 0) {
    btn.disabled = true;
    sub.textContent = "No saved mistakes yet";
  } else {
    btn.disabled = false;
    sub.textContent = `${n} word${n === 1 ? "" : "s"} to review`;
  }
}

function applyProfile() {
  $("profile-name").textContent = profile.name;
  if (isAdaptive()) {
    $("profile-level").textContent = "Adaptive";
    const mix = abilityMix(profile.ability);
    $("mix-line").textContent = "Your mix: " + mix.map((m) => `${m.level} ${m.pct}%`).join(" · ");
    $("mix-line").classList.remove("gone");
    $("word-count").textContent = `Adaptive · ${activeTotal()} words · offline · v${APP_VERSION}`;
  } else {
    $("profile-level").textContent = `${profile.study} · ${LEVEL_INFO[profile.study]}`;
    $("mix-line").classList.add("gone");
    $("word-count").textContent = `${activePool(profile.study).length} words · ${profile.study} · offline · v${APP_VERSION}`;
  }
  renderHomeStats();
  renderHomeMistakes();
}

function openScores(from) {
  scoresBackTarget = from;
  renderProgress();
  show("scores");
}

function openOptions() {
  $("opt-hide-cognates").checked = !!settings.hideCognates;
  $("opt-cognate-count").textContent = lookAlikeCount();
  show("options");
}

// ── Registration screen ──
function studyChoices() {
  return [{ key: "adaptive", code: "📈", desc: "Adaptive — adjusts to you", adaptive: true }]
    .concat(LEVELS.map((l) => ({ key: l, code: l, desc: LEVEL_INFO[l] })));
}

function renderStudyChoices() {
  const box = $("level-choices");
  box.innerHTML = "";
  studyChoices().forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "level-chip" + (c.adaptive ? " adaptive" : "") + (c.key === regChoice ? " selected" : "");
    btn.innerHTML = `<span class="level-code">${c.code}</span><span class="level-desc">${c.desc}</span>`;
    btn.addEventListener("click", () => {
      regChoice = c.key;
      renderStudyChoices();
      updateRegisterButtons();
      updateRegisterState();
    });
    box.appendChild(btn);
  });
}

function updateRegisterButtons() {
  const adaptive = regChoice === "adaptive";
  $("btn-skip-test").style.display = adaptive ? "" : "none";
  $("btn-register").textContent = adaptive
    ? "Take placement test"
    : (regEditing ? "Save" : "Start learning");
}

function updateRegisterState() {
  const name = $("reg-name").value.trim();
  $("btn-register").disabled = !(name && regChoice);
}

function renderUserList() {
  const users = loadUsers().slice().sort((a, b) => a.name.localeCompare(b.name));
  const btn = $("btn-show-users");
  const list = $("user-list");
  list.innerHTML = "";
  if (!users.length) {
    btn.style.display = "none";
    list.classList.add("gone");
    return;
  }
  btn.style.display = "";
  btn.textContent = `👥 Registered users (${users.length})`;
  users.forEach((u) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "user-chip";
    const nameSpan = document.createElement("span");
    nameSpan.className = "user-chip-name";
    nameSpan.textContent = u.name;
    const subSpan = document.createElement("span");
    subSpan.className = "user-chip-sub";
    subSpan.textContent = u.study === "adaptive" ? "Adaptive" : u.study;
    chip.append(nameSpan, subSpan);
    chip.addEventListener("click", () => chooseUser(u.name));
    list.appendChild(chip);
  });
}

function showRegister() {
  regEditing = !!profile;
  $("reg-title").textContent = regEditing ? "Change user or level" : "Welcome!";
  $("reg-name").value = regEditing ? profile.name : "";
  regChoice = regEditing ? profile.study : null;
  $("btn-register-cancel").style.display = regEditing ? "" : "none";
  renderUserList();
  $("user-list").classList.add("gone"); // start collapsed
  renderStudyChoices();
  updateRegisterButtons();
  updateRegisterState();
  show("register");
  if (!regEditing) setTimeout(() => $("reg-name").focus(), 50);
}

function submitRegister() {
  const name = $("reg-name").value.trim();
  if (!name || !regChoice) return;
  const keepAbility = profile && typeof profile.ability === "number" ? profile.ability : START_ABILITY;
  if (regChoice === "adaptive") {
    profile = { name, study: "adaptive", ability: keepAbility };
    saveProfile(profile);
    startPlacement();
  } else {
    profile = { name, study: regChoice, ability: keepAbility };
    saveProfile(profile);
    applyProfile();
    show("home");
  }
}

function skipTest() {
  const name = $("reg-name").value.trim();
  if (!name) return;
  const keepAbility = profile && typeof profile.ability === "number" ? profile.ability : START_ABILITY;
  profile = { name, study: "adaptive", ability: keepAbility };
  saveProfile(profile);
  applyProfile();
  show("home");
}

// ── Wiring ──
document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    startRound(btn.dataset.mode);
  });
});

$("btn-next").addEventListener("click", nextQuestion);
$("btn-dunno").addEventListener("click", () => lockAnswer(null, null));
$("btn-reveal").addEventListener("click", showTranslations);

$("btn-quit").addEventListener("click", () => {
  if (confirm("Quit this round? Your progress will be lost.")) {
    round = null;
    show("home");
  }
});

$("btn-again").addEventListener("click", () => {
  if (round.mode === "mistakes" && loadMistakes().length === 0) {
    show("home");
    return;
  }
  startRound(round.mode);
});
$("btn-result-home").addEventListener("click", () => show("home"));
$("btn-scores").addEventListener("click", () => openScores("home"));
$("btn-options").addEventListener("click", openOptions);
$("btn-options-back").addEventListener("click", () => show("home"));
$("btn-coffee").setAttribute("href", COFFEE_URL);
$("opt-hide-cognates").addEventListener("change", (e) => {
  settings.hideCognates = e.target.checked;
  saveSettings();
  invalidatePools();
  if (profile) applyProfile();
});
$("btn-result-scores").addEventListener("click", () => openScores("result"));
$("btn-scores-back").addEventListener("click", () => show(scoresBackTarget));

$("btn-change-profile").addEventListener("click", showRegister);
$("btn-register").addEventListener("click", submitRegister);
$("btn-skip-test").addEventListener("click", skipTest);
$("btn-show-users").addEventListener("click", () => $("user-list").classList.toggle("gone"));
$("btn-register-cancel").addEventListener("click", () => show("home"));
$("reg-name").addEventListener("input", updateRegisterState);
$("reg-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("btn-register").disabled) submitRegister();
});

$("btn-clear-scores").addEventListener("click", () => {
  if (confirm("Delete all progress history for " + profile.name + "?")) {
    localStorage.removeItem(scoresKey());
    renderProgress();
    renderHomeStats();
  }
});
$("btn-clear-mistakes").addEventListener("click", () => {
  if (confirm("Delete all saved mistakes for " + profile.name + "?")) {
    localStorage.removeItem(mistakesKey());
    renderProgress();
    renderHomeMistakes();
  }
});

// ── Init ──
syncUsers(); // surface any pre-existing usernames in the picker
profile = loadProfile();
if (profile) {
  upsertUser(profile);
  applyProfile();
  show("home");
} else {
  showRegister();
}
