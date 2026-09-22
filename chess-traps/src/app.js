/* Chess Opening Traps: explorer, library, viewer and quiz. */
(function () {
  'use strict';
  var E = window.Engine, TRAPS = window.TRAPS, EVALS = window.TRAP_EVALS || {};
  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  /* U+FE0E asks for the text glyph. Without it iOS and Android draw the pawn as a colour emoji
     that ignores CSS colour, so white pawns would come out black. */
  var TEXT = '︎';
  var VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var PIECE = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  var SIDE = { w: 'White', b: 'Black' };
  var OUTCOME = { mate: 'Checkmate', material: 'Wins material', attack: 'Advantage', even: 'Equalises' };
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function moveNo(ply) { return Math.floor(ply / 2) + 1; }
  function label(ply, san) { return moveNo(ply) + (ply % 2 ? '...' : '.') + san; }
  function mover(ply) { return ply % 2 ? 'b' : 'w'; }
  function lichessUrl(st, side) {
    return 'https://lichess.org/analysis/' + E.fen(st).replace(/ /g, '_') + (side === 'b' ? '?color=black' : '');
  }
  /* Engine score (centipawns, or {mate:n}) as the usual +1.4 / #3 notation. */
  function evalText(v) {
    if (v === null || v === undefined) return '';
    if (v === '#') return 'mate';
    if (typeof v === 'object') return (v.mate > 0 ? 'mate in ' : 'mated in ') + Math.abs(v.mate);
    return (v > 0 ? '+' : v < 0 ? '−' : '') + (Math.abs(v) / 100).toFixed(1);
  }

  var store = {
    get: function (k, d) {
      try { var v = window.localStorage.getItem('chesstraps.' + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem('chesstraps.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
    }
  };

  /* ---------- trap data: replay every line once, index every position ---------- */
  function material(st) {
    var d = 0;
    for (var sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      var p = st.board[sq];
      if (p) d += (p.color === 'w' ? 1 : -1) * VAL[p.type];
    }
    return d;
  }
  var INDEX = {}, BY_ID = {};
  TRAPS.forEach(function (t) {
    BY_ID[t.id] = t;
    t.states = [E.newGame()];
    t.moves = [];
    t.line.forEach(function (san, i) {
      var mv = E.sanToMove(t.states[i], san);
      t.moves.push(mv);
      t.states.push(E.makeMove(t.states[i], mv));
    });
    t.states.forEach(function (st, k) {
      var key = E.positionKey(st);
      (INDEX[key] || (INDEX[key] = [])).push({ t: t, k: k });
    });
    t.edge = material(t.states[t.line.length]) * (t.side === 'w' ? 1 : -1);
    t.ev = EVALS[t.id] || null;
    /* risky: the set-up leaves the trapping side worse if the opponent finds the best move */
    t.risky = !!(t.ev && typeof t.ev.before === 'number' && t.ev.before < -50);
  });

  function edgeText(n) { return n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '0'; }
  function outcomeLine(t) {
    if (t.outcome === 'mate') return 'Checkmate for ' + SIDE[t.side] + '.';
    if (t.outcome === 'material') return SIDE[t.side] + ' comes out ' + edgeText(t.edge) + ' in material.';
    if (t.outcome === 'even') return SIDE[t.side] + ' has equalised and the material is level.';
    return SIDE[t.side] + ' has the better game' + (t.ev ? ' (engine ' + evalText(t.ev.final) + ')' : '') +
      '. Material here is ' + edgeText(t.edge) + ': the edge is in activity and king safety, not the count.';
  }

  /* ---------- board ---------- */
  function Board(host, opts) {
    opts = opts || {};
    this.host = host;
    this.onMove = opts.onMove || null;
    this.mini = !!opts.mini;
    this.st = E.newGame();
    this.flipped = false; this.last = null; this.arrows = []; this.hint = -1;
    this.interactive = false; this.sel = -1; this.promo = null; this.legal = [];
    host.classList.add('board');
    if (this.mini) host.classList.add('mini');
    else host.setAttribute('aria-label', 'Chess board');
    var self = this;
    if (!this.mini) host.addEventListener('click', function (e) { self.click(e); });
  }
  Board.prototype.set = function (o) {
    this.st = o.st;
    this.last = o.last || null;
    this.flipped = !!o.flipped;
    this.arrows = o.arrows || [];
    this.hint = o.hint === undefined ? -1 : o.hint;
    this.interactive = !!o.interactive && !E.isMate(o.st);
    this.legal = this.interactive ? E.legalMoves(o.st) : [];
    this.sel = -1;
    this.promo = null;
    this.render();
  };
  Board.prototype.render = function () {
    this.host.innerHTML = boardHtml(this);
    this.host.classList.toggle('live', this.interactive);
  };
  Board.prototype.click = function (e) {
    if (!this.interactive) return;
    var pick = e.target.closest('[data-promo]');
    if (pick && this.promo) {
      var want = pick.getAttribute('data-promo');
      var mv = this.promo.moves.filter(function (m) { return m.promotion === want; })[0];
      if (mv) return this.commit(mv);
    }
    if (this.promo) { this.promo = null; this.sel = -1; return this.render(); }
    var el = e.target.closest('.sq');
    if (!el) return;
    var sq = +el.getAttribute('data-sq'), p = this.st.board[sq], from = this.sel;
    if (from >= 0 && sq !== from) {
      var c = this.legal.filter(function (m) { return m.from === from && m.to === sq; });
      if (c.length === 1) return this.commit(c[0]);
      if (c.length > 1) { this.promo = { moves: c }; return this.render(); }
    }
    this.sel = (p && p.color === this.st.turn && sq !== from) ? sq : -1;
    this.render();
  };
  Board.prototype.commit = function (mv) {
    this.sel = -1;
    this.promo = null;
    if (this.onMove) this.onMove(mv);
  };

  function boardHtml(b) {
    var st = b.st, html = '', targets = {};
    if (b.sel >= 0) {
      b.legal.forEach(function (m) {
        if (m.from === b.sel) targets[m.to] = (m.captured ? ' cap' : ' tgt');
      });
    }
    var chk = E.inCheck(st, st.turn) ? E.findKing(st.board, st.turn) : -1;
    for (var i = 0; i < 64; i++) {
      var row = i >> 3, col = i & 7;
      var r = b.flipped ? 7 - row : row, f = b.flipped ? 7 - col : col;
      var sq = r * 16 + f, p = st.board[sq];
      var cls = 'sq ' + ((r + f) % 2 === 0 ? 'l' : 'd');
      if (b.last && sq === b.last.from) cls += ' from';
      if (b.last && sq === b.last.to) cls += ' to';
      if (sq === b.sel) cls += ' sel';
      if (sq === chk) cls += ' chk';
      if (sq === b.hint) cls += ' hint';
      if (targets[sq]) cls += targets[sq];
      if (b.interactive && p && p.color === st.turn) cls += ' own';
      var inner = p ? '<span class="pc ' + p.color + '">' + GLYPH[p.type] + TEXT + '</span>' : '';
      if (!b.mini) {
        if (row === 7) inner += '<span class="co f">' + 'abcdefgh'[f] + '</span>';
        if (col === 0) inner += '<span class="co r">' + (8 - r) + '</span>';
      }
      html += '<div class="' + cls + '" data-sq="' + sq + '">' + inner + '</div>';
    }
    html += arrowsSvg(b.arrows, b.flipped);
    if (b.promo) {
      html += '<div class="promo" role="dialog" aria-label="Promote to">' + ['q', 'r', 'b', 'n'].map(function (t) {
        return '<button type="button" data-promo="' + t + '" title="' + PIECE[t] + '"><span class="pc ' + st.turn + '">' +
          GLYPH[t] + TEXT + '</span></button>';
      }).join('') + '</div>';
    }
    return html;
  }

  /* Arrows are drawn with explicit polygons rather than SVG markers, so several boards on one
     page never fight over marker ids. Coordinates are in squares: the board is 8 x 8 units. */
  function centre(sq, flipped) {
    var f = sq & 15, r = sq >> 4;
    return { x: (flipped ? 7 - f : f) + 0.5, y: (flipped ? 7 - r : r) + 0.5 };
  }
  function n2(v) { return Math.round(v * 1000) / 1000; }
  function arrowsSvg(arrows, flipped) {
    if (!arrows || !arrows.length) return '';
    var s = '<svg class="arrows" viewBox="0 0 8 8" aria-hidden="true" focusable="false">';
    arrows.forEach(function (a) {
      var f = centre(a.from, flipped), t = centre(a.to, flipped);
      var dx = t.x - f.x, dy = t.y - f.y, len = Math.sqrt(dx * dx + dy * dy);
      var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      var tipX = t.x - ux * 0.12, tipY = t.y - uy * 0.12;
      var bx = tipX - ux * 0.44, by = tipY - uy * 0.44, hw = 0.25;
      var sx = f.x + ux * 0.2, sy = f.y + uy * 0.2;
      s += '<g class="ar ' + a.kind + '"><line x1="' + n2(sx) + '" y1="' + n2(sy) + '" x2="' + n2(bx) + '" y2="' + n2(by) +
        '"/><polygon points="' + [tipX, tipY, bx + nx * hw, by + ny * hw, bx - nx * hw, by - ny * hw].map(n2).join(' ') + '"/></g>';
    });
    return s + '</svg>';
  }

  /* ---------- explorer ---------- */
  var X = { side: store.get('side', 'w') === 'b' ? 'b' : 'w', flip: false, hist: [], states: [E.newGame()], moves: [], cur: 0 };
  (function restore() {
    var saved = store.get('hist', []), cur = store.get('cur', 0);
    if (!Array.isArray(saved)) return;
    for (var i = 0; i < saved.length && i < 400; i++) {
      var mv = E.sanToMove(X.states[i], saved[i]);
      if (!mv) break;
      X.hist.push(E.moveToSan(X.states[i], mv));
      X.moves.push(mv);
      X.states.push(E.makeMove(X.states[i], mv));
    }
    X.cur = Math.max(0, Math.min(X.hist.length, cur | 0));
  })();
  function saveExplorer() { store.set('side', X.side); store.set('hist', X.hist); store.set('cur', X.cur); }

  /* The side's traps that pass through this exact position, whatever the move order. */
  function hitsAt(st, side) {
    var seen = {};
    return (INDEX[E.positionKey(st)] || []).filter(function (h) {
      if (h.t.side !== side || seen[h.t.id]) return false;
      return (seen[h.t.id] = true);
    });
  }
  function statusOf(h) {
    var t = h.t, k = h.k;
    if (k < t.blunder) return 'open';
    if (k === t.blunder) return 'armed';
    if (k <= t.punish) return 'sprung';
    return k < t.line.length ? 'after' : 'done';
  }
  /* Next moves in the book. For the trapping side: the refutation (good) or a set-up move (info).
     For the opponent: the losing move (bad) or an ordinary book reply. */
  function bookMoves(hits, st) {
    var map = {}, list = [];
    hits.forEach(function (h) {
      var t = h.t, k = h.k;
      if (k >= t.line.length) return;
      var san = t.line[k];
      var o = map[san];
      if (!o) {
        o = map[san] = { san: san, mv: E.sanToMove(st, san), traps: [], good: false, bad: false, punish: false };
        list.push(o);
      }
      o.traps.push(t);
      if (mover(k) === t.side && k >= t.punish) o.good = true;
      if (k === t.punish && k > t.blunder) o.punish = true;
      if (k === t.blunder) o.bad = true;
    });
    return list.filter(function (o) { return o.mv; }).sort(function (a, b) {
      return (b.good - a.good) || (b.bad - a.bad) || (b.traps.length - a.traps.length) || a.san.localeCompare(b.san);
    });
  }

  var xBoard = new Board($('board'), { onMove: function (mv) { xPlay(mv); } });

  function xPlay(mv) {
    var st = X.states[X.cur], san = E.moveToSan(st, mv);
    if (X.hist[X.cur] !== san) {
      X.hist = X.hist.slice(0, X.cur).concat(san);
      X.moves = X.moves.slice(0, X.cur).concat(mv);
      X.states = X.states.slice(0, X.cur + 1).concat(E.makeMove(st, mv));
    }
    X.cur++;
    $('err').textContent = '';
    saveExplorer();
    renderExplorer();
  }
  function xTyped(text) {
    var st = X.states[X.cur], mv = E.sanToMove(st, text);
    if (!mv) {
      $('err').textContent = '“' + text + '” is not a legal move for ' + SIDE[st.turn] +
        ' here. Try standard notation (e4, Nf3, Bxf7+, O-O) or tap the board.';
      return false;
    }
    xPlay(mv);
    return true;
  }
  function xGo(n) {
    X.cur = Math.max(0, Math.min(X.hist.length, n));
    $('err').textContent = '';
    saveExplorer();
    renderExplorer();
  }
  function lastBookPly() {
    for (var n = X.cur - 1; n >= 0; n--) if (hitsAt(X.states[n], X.side).length) return n;
    return 0;
  }

  function renderExplorer() {
    var st = X.states[X.cur], side = X.side, mine = st.turn === side, n = X.cur;
    var hits = hitsAt(st, side), book = bookMoves(hits, st);
    var mate = E.isMate(st), dead = !mate && !E.legalMoves(st).length;

    var arrows = [];
    if (mine) {
      var show = book.filter(function (o) { return o.good; });
      if (!show.length && book.length <= 3) show = book;
      show.forEach(function (o) { arrows.push({ from: o.mv.from, to: o.mv.to, kind: o.good ? 'good' : 'info' }); });
    } else {
      book.forEach(function (o) { if (o.bad) arrows.push({ from: o.mv.from, to: o.mv.to, kind: 'bad' }); });
    }
    xBoard.set({ st: st, last: n ? X.moves[n - 1] : null, flipped: (side === 'b') !== X.flip, arrows: arrows, interactive: true });

    [].forEach.call($('sideSeg').children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-side') === side); });
    var turn = mate ? 'Checkmate. ' + SIDE[st.turn === 'w' ? 'b' : 'w'] + ' wins.'
      : dead ? 'Stalemate.'
      : (mine ? 'Your move' : 'Opponent to move') + ' (' + SIDE[st.turn] + ')' + (E.inCheck(st, st.turn) ? ', in check' : '');
    $('turn').innerHTML = '<span class="dot ' + st.turn + '"></span>' + esc(turn);
    $('ply').textContent = n ? 'after ' + label(n - 1, X.hist[n - 1]) : 'start position';
    $('back').disabled = n === 0;
    $('fwd').disabled = n >= X.hist.length;
    $('reset').disabled = !X.hist.length;
    $('xLichess').href = lichessUrl(st, side);

    /* move list */
    var pgn = '';
    X.hist.forEach(function (san, i) {
      if (i % 2 === 0) pgn += '<span class="n">' + moveNo(i) + '.</span>';
      pgn += '<button type="button" class="m' + (i === n - 1 ? ' cur' : '') + (i >= n ? ' future' : '') +
        '" data-ply="' + (i + 1) + '">' + esc(san) + '</button>';
    });
    $('pgn').innerHTML = pgn || '<span class="empty">No moves yet.</span>';

    /* input panel */
    $('inputHdr').textContent = mate || dead ? 'Game over' : mine ? 'Your move' : 'Opponent’s move';
    $('movein').placeholder = mine ? 'Your move, e.g. Nf3' : 'Opponent’s move, e.g. e5';
    var hdr = '';
    if (mate || dead) hdr = '';
    else if (book.length) hdr = mine ? 'Book moves that keep your traps alive' : 'What they might play (red = walks into a trap)';
    else if (hits.length) hdr = 'End of the book line.';
    $('choicesHdr').textContent = hdr;
    $('choices').innerHTML = book.map(function (o) {
      var cap = o.punish ? 'punish' : o.good ? 'keep going'
        : o.bad ? '?? ' + o.traps.map(function (t) { return t.name; }).join(', ')
        : o.traps.length + (o.traps.length === 1 ? ' trap' : ' traps');
      return '<button type="button" class="mv' + (o.good ? ' good' : '') + (o.bad ? ' bad' : '') + '" data-san="' + esc(o.san) + '">' +
        '<b>' + esc(label(n, o.san)) + '</b><i>' + esc(cap) + '</i></button>';
    }).join('');

    /* the moment of truth: the opponent has blundered and the refutation is on */
    var live = mine ? hits.filter(function (h) { return h.k === h.t.punish && h.k > h.t.blunder; }) : [];
    $('alerts').innerHTML = live.map(function (h) {
      var t = h.t, san = t.line[t.punish];
      return '<div class="alert"><div class="alert-h">They fell for it: ' + esc(t.name) + '</div>' +
        '<p>' + esc(SIDE[other(t.side)]) + '\u2019s <b>' + esc(glabel(h, n, t.blunder)) + '</b> was the mistake. Punish it with <b>' +
        esc(glabel(h, n, t.punish)) + '</b>. ' + esc(OUTCOME[t.outcome]) + (t.ev && t.outcome !== 'mate' ? ', engine ' + esc(evalText(t.ev.final)) : '') + '.</p>' +
        '<div class="row"><button type="button" class="btn primary" data-play="' + esc(san) + '">Play ' + esc(san) + '</button>' +
        '<button type="button" class="btn" data-open="' + t.id + '" data-k="' + h.k + '">See the whole line</button></div></div>';
    }).join('');

    /* trap list */
    var sideTraps = TRAPS.filter(function (t) { return t.side === side; }).length;
    $('matchHdr').textContent = hits.length
      ? (n ? hits.length + ' of your ' + sideTraps + ' ' + SIDE[side] + ' traps still possible' : 'Your ' + sideTraps + ' traps as ' + SIDE[side])
      : 'No traps from here';
    if (!hits.length) {
      var back = lastBookPly();
      $('matches').innerHTML = '<p class="empty-note">Out of book. None of your ' + SIDE[side] +
        ' traps passes through this position, in any move order.</p>' +
        (n ? '<button type="button" class="btn" data-goto="' + back + '">Back to the last book position (' +
          (back ? esc(label(back - 1, X.hist[back - 1])) : 'start') + ')</button>' : '');
    } else {
      var rank = { sprung: 0, armed: 1, after: 2, open: 3, done: 4 };
      $('matches').innerHTML = hits.slice().sort(function (a, b) {
        return (rank[statusOf(a)] - rank[statusOf(b)]) || ((a.t.blunder - a.k) - (b.t.blunder - b.k)) || a.t.name.localeCompare(b.t.name);
      }).map(function (h) { return trapRow(h, n); }).join('');
    }
    $('undoHint').hidden = !n;
  }

  /* Label for ply j of a trap line, numbered as in the game on the board (a transposition can
     reach the same position after a different number of moves). */
  function glabel(h, n, j) { return label(n + (j - h.k), h.t.line[j]); }
  function trapRow(h, n) {
    var t = h.t, k = h.k, st = statusOf(h), note;
    var nxt = k < t.line.length ? glabel(h, n, k) : '';
    var whoNext = k < t.line.length ? (mover(k) === t.side ? 'you' : 'them') : '';
    if (st === 'armed') note = '<div class="st armed">Their move. ' + esc(glabel(h, n, t.blunder)) + '?? loses</div>';
    else if (st === 'sprung') note = '<div class="st sprung">' + (k === t.punish ? 'They fell for it. Play ' + esc(glabel(h, n, t.punish))
      : 'They fell for it. Next: ' + esc(nxt) + ' (' + whoNext + ')') + '</div>';
    else if (st === 'after') note = '<div class="st sprung">Refutation under way. Next: ' + esc(nxt) + ' (' + whoNext + ')</div>';
    else if (st === 'done') note = '<div class="st sprung">Line complete: ' + esc(OUTCOME[t.outcome].toLowerCase()) + '</div>';
    else note = '<div class="st">Next: ' + esc(nxt) + ' (' + whoNext + '). Their mistake comes at ' +
      esc(glabel(h, n, t.blunder)) + '</div>';
    return '<button type="button" class="trap" data-open="' + t.id + '" data-k="' + k + '"><div class="row1">' +
      '<span class="nm">' + esc(t.name) + '</span>' + outcomeTag(t) + '</div>' +
      '<div class="meta">' + esc(t.opening) + ' · ' + t.eco + '</div>' + note + '</button>';
  }
  function outcomeTag(t) {
    var v = t.ev && t.outcome !== 'mate' && typeof t.ev.final === 'number' ? ' ' + evalText(t.ev.final) : '';
    return '<span class="tag o ' + t.outcome + '">' + OUTCOME[t.outcome] + esc(v) + '</span>' +
      (t.risky ? '<span class="tag risky" title="Objectively dubious: if the opponent plays well you are worse">Risky</span>' : '');
  }
  function other(s) { return s === 'w' ? 'b' : 'w'; }

  /* ---------- learned ---------- */
  var learned = {};
  (store.get('learned', []) || []).forEach(function (id) { if (BY_ID[id]) learned[id] = true; });
  function setLearned(id, on) {
    if (on) learned[id] = true; else delete learned[id];
    store.set('learned', Object.keys(learned));
  }

  /* ---------- library ---------- */
  var L = { side: store.get('libSide', 'all'), outcome: 'all', sort: store.get('libSort', 'eco'), hide: false, q: '' };
  /* Thumbnail: the position where the trapping side strikes, with the refutation drawn in. */
  TRAPS.forEach(function (t) {
    var k = t.punish, b = { st: t.states[k], last: t.moves[k - 1], flipped: t.side === 'b', sel: -1, legal: [], hint: -1,
      arrows: [{ from: t.moves[k].from, to: t.moves[k].to, kind: 'good' }], mini: true, interactive: false };
    t.thumb = boardHtml(b);
  });
  function renderLibrary() {
    var q = L.q.trim().toLowerCase();
    var list = TRAPS.filter(function (t) {
      if (L.side !== 'all' && t.side !== L.side) return false;
      if (L.outcome !== 'all' && t.outcome !== L.outcome) return false;
      if (L.hide && learned[t.id]) return false;
      return !q || (t.name + ' ' + t.opening + ' ' + t.eco + ' ' + t.line.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    list.sort(function (a, b) {
      if (L.sort === 'name') return a.name.localeCompare(b.name);
      if (L.sort === 'short') return (a.line.length - b.line.length) || a.name.localeCompare(b.name);
      return a.eco.localeCompare(b.eco) || a.name.localeCompare(b.name);
    });
    var done = Object.keys(learned).length;
    $('libcount').textContent = list.length + ' shown · ' + done + ' of ' + TRAPS.length + ' learned';
    $('progress').style.width = (100 * done / TRAPS.length) + '%';
    $('grid').innerHTML = list.length ? list.map(function (t) {
      return '<button type="button" class="tcard' + (learned[t.id] ? ' is-learned' : '') + '" data-open="' + t.id + '" data-k="0">' +
        '<div class="board mini" aria-hidden="true">' + t.thumb + '</div><div class="tbody">' +
        '<div class="row1"><span class="tag ' + t.side + '">' + SIDE[t.side] + '</span>' + outcomeTag(t) +
        (learned[t.id] ? '<span class="tick" title="Learned">✓</span>' : '') + '</div>' +
        '<div class="nm">' + esc(t.name) + '</div>' +
        '<div class="meta">' + esc(t.opening) + ' · ' + t.eco + ' · ' + Math.ceil(t.line.length / 2) + ' moves</div></div></button>';
    }).join('') : '<p class="empty-note">Nothing matches.</p>';
    [].forEach.call($('libSide').children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-side') === L.side); });
  }

  /* ---------- viewer: study and quiz ---------- */
  var V = { t: null, ply: 0, mode: 'study', timer: null, auto: null, q: null, opener: null };
  var vBoard = new Board($('vBoard'), { onMove: function (mv) { quizMove(mv); } });

  function openTrap(id, ply, mode) {
    V.t = BY_ID[id];
    if (!V.t) return;
    V.opener = document.activeElement;
    V.ply = Math.max(0, Math.min(V.t.line.length, ply || 0));
    setMode(mode || 'study');
    $('overlay').hidden = false;
    document.body.classList.add('modal-open');
    $('vClose').focus();
  }
  function closeTrap() {
    stopTimers();
    $('overlay').hidden = true;
    document.body.classList.remove('modal-open');
    V.t = null;
    if (V.opener && V.opener.focus && document.body.contains(V.opener)) V.opener.focus();
    renderLibrary();
  }
  function stopTimers() {
    if (V.timer) { clearTimeout(V.timer); V.timer = null; }
    if (V.auto) { clearInterval(V.auto); V.auto = null; }
  }
  function setMode(mode) {
    stopTimers();
    V.mode = mode;
    if (mode === 'quiz') {
      V.ply = 0;
      V.q = { mistakes: 0, tries: 0, msg: 'Play the ' + SIDE[V.t.side] + ' moves. The opponent’s replies are played for you.', tone: 'info', shown: false };
      $('qIn').value = '';
      quizAdvance();
    }
    renderViewer();
  }

  /* Opponent moves in the quiz are played automatically, with a short pause so they can be followed. */
  function quizAdvance() {
    var t = V.t;
    if (!t || V.mode !== 'quiz') return;
    if (V.ply >= t.line.length) return quizDone();
    if (mover(V.ply) === t.side) { renderViewer(); return; }
    V.timer = setTimeout(function () {
      V.timer = null;
      if (!V.t || V.mode !== 'quiz') return;
      var k = V.ply;
      V.ply++;
      if (k === t.blunder) {
        V.q.msg = SIDE[mover(k)] + ' plays ' + label(k, t.line[k]) + '?? That is the mistake. Find the punishment.';
        V.q.tone = 'warn';
      }
      quizAdvance();
      renderViewer();
    }, 550);
  }
  function quizMove(mv) {
    var t = V.t;
    if (!t || V.mode !== 'quiz' || V.timer) return;
    var k = V.ply, st = t.states[k], san = E.moveToSan(st, mv), after = E.makeMove(st, mv);
    var mates = E.isMate(after);
    if (san === t.line[k] || mates) {
      /* any checkmate is accepted; if it differs from the book move, show the position actually reached */
      if (mates && san !== t.line[k]) V.q.final = { st: after, last: mv };
      V.ply = mates ? t.line.length : k + 1;
      V.q.tries = 0;
      var note = t.notes && t.notes[k] && san === t.line[k] ? ' ' + t.notes[k] : '';
      V.q.msg = (mates ? 'Checkmate. ' : 'Correct: ' + label(k, san) + '.') + note;
      V.q.tone = 'ok';
      $('qIn').value = '';
      quizAdvance();
    } else {
      V.q.mistakes++;
      V.q.tries++;
      V.q.msg = label(k, san) + ' is not the move in this line.' + (V.q.tries >= 2
        ? ' Hint: the ' + PIECE[t.moves[k].piece] + ' on ' + E.sqName(t.moves[k].from) + ' moves.'
        : ' Try again.');
      V.q.tone = 'bad';
    }
    renderViewer();
  }
  function quizReveal() {
    var t = V.t;
    if (!t || V.mode !== 'quiz' || V.timer || V.ply >= t.line.length || mover(V.ply) !== t.side) return;
    V.q.mistakes++;
    V.q.shown = true;
    var k = V.ply;
    V.ply++;
    V.q.tries = 0;
    V.q.msg = 'The move is ' + label(k, t.line[k]) + '.' + (t.notes && t.notes[k] ? ' ' + t.notes[k] : '');
    V.q.tone = 'info';
    quizAdvance();
    renderViewer();
  }
  function quizDone() {
    var t = V.t, m = V.q.mistakes;
    V.q.done = true;
    if (m === 0) setLearned(t.id, true);
    V.q.msg = (m === 0 ? 'Flawless. Marked as learned.' : 'Line complete with ' + m + (m === 1 ? ' mistake.' : ' mistakes.') +
      ' Run it again until it is clean.') + ' ' + outcomeLine(t);
    V.q.tone = m === 0 ? 'ok' : 'info';
    renderViewer();
  }

  function renderViewer() {
    var t = V.t;
    if (!t) return;
    var k = V.ply, quiz = V.mode === 'quiz', end = k >= t.line.length;
    var alt = quiz && end && V.q.final, st = alt ? V.q.final.st : t.states[k];
    var yourTurn = quiz && !end && !V.timer && mover(k) === t.side;
    var arrows = [];
    if (!quiz && !end) arrows.push({ from: t.moves[k].from, to: t.moves[k].to, kind: k === t.blunder ? 'bad' : (k >= t.punish && mover(k) === t.side) ? 'good' : 'info' });
    vBoard.set({ st: st, last: alt ? V.q.final.last : k ? t.moves[k - 1] : null, flipped: t.side === 'b', arrows: arrows, interactive: yourTurn,
      hint: quiz && yourTurn && V.q.tries >= 2 ? t.moves[k].from : -1 });

    $('vName').textContent = t.name;
    $('vMeta').innerHTML = '<span class="tag ' + t.side + '">' + SIDE[t.side] + '</span> ' + esc(t.opening) + ' · ' + t.eco + ' ' + outcomeTag(t);
    [].forEach.call($('vModes').children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === V.mode); });
    $('vStudyCtrls').hidden = quiz;
    $('vQuizCtrls').hidden = !quiz;
    $('qIn').disabled = !yourTurn;
    $('qShow').disabled = !yourTurn;
    $('vAuto').textContent = V.auto ? '❚❚' : '▶';
    $('vAuto').title = V.auto ? 'Pause' : 'Play through';

    /* move strip: in the quiz only what has been played is shown */
    var strip = '';
    var upto = quiz ? k : t.line.length;
    for (var i = 0; i < upto; i++) {
      var cls = 'm' + (i === k - 1 ? ' cur' : '') + (i === t.blunder ? ' bl' : '') + (i === t.punish ? ' pu' : '');
      if (i % 2 === 0) strip += '<span class="n">' + moveNo(i) + '.</span>';
      strip += quiz ? '<span class="' + cls + '">' + esc(t.line[i]) + '</span>'
        : '<button type="button" class="' + cls + '" data-ply="' + (i + 1) + '">' + esc(t.line[i]) + '</button>';
    }
    if (quiz && !end) strip += (k % 2 === 0 ? '<span class="n">' + moveNo(k) + '.</span>' : '') + '<span class="m q">?</span>';
    $('vStrip').innerHTML = strip;

    /* notes */
    var out = '';
    if (quiz) {
      out += '<div class="fb ' + V.q.tone + '" role="status">' + esc(V.q.msg) + '</div>';
      if (V.q.done) out += ideaBlock(t);
    } else {
      if (k === 0) out += '<p class="lead">' + esc(t.summary) + '</p>';
      if (k > 0 && t.notes && t.notes[k - 1]) {
        var j = k - 1;
        out += '<div class="note' + (j === t.blunder ? ' blunder' : j === t.punish ? ' punish' : '') + '"><b>' +
          esc(label(j, t.line[j])) + '</b> ' + esc(t.notes[j]) + '</div>';
      }
      if (k - 1 === t.blunder) out += '<div class="note blunder"><b>This is the mistake.</b> ' +
        (t.ev ? 'Before it, ' + esc(label(t.blunder, t.ev.best)) + ' was best (' + esc(evalText(t.ev.before)) + ' for ' + SIDE[t.side] + '); now it is ' + esc(evalText(t.ev.after)) + '. ' : '') +
        'See below for how to avoid it.</div>';
      if (end) out += '<div class="note punish"><b>Result.</b> ' + esc(outcomeLine(t)) + '</div>';
      if (k > 0) out += ideaBlock(t);
    }
    $('vNotes').innerHTML = out;
    $('vLearned').checked = !!learned[t.id];
    $('vLichess').href = lichessUrl(st, t.side);
    $('vPrev').disabled = $('vStart').disabled = k === 0;
    $('vNext').disabled = $('vEnd').disabled = end;
  }
  function ideaBlock(t) {
    var ev = t.ev ? '<dt>Engine check</dt><dd>' + esc(engineLine(t)) + '</dd>' : '';
    return '<dl><dt>The idea</dt><dd>' + esc(t.summary) + '</dd><dt>How the other side avoids it</dt><dd>' + esc(t.better) + '</dd>' + ev + '</dl>';
  }
  function engineLine(t) {
    var e = t.ev, me = SIDE[t.side];
    var s = 'Stockfish at depth ' + e.depth + ', scores from ' + me + '’s side. If they find ' +
      label(t.blunder, e.best) + ': ' + evalText(e.before) + '. After ' + label(t.blunder, t.line[t.blunder]) + ': ' +
      evalText(e.after) + '. End of the line: ' + evalText(e.final) + '.';
    if (t.risky) s += ' The set-up is objectively dubious: against correct play you are the one who is worse.';
    return s;
  }
  function step(d) {
    if (!V.t || V.mode !== 'study') return;
    V.ply = Math.max(0, Math.min(V.t.line.length, V.ply + d));
    renderViewer();
  }
  function toggleAuto() {
    if (V.auto) { stopTimers(); renderViewer(); return; }
    if (V.ply >= V.t.line.length) V.ply = 0;
    V.auto = setInterval(function () {
      if (!V.t || V.ply >= V.t.line.length) { stopTimers(); renderViewer(); return; }
      V.ply++;
      renderViewer();
    }, 900);
    renderViewer();
  }

  /* ---------- wiring ---------- */
  function on(el, ev, fn) { el.addEventListener(ev, fn); }
  function openFrom(e) {
    var b = e.target.closest('[data-open]');
    if (b) openTrap(b.getAttribute('data-open'), +b.getAttribute('data-k') || 0, 'study');
    return !!b;
  }

  on($('entry'), 'submit', function (e) {
    e.preventDefault();
    var v = $('movein').value.trim();
    if (v && xTyped(v)) $('movein').value = '';
  });
  on($('choices'), 'click', function (e) {
    var b = e.target.closest('.mv');
    if (b) xTyped(b.getAttribute('data-san'));
  });
  on($('alerts'), 'click', function (e) {
    var p = e.target.closest('[data-play]');
    if (p) return xTyped(p.getAttribute('data-play'));
    openFrom(e);
  });
  on($('matches'), 'click', function (e) {
    var g = e.target.closest('[data-goto]');
    if (g) return xGo(+g.getAttribute('data-goto'));
    openFrom(e);
  });
  on($('grid'), 'click', openFrom);
  on($('pgn'), 'click', function (e) {
    var m = e.target.closest('[data-ply]');
    if (m) xGo(+m.getAttribute('data-ply'));
  });
  on($('back'), 'click', function () { xGo(X.cur - 1); });
  on($('fwd'), 'click', function () { xGo(X.cur + 1); });
  on($('reset'), 'click', function () {
    X.hist = []; X.moves = []; X.states = [E.newGame()]; X.cur = 0;
    $('err').textContent = '';
    saveExplorer();
    renderExplorer();
  });
  on($('flip'), 'click', function () { X.flip = !X.flip; renderExplorer(); });
  on($('sideSeg'), 'click', function (e) {
    var b = e.target.closest('[data-side]');
    if (!b) return;
    X.side = b.getAttribute('data-side');
    X.flip = false;
    saveExplorer();
    renderExplorer();
  });

  on($('libSide'), 'click', function (e) {
    var b = e.target.closest('[data-side]');
    if (!b) return;
    L.side = b.getAttribute('data-side');
    store.set('libSide', L.side);
    renderLibrary();
  });
  on($('search'), 'input', function (e) { L.q = e.target.value; renderLibrary(); });
  on($('libOutcome'), 'change', function (e) { L.outcome = e.target.value; renderLibrary(); });
  on($('libSort'), 'change', function (e) { L.sort = e.target.value; store.set('libSort', L.sort); renderLibrary(); });
  on($('libHide'), 'change', function (e) { L.hide = e.target.checked; renderLibrary(); });

  on($('vClose'), 'click', closeTrap);
  on($('overlay'), 'click', function (e) { if (e.target === $('overlay')) closeTrap(); });
  on($('vModes'), 'click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (b) setMode(b.getAttribute('data-mode'));
  });
  on($('vStart'), 'click', function () { stopTimers(); V.ply = 0; renderViewer(); });
  on($('vPrev'), 'click', function () { stopTimers(); step(-1); });
  on($('vNext'), 'click', function () { stopTimers(); step(1); });
  on($('vEnd'), 'click', function () { stopTimers(); V.ply = V.t.line.length; renderViewer(); });
  on($('vAuto'), 'click', toggleAuto);
  on($('vStrip'), 'click', function (e) {
    var m = e.target.closest('[data-ply]');
    if (m && V.mode === 'study') { stopTimers(); V.ply = +m.getAttribute('data-ply'); renderViewer(); }
  });
  on($('qEntry'), 'submit', function (e) {
    e.preventDefault();
    var t = V.t, v = $('qIn').value.trim();
    if (!t || !v || V.ply >= t.line.length) return;
    var mv = E.sanToMove(t.states[V.ply], v);
    if (!mv) { V.q.msg = '“' + v + '” is not a legal move here.'; V.q.tone = 'bad'; renderViewer(); return; }
    quizMove(mv);
  });
  on($('qShow'), 'click', quizReveal);
  on($('qRestart'), 'click', function () { setMode('quiz'); });
  on($('vLearned'), 'change', function (e) { setLearned(V.t.id, e.target.checked); });
  on($('vLoad'), 'click', function () {
    var t = V.t;
    X.side = t.side; X.flip = false;
    X.hist = t.line.slice(0, t.blunder);
    X.moves = t.moves.slice(0, t.blunder);
    X.states = t.states.slice(0, t.blunder + 1);
    X.cur = t.blunder;
    saveExplorer();
    closeTrap();
    showTab('explore');
    renderExplorer();
    window.scrollTo(0, 0);
  });

  on(document, 'keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
    if (!$('overlay').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeTrap(); return; }
      if (typing || V.mode !== 'study') return;
      if (e.key === 'ArrowLeft') { stopTimers(); step(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { stopTimers(); step(1); e.preventDefault(); }
      return;
    }
    if (typing || $('view-explore').hidden) return;
    if (e.key === 'ArrowLeft') { xGo(X.cur - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { xGo(X.cur + 1); e.preventDefault(); }
  });
  /* keep keyboard focus inside the dialog */
  on($('overlay'), 'keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = [].filter.call($('overlay').querySelectorAll('button, input, a[href], select'), function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
  });

  function showTab(which) {
    $('view-explore').hidden = which !== 'explore';
    $('view-library').hidden = which !== 'library';
    $('tab-explore').setAttribute('aria-selected', which === 'explore');
    $('tab-library').setAttribute('aria-selected', which === 'library');
    store.set('tab', which);
  }
  on($('tab-explore'), 'click', function () { showTab('explore'); renderExplorer(); });
  on($('tab-library'), 'click', function () { showTab('library'); renderLibrary(); });

  $('tab-library').textContent = 'Library (' + TRAPS.length + ')';
  $('libSort').value = L.sort;
  showTab(store.get('tab', 'explore') === 'library' ? 'library' : 'explore');
  renderExplorer();
  renderLibrary();

  /* test hook: lets the page tests inspect state without scraping */
  window.__traps = { X: X, V: V, INDEX: INDEX, hitsAt: hitsAt, TRAPS: TRAPS };
})();
