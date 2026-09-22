/* Validator: replays every trap line, checks legality, mate claims and material claims. */
const E = require('./engine.js').Engine;
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function material(st) {
  let d = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = st.board[sq];
    if (p) d += (p.color === 'w' ? 1 : -1) * VAL[p.type];
  }
  return d;
}

function run(traps) {
  let fail = 0;
  const ids = new Set();
  for (const t of traps) {
    const errs = [];
    if (ids.has(t.id)) errs.push('duplicate id');
    ids.add(t.id);

    let st = E.newGame();
    let ok = true;
    for (let i = 0; i < t.line.length; i++) {
      const mv = E.sanToMove(st, t.line[i]);
      if (!mv) { errs.push(`illegal move at ply ${i}: "${t.line[i]}"`); ok = false; break; }
      const canon = E.moveToSan(st, mv);
      if (canon !== t.line[i]) errs.push(`ply ${i} "${t.line[i]}" should be written "${canon}"`);
      st = E.makeMove(st, mv);
    }

    if (ok) {
      const mated = E.legalMoves(st).length === 0 && E.inCheck(st, st.turn);
      if (t.outcome === 'mate' && !mated) errs.push('claims mate but final position is not checkmate');
      if (t.outcome !== 'mate' && mated) errs.push('is actually checkmate, outcome should be "mate"');
      const delta = material(st) * (t.side === 'w' ? 1 : -1);
      if (t.outcome === 'even' && Math.abs(delta) > 1) errs.push(`claims equality but trap side is ${delta >= 0 ? '+' : ''}${delta}`);
      if (t.outcome === "material" && delta < 1) {
        errs.push(`claims material but trap side is only ${delta >= 0 ? '+' : ''}${delta} at the end`);
      }
      t._delta = delta;
      // structural checks
      if (t.blunder >= t.line.length || t.punish >= t.line.length) errs.push('blunder/punish index out of range');
      if (t.punish <= t.blunder) errs.push('punish index must come after blunder index');
      const blunderSide = t.blunder % 2 === 0 ? 'w' : 'b';
      if (blunderSide === t.side) errs.push('blunder ply belongs to the trap side, should be the opponent');
      const punishSide = t.punish % 2 === 0 ? 'w' : 'b';
      if (punishSide !== t.side) errs.push('punish ply belongs to the opponent, should be the trap side');
    }

    if (errs.length) { fail++; console.log(`FAIL ${t.id}`); errs.forEach(e => console.log('      ' + e)); }
    else console.log(`ok   ${t.id.padEnd(26)} ${t.outcome.padEnd(9)} ${t.line.length} plies  material ${t._delta >= 0 ? '+' : ''}${t._delta}`);
  }
  console.log(`\n${traps.length - fail}/${traps.length} passed`);
  return fail;
}
module.exports = { run, material };
