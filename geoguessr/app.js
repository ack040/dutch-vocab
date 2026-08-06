/* GeoGuessr Tells Trainer — app logic (vanilla JS, offline PWA) */
(function () {
  "use strict";

  // ---------- persistence ----------
  const LS_WATCH = "gg_watch";   // Set of "countryId|categoryId" tells you tend to miss
  const LS_REGION = "gg_region"; // remembered region filter

  const loadSet = (k) => {
    try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); }
    catch { return new Set(); }
  };
  const saveSet = (k, set) => {
    try { localStorage.setItem(k, JSON.stringify([...set])); } catch {}
  };

  let watch = loadSet(LS_WATCH);
  let regionFilter = localStorage.getItem(LS_REGION) || "all";

  const watchKey = (countryId, cat) => `${countryId}|${cat}`;

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sample = (arr, n) => shuffle(arr).slice(0, n);
  const byId = (id) => GG_COUNTRIES.find((c) => c.id === id);

  // Flatten a country's tells into an ordered list of {cat, icon, label, texts[]}.
  function tellsOf(country) {
    const out = [];
    for (const cat of GG_CATEGORIES) {
      const v = country.tells[cat.id];
      if (v == null) continue;
      out.push({
        cat: cat.id,
        icon: cat.icon,
        label: cat.label,
        texts: Array.isArray(v) ? v : [v],
      });
    }
    return out;
  }

  function filteredCountries() {
    if (regionFilter === "all") return GG_COUNTRIES;
    return GG_COUNTRIES.filter((c) => c.region === regionFilter);
  }

  // ---------- screen router ----------
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("screen-" + id).classList.add("active");
    window.scrollTo(0, 0);
  }

  // ---------- home ----------
  function renderHome() {
    const chips = $("region-chips");
    const regions = ["all", ...GG_REGIONS.filter((r) => GG_COUNTRIES.some((c) => c.region === r))];
    chips.innerHTML = "";
    regions.forEach((r) => {
      const b = document.createElement("button");
      b.className = "chip" + (r === regionFilter ? " active" : "");
      b.textContent = r === "all" ? "🌐 All regions" : r;
      b.onclick = () => {
        regionFilter = r;
        localStorage.setItem(LS_REGION, r);
        renderHome();
      };
      chips.appendChild(b);
    });
    const n = watch.size;
    $("watch-sub").textContent = n
      ? `${n} tell${n === 1 ? "" : "s"} on your watchlist`
      : "Star tells you keep missing — they collect here";
  }

  // ---------- study: list ----------
  function renderStudyList(query) {
    const q = (query || "").trim().toLowerCase();
    const list = $("country-list");
    list.innerHTML = "";
    let pool = filteredCountries();
    if (q) {
      pool = pool.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        return tellsOf(c).some((t) => t.texts.join(" ").toLowerCase().includes(q));
      });
    }
    $("study-count").textContent = `${pool.length} countr${pool.length === 1 ? "y" : "ies"}`;
    pool.forEach((c) => {
      const starred = tellsOf(c).filter((t) => watch.has(watchKey(c.id, t.cat))).length;
      const card = document.createElement("button");
      card.className = "country-card";
      card.innerHTML =
        `<span class="cc-flag">${c.flag}</span>` +
        `<span><span class="cc-name">${c.name}</span><br>` +
        `<span class="cc-region">${c.region}</span></span>` +
        (starred ? `<span class="cc-star">⭐ ${starred}</span>` : "");
      card.onclick = () => openDetail(c.id);
      list.appendChild(card);
    });
  }

  // ---------- study: detail ----------
  let detailReturn = "study";
  function openDetail(countryId, returnTo) {
    detailReturn = returnTo || "study";
    const c = byId(countryId);
    $("detail-title").textContent = `${c.flag} ${c.name}`;
    $("detail-region").textContent = c.region;
    renderTellList($("tell-list"), c, true);
    show("detail");
  }

  // Render a country's tells into `container`. If `interactive`, show star toggles.
  function renderTellList(container, country, interactive) {
    container.innerHTML = "";
    container.classList.remove("gone");
    tellsOf(country).forEach((t) => {
      const key = watchKey(country.id, t.cat);
      const row = document.createElement("div");
      row.className = "tell";
      const body = t.texts.length > 1
        ? `<ul>${t.texts.map((x) => `<li>${x}</li>`).join("")}</ul>`
        : t.texts[0];
      row.innerHTML =
        `<span class="t-icon">${t.icon}</span>` +
        `<span class="t-body"><span class="t-cat">${t.label}</span>` +
        `<div class="t-text">${body}</div></span>`;
      if (interactive) {
        const star = document.createElement("button");
        star.className = "t-star" + (watch.has(key) ? " on" : "");
        star.textContent = watch.has(key) ? "⭐" : "☆";
        star.setAttribute("aria-label", "Add to watchlist");
        star.onclick = () => {
          if (watch.has(key)) { watch.delete(key); star.className = "t-star"; star.textContent = "☆"; }
          else { watch.add(key); star.className = "t-star on"; star.textContent = "⭐"; }
          saveSet(LS_WATCH, watch);
        };
        row.appendChild(star);
      }
      container.appendChild(row);
    });
  }

  // ---------- quiz: name the country ----------
  const QUIZ_LEN = 8;
  let quiz = null;

  function startQuiz() {
    const pool = filteredCountries();
    if (pool.length < 4) { alert("Pick a broader region — a quiz needs at least 4 countries."); return; }
    const targets = sample(pool, Math.min(QUIZ_LEN, pool.length));
    quiz = { targets, i: 0, score: 0, results: [] };
    show("quiz");
    loadQuizQuestion();
  }

  function loadQuizQuestion() {
    const c = quiz.targets[quiz.i];
    // Clues: shuffle this country's tells, reveal one at a time.
    const allClues = shuffle(tellsOf(c));
    quiz.q = { country: c, clues: allClues, shown: 1, answered: false };

    // Distractors: prefer same region, fall back to global.
    const same = filteredCountries().filter((x) => x.region === c.region && x.id !== c.id);
    const other = GG_COUNTRIES.filter((x) => x.id !== c.id && x.region !== c.region);
    const distract = sample(same.length >= 3 ? same : same.concat(other), 3);
    quiz.q.options = shuffle([c, ...distract]);

    $("quiz-count").textContent = `Question ${quiz.i + 1} / ${quiz.targets.length}`;
    $("quiz-score").textContent = `Score ${quiz.score}`;
    $("quiz-progress").style.width = `${(quiz.i / quiz.targets.length) * 100}%`;
    $("answer-reveal").classList.add("gone");
    $("answer-reveal").innerHTML = "";
    $("btn-next").classList.add("hidden");
    renderClues();
    renderQuizOptions();
  }

  function renderClues() {
    const ul = $("clue-list");
    ul.innerHTML = "";
    const { clues, shown } = quiz.q;
    clues.slice(0, shown).forEach((t) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="cl-icon">${t.icon}</span>` +
        `<span><span class="cl-cat">${t.label}</span>${t.texts[0]}</span>`;
      ul.appendChild(li);
    });
    const more = $("btn-more-clues");
    more.classList.toggle("gone", quiz.q.answered || shown >= clues.length);
  }

  function renderQuizOptions() {
    const box = $("quiz-options");
    box.innerHTML = "";
    quiz.q.options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.innerHTML = `<span class="o-flag">${opt.flag}</span>${opt.name}`;
      b.onclick = () => answerQuiz(opt, b);
      box.appendChild(b);
    });
  }

  function answerQuiz(opt, btn) {
    if (quiz.q.answered) return;
    quiz.q.answered = true;
    const c = quiz.q.country;
    const correct = opt.id === c.id;
    // Fewer clues used → more points (5 down to 1).
    const pts = correct ? Math.max(1, 6 - quiz.q.shown) : 0;
    if (correct) quiz.score += pts;
    quiz.results.push({ country: c, correct, clues: quiz.q.shown });

    // Mark options.
    [...$("quiz-options").children].forEach((el, idx) => {
      const o = quiz.q.options[idx];
      el.disabled = true;
      if (o.id === c.id) el.classList.add("correct");
      else if (o === opt) el.classList.add("wrong");
    });
    $("btn-more-clues").classList.add("gone");
    $("quiz-score").textContent = `Score ${quiz.score}`;

    // Reveal all tells so you can star the ones you missed.
    const rv = $("answer-reveal");
    rv.classList.remove("gone");
    const head = correct
      ? `<h3>✅ ${c.flag} ${c.name} — +${pts}</h3><p class="reveal-sub">Nailed it with ${quiz.q.shown} clue${quiz.q.shown === 1 ? "" : "s"}. Here's the full tell sheet — star anything you'd have missed.</p>`
      : `<h3>❌ It was ${c.flag} ${c.name}</h3><p class="reveal-sub">Star the tells you missed so they land on your watchlist.</p>`;
    rv.innerHTML = head + `<div class="tell-list" id="reveal-tells"></div>`;
    renderTellList($("reveal-tells"), c, true);

    $("btn-next").classList.remove("hidden");
    $("btn-next").textContent = quiz.i + 1 >= quiz.targets.length ? "See results →" : "Next →";
  }

  function nextQuiz() {
    quiz.i++;
    if (quiz.i >= quiz.targets.length) return finishQuiz();
    loadQuizQuestion();
  }

  function finishQuiz() {
    const total = quiz.targets.length;
    const right = quiz.results.filter((r) => r.correct).length;
    const pct = right / total;
    $("result-emoji").textContent = pct === 1 ? "🏆" : pct >= 0.6 ? "🌍" : pct >= 0.3 ? "🧭" : "📍";
    $("result-title").textContent =
      pct === 1 ? "Flawless run!" : pct >= 0.6 ? "Strong sense of place" : pct >= 0.3 ? "Getting your bearings" : "Keep training";
    $("result-score").textContent = right;
    $("result-total").textContent = `/${total}`;
    $("result-detail").textContent = `${quiz.score} points · ${watch.size} tell${watch.size === 1 ? "" : "s"} on your watchlist`;

    const rev = $("result-review");
    rev.innerHTML = "";
    quiz.results.forEach((r) => {
      const el = document.createElement("button");
      el.className = "review-item";
      el.innerHTML =
        `<span class="ri-flag">${r.country.flag}</span>` +
        `<span>${r.country.name}<br><span class="cc-region">${r.correct ? `guessed on clue ${r.clues}` : "missed"}</span></span>` +
        `<span class="ri-mark">${r.correct ? "✅" : "❌"}</span>`;
      el.onclick = () => openDetail(r.country.id, "result");
      rev.appendChild(el);
    });
    show("result");
  }

  // ---------- recall (flashcards) ----------
  let recall = null;
  function startRecall() {
    const pool = filteredCountries();
    if (!pool.length) { alert("No countries in this region."); return; }
    recall = { queue: shuffle(pool).slice(0, Math.min(QUIZ_LEN, pool.length)), i: 0 };
    show("recall");
    loadRecall();
  }
  function loadRecall() {
    const c = recall.queue[recall.i];
    recall.c = c;
    $("recall-count").textContent = `Card ${recall.i + 1} / ${recall.queue.length}`;
    $("recall-progress").style.width = `${(recall.i / recall.queue.length) * 100}%`;
    $("recall-flag").textContent = c.flag;
    $("recall-name").textContent = c.name;
    $("recall-prompt").classList.remove("gone");
    $("btn-flip").classList.remove("gone");
    $("recall-tells").classList.add("gone");
    $("recall-actions").classList.add("hidden");
  }
  function flipRecall() {
    renderTellList($("recall-tells"), recall.c, true);
    $("recall-prompt").classList.add("gone");
    $("btn-flip").classList.add("gone");
    $("recall-actions").classList.remove("hidden");
  }
  function gradeRecall(knew) {
    if (!knew) {
      // Missed the whole card → watchlist every tell of this country.
      tellsOf(recall.c).forEach((t) => watch.add(watchKey(recall.c.id, t.cat)));
      saveSet(LS_WATCH, watch);
    }
    recall.i++;
    if (recall.i >= recall.queue.length) {
      $("result-emoji").textContent = "🃏";
      $("result-title").textContent = "Deck complete";
      $("result-score").textContent = recall.queue.length;
      $("result-total").textContent = " cards";
      $("result-detail").textContent = `${watch.size} tell${watch.size === 1 ? "" : "s"} on your watchlist to review before you play.`;
      $("result-review").innerHTML = "";
      show("result");
      return;
    }
    loadRecall();
  }

  // ---------- watchlist ----------
  function renderWatch() {
    const body = $("watch-body");
    body.innerHTML = "";
    // Group watched tell-keys by country.
    const groups = {};
    watch.forEach((key) => {
      const [cid, cat] = key.split("|");
      (groups[cid] = groups[cid] || []).push(cat);
    });
    const ids = Object.keys(groups);
    $("btn-clear-watch").classList.toggle("gone", ids.length === 0);

    if (!ids.length) {
      $("watch-intro").textContent = "";
      body.innerHTML =
        `<div class="watch-empty"><div class="big">⭐</div>` +
        `Nothing here yet.<br>While studying or after a quiz, tap ⭐ on any tell you tend to overlook. ` +
        `They gather here so you can skim them right before you play.</div>`;
      return;
    }
    $("watch-intro").textContent = "Skim these before your next round — the clues you personally tend to miss.";

    // Sort countries by name for a stable list.
    ids.map(byId).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)).forEach((c) => {
      const wrap = document.createElement("div");
      wrap.className = "watch-group";
      wrap.innerHTML = `<h3>${c.flag} ${c.name}</h3>`;
      const tl = document.createElement("div");
      tl.className = "tell-list";
      // Only render the tells the user actually starred.
      const starred = new Set(groups[c.id]);
      tellsOf(c).filter((t) => starred.has(t.cat)).forEach((t) => {
        const key = watchKey(c.id, t.cat);
        const row = document.createElement("div");
        row.className = "tell";
        const bodyHtml = t.texts.length > 1
          ? `<ul>${t.texts.map((x) => `<li>${x}</li>`).join("")}</ul>` : t.texts[0];
        row.innerHTML =
          `<span class="t-icon">${t.icon}</span>` +
          `<span class="t-body"><span class="t-cat">${t.label}</span><div class="t-text">${bodyHtml}</div></span>` +
          `<button class="t-star on" aria-label="Remove from watchlist">⭐</button>`;
        row.querySelector(".t-star").onclick = () => {
          watch.delete(key); saveSet(LS_WATCH, watch); renderWatch();
        };
        tl.appendChild(row);
      });
      wrap.appendChild(tl);
      body.appendChild(wrap);
    });
  }

  // ---------- events ----------
  function bind() {
    // Home mode buttons.
    document.querySelectorAll("[data-mode]").forEach((b) => {
      b.onclick = () => {
        const m = b.getAttribute("data-mode");
        if (m === "quiz") startQuiz();
        else if (m === "recall") startRecall();
        else if (m === "study") { renderStudyList($("study-search").value); show("study"); }
        else if (m === "watch") { renderWatch(); show("watch"); }
      };
    });
    // Home buttons appear on several screens.
    document.querySelectorAll("[data-home]").forEach((b) => {
      b.onclick = () => { renderHome(); show("home"); };
    });

    $("study-search").addEventListener("input", (e) => renderStudyList(e.target.value));
    $("detail-back").onclick = () => {
      if (detailReturn === "result") show("result");
      else { renderStudyList($("study-search").value); show("study"); }
    };

    $("quiz-quit").onclick = () => { renderHome(); show("home"); };
    $("btn-more-clues").onclick = () => { quiz.q.shown++; renderClues(); };
    $("btn-next").onclick = nextQuiz;

    $("recall-quit").onclick = () => { renderHome(); show("home"); };
    $("btn-flip").onclick = flipRecall;
    $("btn-knew").onclick = () => gradeRecall(true);
    $("btn-missed").onclick = () => gradeRecall(false);

    $("btn-clear-watch").onclick = () => {
      if (confirm("Clear your whole watchlist?")) { watch.clear(); saveSet(LS_WATCH, watch); renderWatch(); }
    };

    $("btn-again").onclick = () => {
      // Replay whichever mode we came from — default to quiz.
      startQuiz();
    };
    $("btn-result-watch").onclick = () => { renderWatch(); show("watch"); };
  }

  // ---------- init ----------
  renderHome();
  bind();
})();
