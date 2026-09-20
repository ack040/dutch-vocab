(function () {
  'use strict';
  var E = window.Engine, TRAPS = window.TRAPS;
  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var OUTCOME = { mate: 'Checkmate', material: 'Wins material', attack: 'Winning attack', even: 'Full equality' };
  var $ = function (id) { return document.getElementById(id); };

  TRAPS.sort(function (a, b) { return a.side === b.side ? a.name.localeCompare(b.name) : (a.side === 'w' ? -1 : 1); });
  var BY_ID = {};
  TRAPS.forEach(function (t) { BY_ID[t.id] = t; });

  /* ---------- position helpers ---------- */
  var cache = {};
  function posAfter(line, n) {
    var key = line.slice(0, n).join(' ');
    if (cache[key]) return cache[key];
    var st = E.newGame(), last = null;
    for (var i = 0; i < n; i++) {
      var mv = E.sanToMove(st, line[i]);
      if (!mv) break;
      last = mv;
      st = E.makeMove(st, mv);
    }
    return (cache[key] = { st: st, last: last });
  }
  function material(st) {
    var d = 0;
    for (var sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      var p = st.board[sq];
      if (p) d += (p.color === 'w' ? 1 : -1) * VAL[p.type];
    }
    return d;
  }
  function finalEdge(t) {
    var d = material(posAfter(t.line, t.line.length).st) * (t.side === 'w' ? 1 : -1);
    return d > 0 ? '+' + d : String(d);
  }
  function who(t) { return t.side === 'w' ? 'White' : 'Black'; }
  /* Material only means something for the two outcomes that are about material. */
  function metaTail(t) {
    if (t.outcome === 'material') return OUTCOME[t.outcome] + ', ' + finalEdge(t) + ' at the end';
    if (t.outcome === 'even') return OUTCOME[t.outcome] + ', material level';
    return OUTCOME[t.outcome];
  }
  function resultLine(t) {
    if (t.outcome === 'mate') return 'Checkmate for ' + who(t) + '.';
    if (t.outcome === 'material') return who(t) + ' comes out ' + finalEdge(t) + ' in material.';
    if (t.outcome === 'even') return who(t) + ' has equalised completely and the material is level.';
    return who(t) + ' has a winning attack. Material here is ' + finalEdge(t) +
      ': the compensation is the initiative, not the count.';
  }
  function moveNo(ply) { return Math.floor(ply / 2) + 1; }

  /* ---------- board ---------- */
  function drawBoard(host, st, last, flipped) {
    var cells = E.squares(st);
    if (flipped) cells = cells.slice().reverse();
    var html = '';
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], cls = 'sq ' + (c.light ? 'l' : 'd');
      if (last && (c.sq === last.from)) cls += ' from';
      if (last && (c.sq === last.to)) cls += ' to';
      var inner = c.piece ? '<span class="pc ' + c.piece.color + '">' + GLYPH[c.piece.type] + '</span>' : '';
      var col = i % 8, row = (i / 8) | 0;
      if (row === 7) inner += '<span class="co f">' + c.name[0] + '</span>';
      if (col === 0) inner += '<span class="co r">' + c.name[1] + '</span>';
      html += '<div class="' + cls + '">' + inner + '</div>';
    }
    host.innerHTML = html;
  }

  /* ---------- explorer state ---------- */
  var path = [], flipped = false;

  function matching(p) {
    return TRAPS.filter(function (t) {
      if (p.length > t.line.length) return false;
      for (var i = 0; i < p.length; i++) if (t.line[i] !== p[i]) return false;
      return true;
    });
  }
  function statusOf(t, n) {
    if (n <= t.blunder) return n === t.blunder ? 'armed' : 'open';
    return 'sprung';
  }
  function nextBookMoves(p, matches) {
    var order = [], map = {};
    matches.forEach(function (t) {
      if (p.length >= t.line.length) return;
      var m = t.line[p.length];
      if (!map[m]) { map[m] = []; order.push(m); }
      map[m].push(t);
    });
    order.sort(function (a, b) { return map[b].length - map[a].length || a.localeCompare(b); });
    return order.map(function (m) { return { san: m, traps: map[m] }; });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function sideTag(t) { return '<span class="tag ' + t.side + '">' + (t.side === 'w' ? 'White' : 'Black') + '</span>'; }

  function renderExplorer() {
    var p = posAfter(path, path.length);
    drawBoard($('board'), p.st, p.last, flipped);
    $('turn-side').innerHTML = '<span class="dot ' + p.st.turn + '"></span>' +
      (p.st.turn === 'w' ? 'White' : 'Black') + ' to move' +
      (E.inCheck(p.st, p.st.turn) ? ' &middot; in check' : '');
    $('turn-ply').textContent = path.length ? 'move ' + moveNo(path.length - 1) + ' · ' + path.length + ' plies' : 'starting position';

    /* move list */
    var pgn = '';
    for (var i = 0; i < path.length; i++) {
      if (i % 2 === 0) pgn += '<span class="n">' + moveNo(i) + '.</span> ';
      pgn += '<span class="m' + (i === path.length - 1 ? ' cur' : '') + '" data-ply="' + (i + 1) + '">' + esc(path[i]) + '</span> ';
    }
    $('pgn').innerHTML = pgn || '<span class="empty">No moves yet. Type the first move or pick one below.</span>';

    var matches = matching(path), n = path.length;

    /* book choices */
    var choices = nextBookMoves(path, matches);
    $('choices').innerHTML = choices.length
      ? choices.map(function (c) {
          return '<button class="mv" data-san="' + esc(c.san) + '"><b>' + esc(c.san) + '</b><i>' + c.traps.length + '</i></button>';
        }).join('')
      : '';
    $('choices-hdr').textContent = choices.length
      ? 'Book continuations (number = traps behind that move)'
      : (matches.length ? 'End of the line.' : 'No trap in the library continues from here.');

    /* live alerts: the punishing move is available right now */
    var live = matches.filter(function (t) { return n === t.punish; });
    $('alerts').innerHTML = live.map(function (t) {
      return '<div class="alert"><h3>Trap is live — ' + esc(t.name) + '</h3>' +
        '<p>' + (t.side === 'w' ? 'White' : 'Black') + ' plays <b>' + esc(t.line[t.punish]) + '</b> now. ' +
        esc(t.summary.split('. ')[0]) + '.</p>' +
        '<button class="btn primary play" data-san="' + esc(t.line[t.punish]) + '">Play ' + esc(t.line[t.punish]) + '</button> ' +
        '<button class="btn play-open" data-id="' + t.id + '">Open full line</button></div>';
    }).join('');

    /* matching traps */
    $('matchhdr').textContent = matches.length + (matches.length === 1 ? ' trap matches' : ' traps match') +
      (n ? ' these ' + n + ' plies' : ' (all of them)');
    if (!matches.length) {
      $('matches').innerHTML = '<p class="empty-note">Out of book. No trap in this library runs through this position. ' +
        '<b>Undo</b> the last move to get back to the tree, or <b>Reset</b> and start again.</p>';
    } else {
      var rank = { armed: 0, sprung: 1, open: 2 };
      var sorted = matches.slice().sort(function (a, b) {
        var ra = rank[statusOf(a, n)], rb = rank[statusOf(b, n)];
        return ra - rb || (a.line.length - b.line.length);
      });
      $('matches').innerHTML = sorted.map(function (t) {
        var st = statusOf(t, n), note = '';
        if (st === 'armed') {
          note = '<div class="st armed">&#9888; ' + (t.side === 'w' ? 'Black' : 'White') +
            ' blunders here with <b>' + esc(t.line[t.blunder]) + '</b></div>';
        } else if (st === 'sprung') {
          note = '<div class="st sprung">&#10003; Blunder played. ' +
            (n === t.punish ? 'Punish with <b>' + esc(t.line[t.punish]) + '</b> now.'
                            : 'Refutation: <b>' + esc(t.line[t.punish]) + '</b> on move ' + moveNo(t.punish) + '.') + '</div>';
        } else {
          note = '<div class="st">' + (t.blunder - n) + ' more ' + (t.blunder - n === 1 ? 'ply' : 'plies') +
            ' until the blunder</div>';
        }
        return '<button class="trap" data-id="' + t.id + '"><div class="row1">' + sideTag(t) +
          '<span class="nm">' + esc(t.name) + '</span><span class="tag o">' + OUTCOME[t.outcome] + '</span></div>' +
          '<div class="meta">' + esc(t.opening) + ' · ' + t.eco + '</div>' + note + '</button>';
      }).join('');
    }
    $('undo').disabled = !path.length;
  }

  function tryMove(san) {
    var p = posAfter(path, path.length);
    var mv = E.sanToMove(p.st, san);
    if (!mv) {
      $('err').textContent = '"' + san + '" is not a legal move here. Use standard notation: e4, Nf3, Bxf7+, O-O.';
      return false;
    }
    path.push(E.moveToSan(p.st, mv));
    $('err').textContent = '';
    renderExplorer();
    return true;
  }

  /* ---------- library ---------- */
  var fSide = 'all', fQuery = '';
  function renderLibrary() {
    var q = fQuery.trim().toLowerCase();
    var list = TRAPS.filter(function (t) {
      if (fSide !== 'all' && t.side !== fSide) return false;
      if (!q) return true;
      return (t.name + ' ' + t.opening + ' ' + t.eco + ' ' + t.line.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    $('libcount').textContent = list.length + ' of ' + TRAPS.length + ' shown';
    $('grid').innerHTML = list.length ? list.map(function (t) {
      return '<button class="trap" data-id="' + t.id + '"><div class="row1">' + sideTag(t) +
        '<span class="nm">' + esc(t.name) + '</span></div>' +
        '<div class="meta">' + esc(t.opening) + ' · ' + t.eco + '</div>' +
        '<div class="st">' + OUTCOME[t.outcome] + ' · ' + t.line.length + ' plies</div></button>';
    }).join('') : '<p class="empty-note">Nothing matches that search.</p>';
  }

  /* ---------- viewer ---------- */
  var vTrap = null, vPly = 0;
  function openTrap(id) {
    vTrap = BY_ID[id];
    vPly = 0;
    $('overlay').hidden = false;
    document.body.style.overflow = 'hidden';
    renderViewer();
  }
  function closeTrap() {
    $('overlay').hidden = true;
    document.body.style.overflow = '';
    vTrap = null;
  }
  function renderViewer() {
    var t = vTrap;
    if (!t) return;
    var p = posAfter(t.line, vPly);
    drawBoard($('v-board'), p.st, p.last, t.side === 'b');
    $('v-name').textContent = t.name;
    $('v-meta').innerHTML = sideTag(t) + ' ' + esc(t.opening) + ' · ' + t.eco + ' · ' +
      OUTCOME[t.outcome] + ' · material ' + finalEdge(t) + ' at the end';

    var strip = '';
    for (var i = 0; i < t.line.length; i++) {
      var cls = 'm';
      if (i === vPly - 1) cls += ' cur';
      if (i === t.blunder) cls += ' bl';
      if (i === t.punish) cls += ' pu';
      if (i % 2 === 0) strip += '<span class="n">' + moveNo(i) + '.</span> ';
      strip += '<span class="' + cls + '" data-ply="' + (i + 1) + '">' + esc(t.line[i]) + '</span> ';
    }
    $('v-strip').innerHTML = strip;

    var out = '';
    if (vPly > 0 && t.notes && t.notes[vPly - 1]) {
      var k = vPly - 1, nc = k === t.blunder ? ' blunder' : (k === t.punish ? ' punish' : '');
      out += '<div class="note' + nc + '"><b>' + moveNo(k) + (k % 2 ? '...' : '.') + ' ' +
        esc(t.line[k]) + '</b> — ' + esc(t.notes[k]) + '</div>';
    }
    if (vPly - 1 === t.blunder) {
      out += '<div class="note blunder"><b>This is the mistake.</b> ' + esc(t.better) + '</div>';
    }
    if (vPly === t.line.length) {
      out += '<div class="note punish"><b>Result:</b> ' + resultLine(t) + '</div>';
    }
    out += '<dl><dt>Idea</dt><dd>' + esc(t.summary) + '</dd>' +
      '<dt>How the other side avoids it</dt><dd>' + esc(t.better) + '</dd></dl>';
    $('v-notes').innerHTML = out;
    $('v-prev').disabled = vPly === 0;
    $('v-start').disabled = vPly === 0;
    $('v-next').disabled = vPly >= t.line.length;
    $('v-end').disabled = vPly >= t.line.length;
  }

  /* ---------- wiring ---------- */
  function on(el, ev, fn) { el.addEventListener(ev, fn); }

  on($('entry'), 'submit', function (e) {
    e.preventDefault();
    var v = $('movein').value.trim();
    if (!v) return;
    if (tryMove(v)) $('movein').value = '';
    $('movein').focus();
  });
  on($('choices'), 'click', function (e) {
    var b = e.target.closest('.mv');
    if (b) tryMove(b.dataset.san);
  });
  on($('alerts'), 'click', function (e) {
    var p = e.target.closest('.play');
    if (p) return tryMove(p.dataset.san);
    var o = e.target.closest('.play-open');
    if (o) openTrap(o.dataset.id);
  });
  on($('matches'), 'click', function (e) {
    var b = e.target.closest('.trap');
    if (b) openTrap(b.dataset.id);
  });
  on($('grid'), 'click', function (e) {
    var b = e.target.closest('.trap');
    if (b) openTrap(b.dataset.id);
  });
  on($('pgn'), 'click', function (e) {
    var m = e.target.closest('.m');
    if (m) { path = path.slice(0, +m.dataset.ply); $('err').textContent = ''; renderExplorer(); }
  });
  on($('undo'), 'click', function () { path.pop(); $('err').textContent = ''; renderExplorer(); });
  on($('reset'), 'click', function () { path = []; $('err').textContent = ''; renderExplorer(); });
  on($('flip'), 'click', function () { flipped = !flipped; renderExplorer(); });

  on($('v-close'), 'click', closeTrap);
  on($('overlay'), 'click', function (e) { if (e.target === $('overlay')) closeTrap(); });
  on($('v-prev'), 'click', function () { if (vPly > 0) { vPly--; renderViewer(); } });
  on($('v-next'), 'click', function () { if (vTrap && vPly < vTrap.line.length) { vPly++; renderViewer(); } });
  on($('v-start'), 'click', function () { vPly = 0; renderViewer(); });
  on($('v-end'), 'click', function () { vPly = vTrap.line.length; renderViewer(); });
  on($('v-strip'), 'click', function (e) {
    var m = e.target.closest('.m');
    if (m) { vPly = +m.dataset.ply; renderViewer(); }
  });
  on($('v-load'), 'click', function () {
    path = vTrap.line.slice(0, vTrap.blunder);
    closeTrap();
    showTab('explore');
    renderExplorer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  on(document, 'keydown', function (e) {
    if (!$('overlay').hidden) {
      if (e.key === 'Escape') closeTrap();
      if (e.key === 'ArrowLeft' && vPly > 0) { vPly--; renderViewer(); }
      if (e.key === 'ArrowRight' && vTrap && vPly < vTrap.line.length) { vPly++; renderViewer(); }
    }
  });

  function showTab(which) {
    $('view-explore').hidden = which !== 'explore';
    $('view-library').hidden = which !== 'library';
    $('tab-explore').setAttribute('aria-selected', which === 'explore');
    $('tab-library').setAttribute('aria-selected', which === 'library');
  }
  on($('tab-explore'), 'click', function () { showTab('explore'); });
  on($('tab-library'), 'click', function () { showTab('library'); renderLibrary(); });
  on($('search'), 'input', function (e) { fQuery = e.target.value; renderLibrary(); });
  on($('seg'), 'click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    fSide = b.dataset.side;
    [].forEach.call($('seg').children, function (c) { c.setAttribute('aria-pressed', c === b); });
    renderLibrary();
  });

  $('tab-library').textContent = 'Library (' + TRAPS.length + ')';
  renderExplorer();
  renderLibrary();
})();
