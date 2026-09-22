/* Minimal 0x88 chess engine: legal move generation + SAN parse/render. */
(function (root) {
  'use strict';

  var WHITE = 'w', BLACK = 'b';
  var KNIGHT_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
  var BISHOP_OFF = [-17, -15, 15, 17];
  var ROOK_OFF = [-16, -1, 1, 16];
  var KING_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];
  var SLIDERS = { b: BISHOP_OFF, r: ROOK_OFF, q: KING_OFF };
  var FILES = 'abcdefgh';

  function rank(sq) { return sq >> 4; }
  function file(sq) { return sq & 15; }
  function onBoard(sq) { return (sq & 0x88) === 0; }
  function sqName(sq) { return FILES[file(sq)] + (8 - rank(sq)); }
  function nameToSq(name) {
    var f = FILES.indexOf(name[0]);
    var r = 8 - parseInt(name[1], 10);
    if (f < 0 || r < 0 || r > 7) return -1;
    return r * 16 + f;
  }

  function newGame() {
    var board = new Array(128).fill(null);
    var back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (var f = 0; f < 8; f++) {
      board[f] = { type: back[f], color: BLACK };
      board[16 + f] = { type: 'p', color: BLACK };
      board[96 + f] = { type: 'p', color: WHITE };
      board[112 + f] = { type: back[f], color: WHITE };
    }
    return {
      board: board,
      turn: WHITE,
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      ep: -1,
      half: 0,
      full: 1
    };
  }

  function clone(st) {
    return {
      board: st.board.slice(),
      turn: st.turn,
      castling: { wK: st.castling.wK, wQ: st.castling.wQ, bK: st.castling.bK, bQ: st.castling.bQ },
      ep: st.ep,
      half: st.half,
      full: st.full
    };
  }

  function findKing(board, color) {
    for (var sq = 0; sq < 128; sq++) {
      if (!onBoard(sq)) { sq += 7; continue; }
      var p = board[sq];
      if (p && p.type === 'k' && p.color === color) return sq;
    }
    return -1;
  }

  /* Is `target` attacked by any piece of `by`? */
  function isAttacked(board, target, by) {
    var i, off, sq, p;
    /* pawns */
    var pawnDir = by === WHITE ? 16 : -16; /* from target back toward attacker */
    for (i = -1; i <= 1; i += 2) {
      sq = target + pawnDir + i;
      if (onBoard(sq)) {
        p = board[sq];
        if (p && p.color === by && p.type === 'p') return true;
      }
    }
    /* knights */
    for (i = 0; i < KNIGHT_OFF.length; i++) {
      sq = target + KNIGHT_OFF[i];
      if (!onBoard(sq)) continue;
      p = board[sq];
      if (p && p.color === by && p.type === 'n') return true;
    }
    /* king */
    for (i = 0; i < KING_OFF.length; i++) {
      sq = target + KING_OFF[i];
      if (!onBoard(sq)) continue;
      p = board[sq];
      if (p && p.color === by && p.type === 'k') return true;
    }
    /* sliding: bishop/queen then rook/queen */
    var rays = [[BISHOP_OFF, 'b'], [ROOK_OFF, 'r']];
    for (var r = 0; r < 2; r++) {
      var offs = rays[r][0], kind = rays[r][1];
      for (i = 0; i < offs.length; i++) {
        off = offs[i];
        sq = target + off;
        while (onBoard(sq)) {
          p = board[sq];
          if (p) {
            if (p.color === by && (p.type === kind || p.type === 'q')) return true;
            break;
          }
          sq += off;
        }
      }
    }
    return false;
  }

  function inCheck(st, color) {
    color = color || st.turn;
    var k = findKing(st.board, color);
    if (k < 0) return false;
    return isAttacked(st.board, k, color === WHITE ? BLACK : WHITE);
  }

  function addPawnMove(list, st, from, to, captured, isEp) {
    var promoRank = st.turn === WHITE ? 0 : 7;
    if (rank(to) === promoRank) {
      ['q', 'r', 'b', 'n'].forEach(function (pr) {
        list.push({ from: from, to: to, piece: 'p', captured: captured, promotion: pr, ep: !!isEp, castle: null });
      });
    } else {
      list.push({ from: from, to: to, piece: 'p', captured: captured, promotion: null, ep: !!isEp, castle: null });
    }
  }

  /* Pseudo-legal moves for the side to move. */
  function pseudoMoves(st) {
    var moves = [];
    var board = st.board, us = st.turn, them = us === WHITE ? BLACK : WHITE;
    for (var from = 0; from < 128; from++) {
      if (!onBoard(from)) { from += 7; continue; }
      var p = board[from];
      if (!p || p.color !== us) continue;
      var i, off, to, t;

      if (p.type === 'p') {
        var dir = us === WHITE ? -16 : 16;
        var startRank = us === WHITE ? 6 : 1;
        to = from + dir;
        if (onBoard(to) && !board[to]) {
          addPawnMove(moves, st, from, to, null, false);
          var to2 = from + 2 * dir;
          if (rank(from) === startRank && !board[to2]) {
            moves.push({ from: from, to: to2, piece: 'p', captured: null, promotion: null, ep: false, castle: null, double: true });
          }
        }
        for (i = -1; i <= 1; i += 2) {
          to = from + dir + i;
          if (!onBoard(to)) continue;
          t = board[to];
          if (t && t.color === them) addPawnMove(moves, st, from, to, t.type, false);
          else if (!t && to === st.ep) addPawnMove(moves, st, from, to, 'p', true);
        }
        continue;
      }

      if (p.type === 'n' || p.type === 'k') {
        var offs = p.type === 'n' ? KNIGHT_OFF : KING_OFF;
        for (i = 0; i < offs.length; i++) {
          to = from + offs[i];
          if (!onBoard(to)) continue;
          t = board[to];
          if (t && t.color === us) continue;
          moves.push({ from: from, to: to, piece: p.type, captured: t ? t.type : null, promotion: null, ep: false, castle: null });
        }
        continue;
      }

      var dirs = SLIDERS[p.type];
      for (i = 0; i < dirs.length; i++) {
        off = dirs[i];
        to = from + off;
        while (onBoard(to)) {
          t = board[to];
          if (t) {
            if (t.color === them) {
              moves.push({ from: from, to: to, piece: p.type, captured: t.type, promotion: null, ep: false, castle: null });
            }
            break;
          }
          moves.push({ from: from, to: to, piece: p.type, captured: null, promotion: null, ep: false, castle: null });
          to += off;
        }
      }
    }

    /* castling */
    var kSq = us === WHITE ? 116 : 4;
    var them2 = us === WHITE ? BLACK : WHITE;
    var kp = board[kSq];
    if (kp && kp.type === 'k' && kp.color === us && !isAttacked(board, kSq, them2)) {
      var kSide = us === WHITE ? st.castling.wK : st.castling.bK;
      var qSide = us === WHITE ? st.castling.wQ : st.castling.bQ;
      if (kSide && !board[kSq + 1] && !board[kSq + 2]) {
        var rk = board[kSq + 3];
        if (rk && rk.type === 'r' && rk.color === us &&
            !isAttacked(board, kSq + 1, them2) && !isAttacked(board, kSq + 2, them2)) {
          moves.push({ from: kSq, to: kSq + 2, piece: 'k', captured: null, promotion: null, ep: false, castle: 'k' });
        }
      }
      if (qSide && !board[kSq - 1] && !board[kSq - 2] && !board[kSq - 3]) {
        var rq = board[kSq - 4];
        if (rq && rq.type === 'r' && rq.color === us &&
            !isAttacked(board, kSq - 1, them2) && !isAttacked(board, kSq - 2, them2)) {
          moves.push({ from: kSq, to: kSq - 2, piece: 'k', captured: null, promotion: null, ep: false, castle: 'q' });
        }
      }
    }
    return moves;
  }

  function makeMove(st, mv) {
    var next = clone(st);
    var b = next.board;
    var us = st.turn, them = us === WHITE ? BLACK : WHITE;
    var moving = b[mv.from];

    b[mv.to] = mv.promotion ? { type: mv.promotion, color: us } : { type: moving.type, color: us };
    b[mv.from] = null;

    if (mv.ep) b[mv.to + (us === WHITE ? 16 : -16)] = null;

    if (mv.castle === 'k') { b[mv.to - 1] = b[mv.to + 1]; b[mv.to + 1] = null; }
    if (mv.castle === 'q') { b[mv.to + 1] = b[mv.to - 2]; b[mv.to - 2] = null; }

    /* castling rights */
    if (moving.type === 'k') {
      if (us === WHITE) { next.castling.wK = false; next.castling.wQ = false; }
      else { next.castling.bK = false; next.castling.bQ = false; }
    }
    if (mv.from === 112 || mv.to === 112) next.castling.wQ = false;
    if (mv.from === 119 || mv.to === 119) next.castling.wK = false;
    if (mv.from === 0 || mv.to === 0) next.castling.bQ = false;
    if (mv.from === 7 || mv.to === 7) next.castling.bK = false;

    next.ep = mv.double ? (mv.from + (us === WHITE ? -16 : 16)) : -1;
    next.half = (moving.type === 'p' || mv.captured) ? 0 : st.half + 1;
    if (us === BLACK) next.full = st.full + 1;
    next.turn = them;
    return next;
  }

  function legalMoves(st) {
    return pseudoMoves(st).filter(function (mv) {
      return !inCheck(makeMove(st, mv), st.turn);
    });
  }

  function moveToSan(st, mv) {
    var san;
    if (mv.castle === 'k') san = 'O-O';
    else if (mv.castle === 'q') san = 'O-O-O';
    else {
      var all = legalMoves(st);
      if (mv.piece === 'p') {
        san = (mv.captured ? FILES[file(mv.from)] + 'x' : '') + sqName(mv.to);
        if (mv.promotion) san += '=' + mv.promotion.toUpperCase();
      } else {
        var sameTarget = all.filter(function (m) {
          return m.piece === mv.piece && m.to === mv.to && m.from !== mv.from;
        });
        var disamb = '';
        if (sameTarget.length) {
          var sameFile = sameTarget.some(function (m) { return file(m.from) === file(mv.from); });
          var sameRank = sameTarget.some(function (m) { return rank(m.from) === rank(mv.from); });
          if (!sameFile) disamb = FILES[file(mv.from)];
          else if (!sameRank) disamb = String(8 - rank(mv.from));
          else disamb = sqName(mv.from);
        }
        san = mv.piece.toUpperCase() + disamb + (mv.captured ? 'x' : '') + sqName(mv.to);
      }
    }
    var after = makeMove(st, mv);
    if (inCheck(after, after.turn)) {
      san += legalMoves(after).length ? '+' : '#';
    }
    return san;
  }

  /* Parses SAN (with or without +, #, !, ?), long algebraic (e2e4, e7e8q) and castling.
     Tolerates what people type on phones: lowercase piece letters, 0-0, move numbers. */
  var SAN_RE = /^([NBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([NBRQnbrq]))?$/;
  function matchSan(moves, clean) {
    if (clean === 'O-O' || clean === 'O-O-O') {
      var side = clean === 'O-O' ? 'k' : 'q';
      for (var c = 0; c < moves.length; c++) if (moves[c].castle === side) return moves[c];
      return null;
    }
    var lan = clean.match(/^([a-h][1-8])-?([a-h][1-8])=?([qrbnQRBN])?$/);
    if (lan) {
      var lf = nameToSq(lan[1]), lt = nameToSq(lan[2]), lp = lan[3] ? lan[3].toLowerCase() : null;
      for (var l = 0; l < moves.length; l++) {
        var lm = moves[l];
        if (lm.from === lf && lm.to === lt && (!lm.promotion || lm.promotion === (lp || 'q'))) return lm;
      }
      return null;
    }
    var m = clean.match(SAN_RE);
    if (!m) return null;
    var piece = m[1] ? m[1].toLowerCase() : 'p';
    var fromFile = m[2] ? FILES.indexOf(m[2]) : -1;
    var fromRank = m[3] ? 8 - parseInt(m[3], 10) : -1;
    var to = nameToSq(m[5]);
    var promo = m[6] ? m[6].toLowerCase() : null;
    var found = null;
    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      if (mv.piece !== piece || mv.to !== to) continue;
      if (fromFile >= 0 && file(mv.from) !== fromFile) continue;
      if (fromRank >= 0 && rank(mv.from) !== fromRank) continue;
      if (mv.promotion && mv.promotion !== (promo || 'q')) continue;
      if (!mv.promotion && promo) continue;
      if (found) return null; /* ambiguous */
      found = mv;
    }
    return found;
  }
  function sanToMove(st, san) {
    var clean = String(san).trim()
      .replace(/^\d+\s*\.+\s*/, '')      /* "3.Bc4", "3...Nf6" */
      .replace(/[+#?!]/g, '')
      .replace(/[oO0]-[oO0]-[oO0]/, 'O-O-O').replace(/[oO0]-[oO0]/, 'O-O')
      .replace(/\s+/g, '');
    if (!clean) return null;
    var moves = legalMoves(st);
    var mv = matchSan(moves, clean);
    if (mv) return mv;
    /* phone keyboards lowercase the piece letter; "b" stays a pawn file first, as SAN requires */
    var first = clean[0];
    if ('nrqk'.indexOf(first) >= 0 || first === 'b') {
      mv = matchSan(moves, first.toUpperCase() + clean.slice(1));
      if (mv) return mv;
    }
    return null;
  }

  /* Position identity for transposition matching: placement, side to move, castling rights,
     and the en passant square only when an en passant capture is actually available. */
  function pieceChar(p) { return p.color === WHITE ? p.type.toUpperCase() : p.type; }
  function castleStr(c) { return (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') || '-'; }
  function positionKey(st) {
    var s = '';
    for (var r = 0; r < 8; r++) {
      for (var f = 0; f < 8; f++) { var p = st.board[r * 16 + f]; s += p ? pieceChar(p) : '.'; }
    }
    var ep = '-';
    if (st.ep >= 0 && legalMoves(st).some(function (mv) { return mv.ep; })) ep = sqName(st.ep);
    return s + ' ' + st.turn + ' ' + castleStr(st.castling) + ' ' + ep;
  }
  function fen(st) {
    var rows = [];
    for (var r = 0; r < 8; r++) {
      var row = '', empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = st.board[r * 16 + f];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += pieceChar(p);
      }
      rows.push(row + (empty || ''));
    }
    return rows.join('/') + ' ' + st.turn + ' ' + castleStr(st.castling) + ' ' +
      (st.ep >= 0 ? sqName(st.ep) : '-') + ' ' + st.half + ' ' + st.full;
  }
  function isMate(st) { return inCheck(st, st.turn) && legalMoves(st).length === 0; }

  function squares(st) {
    var out = [];
    for (var r = 0; r < 8; r++) {
      for (var f = 0; f < 8; f++) {
        var sq = r * 16 + f;
        out.push({ sq: sq, name: sqName(sq), piece: st.board[sq], light: (r + f) % 2 === 0 });
      }
    }
    return out;
  }

  root.Engine = {
    newGame: newGame, clone: clone, makeMove: makeMove, legalMoves: legalMoves,
    moveToSan: moveToSan, sanToMove: sanToMove, inCheck: inCheck, isMate: isMate,
    positionKey: positionKey, fen: fen,
    squares: squares, sqName: sqName, nameToSq: nameToSq, findKing: findKing,
    WHITE: WHITE, BLACK: BLACK
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : globalThis));
