"use strict";

const APP_VERSION = "1.3.0";
const ROUND_LENGTH = 20;
const OPTION_COUNT = 4;
const MAX_SCORES = 10;
const PROFILE_KEY = "dutch-vocab-profile";

const MODES = {
  "nl-en": "NL → EN",
  "en-nl": "EN → NL",
  "mixed": "Mixed",
  "mistakes": "Mistakes",
};

// ── State ──
let round = null; // { mode, questions, index, score, mistakes }
let profile = null; // { name, level }
let regLevel = null; // level chosen on the registration screen

// ── Elements ──
const $ = (id) => document.getElementById(id);
const screens = {
  register: $("screen-register"),
  home: $("screen-home"),
  quiz: $("screen-quiz"),
  result: $("screen-result"),
  scores: $("screen-scores"),
};
let scoresBackTarget = "home";

function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  window.scrollTo(0, 0);
}

// ── Utilities ──
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

// ── Profiles (username + level) ──
function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (raw && raw.name && LEVELS.includes(raw.level)) return raw;
  } catch {}
  return null;
}

function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

function levelVocab(level) {
  return VOCAB_BY_LEVEL[level] || [];
}

function currentVocab() {
  return levelVocab(profile.level);
}

// Per-user storage keys, so each username keeps its own scores/mistakes.
function scoresKey() {
  return "dutch-vocab-scores::" + profile.name;
}
function mistakesKey() {
  return "dutch-vocab-mistakes::" + profile.name;
}

// ── Mistakes bank (per user, persistent record of missed words) ──
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

// ── Round building ──
// pool: the vocabulary list distractors are drawn from; level: tag stored on
// the question so a missed word remembers which level it belongs to.
function makeQuestion(entry, dir, pool, level) {
  const promptKey = dir === "nl-en" ? "nl" : "en";
  const answerKey = dir === "nl-en" ? "en" : "nl";
  const answer = entry[answerKey];

  // Prefer distractors of the same word class (noun/verb/other); if a
  // pass can't fill all slots, retry without the class restriction.
  const cls = wordClass(entry);
  const shuffled = shuffle(pool);
  const distractors = []; // { val, other } — val in answer language, other its translation
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

  // translations maps every option to its counterpart word, so the learner
  // can reveal the meaning of all four choices after answering.
  const translations = { [answer]: entry[promptKey] };
  distractors.forEach((d) => { translations[d.val] = d.other; });

  return {
    dir,
    nl: entry.nl,
    en: entry.en,
    level,
    prompt: entry[promptKey],
    answer,
    options: shuffle([answer, ...distractors.map((d) => d.val)]),
    translations,
  };
}

function buildRound(mode) {
  let questions;
  if (mode === "mistakes") {
    // Most-missed first, then most recent; replay the exact direction missed.
    // Distractors come from the level the missed word belongs to.
    const bank = loadMistakes()
      .slice()
      .sort((a, b) => b.count - a.count || new Date(b.last) - new Date(a.last));
    questions = bank.slice(0, ROUND_LENGTH).map((m) => {
      const pool = levelVocab(m.level).length ? levelVocab(m.level) : currentVocab();
      return makeQuestion({ nl: m.nl, en: m.en }, m.dir, pool, m.level);
    });
  } else {
    const pool = currentVocab();
    const picked = shuffle(pool).slice(0, ROUND_LENGTH);
    questions = picked.map((entry) => {
      const dir = mode === "mixed" ? (Math.random() < 0.5 ? "nl-en" : "en-nl") : mode;
      return makeQuestion(entry, dir, pool, profile.level);
    });
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

function renderQuestion() {
  const q = round.questions[round.index];
  const total = round.questions.length;

  $("progress-fill").style.width = `${(round.index / total) * 100}%`;
  $("q-number").textContent = `Question ${round.index + 1}/${total}`;
  $("q-score").textContent = `✓ ${round.score}`;
  $("direction-label").textContent =
    q.dir === "nl-en" ? "What does this mean in English?" : "What is the Dutch word?";
  $("prompt-word").textContent = q.prompt;

  const box = $("options");
  box.innerHTML = "";
  q.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.dataset.value = opt;
    const label = document.createElement("span");
    label.className = "opt-label";
    label.textContent = opt;
    btn.appendChild(label);
    btn.addEventListener("click", () => lockAnswer(opt, btn));
    box.appendChild(btn);
  });

  // Reset the answer-time controls for the fresh question.
  $("btn-dunno").classList.remove("gone");
  $("btn-reveal").classList.add("gone");
  $("btn-next").classList.add("hidden");
}

// chosen is the picked option string, or null when "I don't know" was tapped.
// chosenBtn is the option button element, or null for "I don't know".
function lockAnswer(chosen, chosenBtn) {
  const q = round.questions[round.index];
  const total = round.questions.length;
  const buttons = [...$("options").children];
  buttons.forEach((b) => (b.disabled = true));

  const correct = chosen !== null && chosen === q.answer;
  if (correct) {
    round.score++;
    chosenBtn.classList.add("correct");
    // In mistakes mode a correct answer retires the word from the bank.
    if (round.mode === "mistakes") masterMistake(q);
    if (navigator.vibrate) navigator.vibrate(15);
  } else {
    if (chosenBtn) chosenBtn.classList.add("wrong");
    round.mistakes.push({
      prompt: q.prompt,
      answer: q.answer,
      chosen: chosen === null ? "(didn't know)" : chosen,
    });
    recordMistake(q); // remember it for Practice mistakes
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
  }
  buttons.forEach((b) => {
    if (b.dataset.value === q.answer) b.classList.add("correct");
    else if (b !== chosenBtn) b.classList.add("dimmed");
  });

  $("q-score").textContent = `✓ ${round.score}`;
  $("progress-fill").style.width = `${((round.index + 1) / total) * 100}%`;

  $("btn-dunno").classList.add("gone");
  $("btn-reveal").classList.remove("gone");

  const nextBtn = $("btn-next");
  nextBtn.textContent = round.index + 1 < total ? "Next" : "See result";
  nextBtn.classList.remove("hidden");
}

// Reveal the meaning of every multiple-choice option, inline inside its own
// answer box, so the learner can study all four words at once. Un-dims the
// non-selected options so every translation stays readable.
function showTranslations() {
  const q = round.questions[round.index];
  [...$("options").children].forEach((btn) => {
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
  round.index++;
  if (round.index < round.questions.length) {
    renderQuestion();
  } else {
    finishRound();
  }
}

// ── Results & scores (per user) ──
function loadScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(scoresKey()));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveScores(scores) {
  localStorage.setItem(scoresKey(), JSON.stringify(scores));
}

function recordScore(score, mode, level) {
  const scores = loadScores();
  const prevBest = scores.length ? Math.max(...scores.map((s) => s.score)) : -1;
  scores.push({ score, mode, level, date: new Date().toISOString() });
  scores.sort((a, b) => b.score - a.score || new Date(b.date) - new Date(a.date));
  saveScores(scores.slice(0, MAX_SCORES));
  return score > prevBest;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function finishRound() {
  const { score, mode, mistakes, questions } = round;
  const total = questions.length;
  // Best-scores table is for the standard 20-question rounds only; the
  // variable-length mistakes round is about clearing words, not high scores.
  const isNewBest = mode === "mistakes" ? false : recordScore(score, mode, profile.level);
  const pct = total ? Math.round((score / total) * 100) : 0;
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

  const modeLabel = mode === "mistakes" ? MODES[mode] : `${profile.level} · ${MODES[mode]}`;
  let detail = `${pct}% · ${modeLabel}`;
  if (mode === "mistakes") {
    detail += remaining === 0
      ? ' · <span class="new-best">no mistakes left!</span>'
      : ` · ${remaining} word${remaining === 1 ? "" : "s"} still to review`;
  } else if (isNewBest) {
    detail += ' · <span class="new-best">New best score!</span>';
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

  // "Play again" has nothing to repeat if the mistakes bank is now empty.
  const again = $("btn-again");
  if (mode === "mistakes" && remaining === 0) {
    again.style.display = "none";
  } else {
    again.style.display = "";
    again.textContent = mode === "mistakes" ? "Practise again" : "Play again";
  }

  show("result");
  renderHomeBest();
  renderHomeMistakes();
}

function renderScoresTable() {
  const scores = loadScores();
  const box = $("scores-table");
  box.innerHTML = "";

  const nMistakes = loadMistakes().length;
  $("btn-clear-mistakes").style.display = nMistakes ? "" : "none";
  $("btn-clear-mistakes").textContent = `Clear saved mistakes (${nMistakes})`;

  if (!scores.length) {
    box.innerHTML = '<div class="scores-empty">No rounds played yet.<br>Finish a round and your best scores will appear here.</div>';
    $("btn-clear-scores").style.display = "none";
    return;
  }
  $("btn-clear-scores").style.display = "";

  const table = document.createElement("div");
  table.className = "scores-table";
  scores.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "score-row" + (i === 0 ? " top" : "");
    const meta = (s.level ? s.level + " · " : "") + (MODES[s.mode] || s.mode);
    row.innerHTML =
      `<span class="score-rank">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>` +
      `<span class="score-val">${s.score}/20</span>` +
      `<span class="score-meta">${meta}<br>${formatDate(s.date)}</span>`;
    table.appendChild(row);
  });
  box.appendChild(table);
}

function renderHomeBest() {
  const scores = loadScores();
  const box = $("home-best");
  if (!scores.length) {
    box.innerHTML = "";
    return;
  }
  const best = scores[0];
  const meta = (best.level ? best.level + " · " : "") + (MODES[best.mode] || best.mode);
  box.innerHTML = `Best score: <strong>${best.score}/20</strong> &middot; ${meta} &middot; ${formatDate(best.date)}`;
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

// Update everything that reflects the current profile (called after login /
// switching user / changing level).
function applyProfile() {
  $("profile-name").textContent = profile.name;
  $("profile-level").textContent = `${profile.level} · ${LEVEL_INFO[profile.level]}`;
  $("word-count").textContent = `${currentVocab().length} words · ${profile.level} · offline · v${APP_VERSION}`;
  renderHomeBest();
  renderHomeMistakes();
}

function openScores(from) {
  scoresBackTarget = from;
  renderScoresTable();
  show("scores");
}

// ── Registration screen ──
function renderLevelChoices() {
  const box = $("level-choices");
  box.innerHTML = "";
  LEVELS.forEach((lvl) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "level-chip" + (lvl === regLevel ? " selected" : "");
    btn.innerHTML = `<span class="level-code">${lvl}</span><span class="level-desc">${LEVEL_INFO[lvl]}</span>`;
    btn.addEventListener("click", () => {
      regLevel = lvl;
      renderLevelChoices();
      updateRegisterState();
    });
    box.appendChild(btn);
  });
}

function updateRegisterState() {
  const name = $("reg-name").value.trim();
  $("btn-register").disabled = !(name && regLevel);
}

function showRegister() {
  const editing = !!profile;
  $("reg-title").textContent = editing ? "Change user or level" : "Welcome!";
  $("reg-name").value = editing ? profile.name : "";
  regLevel = editing ? profile.level : null;
  $("btn-register").textContent = editing ? "Save" : "Start learning";
  $("btn-register-cancel").style.display = editing ? "" : "none";
  renderLevelChoices();
  updateRegisterState();
  show("register");
  if (!editing) setTimeout(() => $("reg-name").focus(), 50);
}

function submitRegister() {
  const name = $("reg-name").value.trim();
  if (!name || !regLevel) return;
  profile = { name, level: regLevel };
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
$("btn-result-scores").addEventListener("click", () => openScores("result"));
$("btn-scores-back").addEventListener("click", () => show(scoresBackTarget));

$("btn-change-profile").addEventListener("click", showRegister);
$("btn-register").addEventListener("click", submitRegister);
$("btn-register-cancel").addEventListener("click", () => show("home"));
$("reg-name").addEventListener("input", updateRegisterState);
$("reg-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("btn-register").disabled) submitRegister();
});

$("btn-clear-scores").addEventListener("click", () => {
  if (confirm("Delete all saved scores for " + profile.name + "?")) {
    localStorage.removeItem(scoresKey());
    renderScoresTable();
    renderHomeBest();
  }
});

$("btn-clear-mistakes").addEventListener("click", () => {
  if (confirm("Delete all saved mistakes for " + profile.name + "?")) {
    localStorage.removeItem(mistakesKey());
    renderScoresTable();
    renderHomeMistakes();
  }
});

// ── Init ──
profile = loadProfile();
if (profile) {
  applyProfile();
  show("home");
} else {
  showRegister();
}
