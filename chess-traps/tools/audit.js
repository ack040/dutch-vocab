/* Engine audit of the trap library. Needs a Stockfish binary (set STOCKFISH=/path if it is not
   on PATH or in /usr/games). Writes src/evals.js, which the page shows, and fails on any trap that
   does not hold up:  node tools/audit.js            (DEPTH=20 by default) */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const SRC = path.join(__dirname, '..', 'src');
const E = require(path.join(SRC, 'engine.js')).Engine;
const { UCI, cp, fmt } = require('./uci.js');
const DEPTH = +(process.env.DEPTH || 20);

function findStockfish() {
  if (process.env.STOCKFISH) return process.env.STOCKFISH;
  for (const p of ['/usr/games/stockfish', '/usr/bin/stockfish', '/usr/local/bin/stockfish', '/opt/homebrew/bin/stockfish']) if (fs.existsSync(p)) return p;
  try { return execSync('command -v stockfish').toString().trim(); } catch (e) { return null; }
}
const toUci = mv => E.sqName(mv.from) + E.sqName(mv.to) + (mv.promotion || '');
const lab = (i, san) => Math.floor(i / 2) + 1 + (i % 2 ? '...' : '.') + san;
const MATE = 100000;
/* engine score from the mover's side -> the same score from the trapping side */
const forTrap = (score, moverIsTrap) => {
  if (!score) return null;
  if (score.mate !== undefined) return { mate: moverIsTrap ? score.mate : -score.mate };
  return moverIsTrap ? score.cp : -score.cp;
};

(async () => {
  const bin = findStockfish();
  if (!bin) { console.error('Stockfish not found. Install it or set STOCKFISH=/path/to/stockfish.'); process.exit(2); }
  let traps = [];
  for (const f of ['traps-white.js', 'traps-black.js']) traps = traps.concat(require(path.join(SRC, f)).TRAPS);
  if (process.env.ONLY) traps = traps.filter(t => process.env.ONLY.split(',').includes(t.id));

  const sf = new UCI(bin);
  await sf.init({ Threads: Math.max(1, require('os').cpus().length), Hash: 512 });
  const evals = {}, problems = [];
  for (const t of traps) {
    const states = [E.newGame()], ucis = [];
    t.line.forEach(san => { const mv = E.sanToMove(states[states.length - 1], san); ucis.push(toUci(mv)); states.push(E.makeMove(states[states.length - 1], mv)); });
    sf.send('ucinewgame');
    const ev = [];
    for (let k = 0; k <= t.line.length; k++) {
      const st = states[k];
      if (!E.legalMoves(st).length) { ev.push({ score: E.inCheck(st, st.turn) ? { mate: 0 } : { cp: 0 }, best: null }); continue; }
      const r = await sf.analyse(ucis.slice(0, k), { depth: DEPTH, multipv: 1 });
      const bm = E.legalMoves(st).find(m => toUci(m) === r.bestmove);
      ev.push({ score: r[0].score, best: bm ? E.moveToSan(st, bm) : r.bestmove });
    }
    const mover = k => (k % 2 ? 'b' : 'w');
    const lossAt = i => {
      const best = ev[i].score.mate === 0 ? -MATE : cp(ev[i].score);
      const after = ev[i + 1].score.mate === 0 ? MATE : -cp(ev[i + 1].score);
      return best - after;
    };
    const n = t.line.length, fin = ev[n];
    const final = fin.score.mate === 0 ? (mover(n) === t.side ? { mate: -0 } : '#') : forTrap(fin.score, mover(n) === t.side);
    const rec = {
      depth: DEPTH,
      before: forTrap(ev[t.blunder].score, false),   /* opponent to move: if they play the best move */
      best: ev[t.blunder].best,
      after: forTrap(ev[t.blunder + 1].score, true),  /* right after the mistake, trapping side to move */
      final: final
    };
    evals[t.id] = rec;

    /* quality gate */
    const bl = lossAt(t.blunder), pu = lossAt(t.punish);
    const finalCp = final === '#' ? MATE : (typeof final === 'object' ? (final.mate > 0 ? MATE : -MATE) : final);
    const flag = (level, msg) => problems.push({ level, id: t.id, msg });
    if (t.line[t.blunder] === ev[t.blunder].best) flag('FAIL', `the marked blunder ${lab(t.blunder, t.line[t.blunder])} is the engine's best move`);
    else if (bl < 50) flag('FAIL', `the marked blunder costs only ${(bl / 100).toFixed(2)}`);
    else if (bl < 150) flag('warn', `the marked blunder costs ${(bl / 100).toFixed(2)} (a mistake, not a howler)`);
    if (pu > 60 && Math.abs(cp(ev[t.punish].score)) < MATE / 2) flag('FAIL', `the refutation ${lab(t.punish, t.line[t.punish])} is ${(pu / 100).toFixed(2)} worse than ${ev[t.punish].best}`);
    if (finalCp < 50) flag('FAIL', `the line ends at ${typeof final === 'number' ? fmt({ cp: final }) : JSON.stringify(final)} for the trapping side`);
    else if (finalCp < 100) flag('warn', `the line ends at only ${fmt({ cp: finalCp })}`);
    for (let i = t.punish + 1; i < n; i++) {
      if (mover(i) !== t.side) continue;
      const l = lossAt(i);
      if (l > 100 && Math.abs(cp(ev[i].score)) < MATE / 2) flag('warn', `${lab(i, t.line[i])} is ${(l / 100).toFixed(2)} worse than ${ev[i].best}`);
    }
    const risky = typeof rec.before === 'number' && rec.before < -50;
    console.log(`${t.id.padEnd(28)} if they defend (${rec.best}): ${String(fmt(typeof rec.before === 'number' ? { cp: rec.before } : rec.before)).padStart(6)}  ` +
      `after the mistake: ${String(fmt(typeof rec.after === 'number' ? { cp: rec.after } : rec.after)).padStart(6)}  end: ${final === '#' ? 'mate' : fmt(typeof final === 'number' ? { cp: final } : final)}` +
      (risky ? '  [risky set-up]' : ''));
  }
  sf.quit();

  if (!process.env.ONLY) {
    const body = '/* Generated by tools/audit.js with Stockfish at depth ' + DEPTH + '. Scores are from the trapping side:\n' +
      '   before = if the opponent finds the best move at the critical moment, after = right after their mistake,\n' +
      '   final = at the end of the line. Numbers are centipawns; {mate:n} is mate in n; "#" is checkmate on the board. */\n' +
      '(function (root) { root.TRAP_EVALS = ' + JSON.stringify(evals) + '; })(typeof module !== \'undefined\' && module.exports ? module.exports : (typeof window !== \'undefined\' ? window : globalThis));\n';
    fs.writeFileSync(path.join(SRC, 'evals.js'), body);
    console.log('\nwrote src/evals.js');
  }
  const fails = problems.filter(p => p.level === 'FAIL');
  problems.forEach(p => console.log(`${p.level.padEnd(5)} ${p.id}: ${p.msg}`));
  console.log(`\n${traps.length} traps, ${fails.length} failing, ${problems.length - fails.length} warnings`);
  process.exit(fails.length ? 1 : 0);
})();
