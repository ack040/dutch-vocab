#!/usr/bin/env node
// Data lint for the vocab apps (Dutch + Spanish — auto-detects the word key).
// Run: node scripts/lint-data.js [path/to/data.js]
// Asserts the invariants the quiz engine relies on:
//   - unique headwords across the whole dataset
//   - every entry has a non-empty meaning, definition, and example sentence
//   - no verbatim-duplicate definitions within a level (nl-nl/es-es ambiguity)
//   - definitions don't contain their own headword stem (answer leak)
//   - example sentences contain the headword in some inflected form
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "data.js");
const src = fs.readFileSync(file, "utf8");
const sb = {};
new Function("g", src + "; g.V = VOCAB_BY_LEVEL; g.L = LEVELS;")(sb);
const { V, L } = sb;

const wordKey = V[L[0]][0].nl !== undefined ? "nl" : "es";
const ARTICLES = /^(de|het|zich|el|la|los|las|un|una)\s+/i;
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const stemOf = (w) => {
  let s = norm(w.replace(ARTICLES, "").trim());
  // crude stem: strip common verb/plural endings so inflections still match
  s = s.replace(/(en|s|e)$/, "");
  return s;
};

let errors = 0, warnings = 0;
const fail = (msg) => { console.error("ERROR  " + msg); errors++; };
const warn = (msg) => { console.warn("warn   " + msg); warnings++; };

const seenWords = new Map();
for (const level of L) {
  const defSeen = new Map();
  for (const e of V[level]) {
    const w = e[wordKey];
    const label = `[${level}] ${w}`;

    if (!w || !e.en) fail(`${label}: missing word or meaning`);
    if (!e.def) warn(`${label}: missing definition`);
    if (!e.ex) warn(`${label}: missing example sentence`);
    if (!e.exen && e.ex) warn(`${label}: example sentence has no translation`);

    const wk = norm(w);
    if (seenWords.has(wk)) fail(`${label}: duplicate headword (also in ${seenWords.get(wk)})`);
    seenWords.set(wk, level);

    if (e.def) {
      const dk = norm(e.def);
      if (defSeen.has(dk)) fail(`${label}: verbatim duplicate definition of "${defSeen.get(dk)}" — ambiguous in definition mode`);
      defSeen.set(dk, w);

      const stem = stemOf(w);
      if (stem.length >= 4 && norm(e.def).includes(stem)) {
        fail(`${label}: definition contains its own headword stem ("${stem}") — leaks the answer`);
      }
    }

    if (e.ex) {
      const stem = stemOf(w);
      const short = stem.slice(0, Math.max(3, stem.length - 2));
      if (stem.length >= 3 && !norm(e.ex).includes(short)) {
        warn(`${label}: example sentence may not contain the headword: "${e.ex}"`);
      }
    }
  }
}

const total = L.reduce((n, l) => n + V[l].length, 0);
console.log(`\n${file}: ${total} entries · ${errors} error(s) · ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
