"use strict";

const ROUND_LENGTH = 20;
const OPTION_COUNT = 4;
const MAX_SCORES = 10;
const STORAGE_KEY = "dutch-vocab-scores-v1";

const MODES = {
  "nl-en": "NL → EN",
  "en-nl": "EN → NL",
  "mixed": "Mixed",
};

// ── State ──
let round = null; // { mode, questions, index, score, mistakes }

// ── Elements ──
const $ = (id) => document.getElementById(id);
const screens = {
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

// ── Round building ──
function buildRound(mode) {
  const picked = shuffle(VOCAB).slice(0, ROUND_LENGTH);
  const questions = picked.map((entry, i) => {
    const dir = mode === "mixed" ? (Math.random() < 0.5 ? "nl-en" : "en-nl") : mode;
    const promptKey = dir === "nl-en" ? "nl" : "en";
    const answerKey = dir === "nl-en" ? "en" : "nl";
    const answer = entry[answerKey];

    // Prefer distractors of the same word class (noun/verb/other); if a
    // pass can't fill all slots, retry without the class restriction.
    const cls = wordClass(entry);
    const pool = shuffle(VOCAB);
    const distractors = [];
    for (const sameClassOnly of [true, false]) {
      for (const cand of pool) {
        if (distractors.length >= OPTION_COUNT - 1) break;
        if (cand === entry) continue;
        if (sameClassOnly && wordClass(cand) !== cls) continue;
        const val = cand[answerKey];
        if (val === answer) continue;
        if (overlaps(val, answer)) continue;
        if (distractors.some((d) => d === val || overlaps(d, val))) continue;
        distractors.push(val);
      }
    }

    return {
      dir,
      prompt: entry[promptKey],
      answer,
      options: shuffle([answer, ...distractors]),
    };
  });
  return { mode, questions, index: 0, score: 0, mistakes: [] };
}

// ── Quiz flow ──
function startRound(mode) {
  round = buildRound(mode);
  show("quiz");
  renderQuestion();
}

function renderQuestion() {
  const q = round.questions[round.index];

  $("progress-fill").style.width = `${(round.index / ROUND_LENGTH) * 100}%`;
  $("q-number").textContent = `Question ${round.index + 1}/${ROUND_LENGTH}`;
  $("q-score").textContent = `✓ ${round.score}`;
  $("direction-label").textContent =
    q.dir === "nl-en" ? "What does this mean in English?" : "What is the Dutch word?";
  $("prompt-word").textContent = q.prompt;

  const box = $("options");
  box.innerHTML = "";
  q.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.textContent = opt;
    btn.addEventListener("click", () => answer(btn, opt));
    box.appendChild(btn);
  });

  $("btn-next").classList.add("hidden");
}

function answer(btn, chosen) {
  const q = round.questions[round.index];
  const buttons = [...$("options").children];
  buttons.forEach((b) => (b.disabled = true));

  const correct = chosen === q.answer;
  if (correct) {
    round.score++;
    btn.classList.add("correct");
    if (navigator.vibrate) navigator.vibrate(15);
  } else {
    btn.classList.add("wrong");
    round.mistakes.push({ prompt: q.prompt, answer: q.answer, chosen });
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
  }
  buttons.forEach((b) => {
    if (b.textContent === q.answer) b.classList.add("correct");
    else if (b !== btn) b.classList.add("dimmed");
  });

  $("q-score").textContent = `✓ ${round.score}`;
  $("progress-fill").style.width = `${((round.index + 1) / ROUND_LENGTH) * 100}%`;

  const nextBtn = $("btn-next");
  nextBtn.textContent = round.index + 1 < ROUND_LENGTH ? "Next" : "See result";
  nextBtn.classList.remove("hidden");
}

function nextQuestion() {
  round.index++;
  if (round.index < ROUND_LENGTH) {
    renderQuestion();
  } else {
    finishRound();
  }
}

// ── Results & scores ──
function loadScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveScores(scores) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

function recordScore(score, mode) {
  const scores = loadScores();
  const prevBest = scores.length ? Math.max(...scores.map((s) => s.score)) : -1;
  scores.push({ score, mode, date: new Date().toISOString() });
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
  const { score, mode, mistakes } = round;
  const isNewBest = recordScore(score, mode);

  const pct = Math.round((score / ROUND_LENGTH) * 100);
  let emoji, title;
  if (score === ROUND_LENGTH) { emoji = "🏆"; title = "Perfect round!"; }
  else if (pct >= 85) { emoji = "🎉"; title = "Uitstekend!"; }
  else if (pct >= 70) { emoji = "👏"; title = "Goed gedaan!"; }
  else if (pct >= 50) { emoji = "💪"; title = "Niet slecht!"; }
  else { emoji = "📚"; title = "Blijven oefenen!"; }

  $("result-emoji").textContent = emoji;
  $("result-title").textContent = title;
  $("result-score").textContent = score;
  $("result-detail").innerHTML =
    `${pct}% · ${MODES[mode]}` +
    (isNewBest ? ' · <span class="new-best">New best score!</span>' : "");

  const review = $("review");
  review.innerHTML = "";
  if (mistakes.length) {
    const title = document.createElement("p");
    title.className = "review-title";
    title.textContent = `Review (${mistakes.length})`;
    review.appendChild(title);
    mistakes.forEach((m) => {
      const item = document.createElement("div");
      item.className = "review-item";
      const q = document.createElement("div");
      q.className = "ri-q";
      q.textContent = m.prompt;
      const a = document.createElement("div");
      const x = document.createElement("span");
      x.className = "ri-x";
      x.textContent = m.chosen;
      const ok = document.createElement("span");
      ok.className = "ri-a";
      ok.textContent = m.answer;
      a.append(x, ok);
      item.append(q, a);
      review.appendChild(item);
    });
  }

  show("result");
  renderHomeBest();
}

function renderScoresTable() {
  const scores = loadScores();
  const box = $("scores-table");
  box.innerHTML = "";

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
    row.innerHTML =
      `<span class="score-rank">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>` +
      `<span class="score-val">${s.score}/20</span>` +
      `<span class="score-meta">${MODES[s.mode] || s.mode}<br>${formatDate(s.date)}</span>`;
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
  box.innerHTML = `Best score: <strong>${best.score}/20</strong> &middot; ${MODES[best.mode] || best.mode} &middot; ${formatDate(best.date)}`;
}

function openScores(from) {
  scoresBackTarget = from;
  renderScoresTable();
  show("scores");
}

// ── Wiring ──
document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => startRound(btn.dataset.mode));
});

$("btn-next").addEventListener("click", nextQuestion);

$("btn-quit").addEventListener("click", () => {
  if (confirm("Quit this round? Your progress will be lost.")) {
    round = null;
    show("home");
  }
});

$("btn-again").addEventListener("click", () => startRound(round.mode));
$("btn-result-home").addEventListener("click", () => show("home"));
$("btn-scores").addEventListener("click", () => openScores("home"));
$("btn-result-scores").addEventListener("click", () => openScores("result"));
$("btn-scores-back").addEventListener("click", () => show(scoresBackTarget));

$("btn-clear-scores").addEventListener("click", () => {
  if (confirm("Delete all saved scores?")) {
    localStorage.removeItem(STORAGE_KEY);
    renderScoresTable();
    renderHomeBest();
  }
});

// ── Init ──
$("word-count").textContent = `${VOCAB.length} words · works fully offline`;
renderHomeBest();
