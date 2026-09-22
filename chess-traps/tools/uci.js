/* Minimal promise-based UCI driver for Stockfish. */
const { spawn } = require('child_process');

class UCI {
  constructor(bin) {
    this.p = spawn(bin);
    this.buf = '';
    this.waiters = [];
    this.lines = [];
    this.p.stdout.on('data', d => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.lines.push(line);
        this.waiters = this.waiters.filter(w => !w(line));
      }
    });
  }
  send(cmd) { this.p.stdin.write(cmd + '\n'); }
  waitFor(pred) {
    return new Promise(res => this.waiters.push(line => (pred(line) ? (res(line), true) : false)));
  }
  async init(opts = {}) {
    this.send('uci');
    await this.waitFor(l => l === 'uciok');
    for (const [k, v] of Object.entries(opts)) this.send(`setoption name ${k} value ${v}`);
    this.send('isready');
    await this.waitFor(l => l === 'readyok');
  }
  /* Returns [{multipv, depth, score:{cp|mate}, pv:[uci...]}] sorted by multipv, for the side to move. */
  async analyse(moves, { depth = 18, multipv = 1, movetime } = {}) {
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send('ucinewgame');
    this.send('isready');
    await this.waitFor(l => l === 'readyok');
    this.send('position startpos' + (moves.length ? ' moves ' + moves.join(' ') : ''));
    const info = {};
    const collect = line => {
      if (!line.startsWith('info ') || !line.includes(' pv ') || !line.includes(' score ')) return false;
      const m = line.match(/ multipv (\d+)/);
      const k = m ? +m[1] : 1;
      const d = +line.match(/ depth (\d+)/)[1];
      const sc = line.match(/ score (cp|mate) (-?\d+)/);
      const pv = line.split(' pv ')[1].split(' ');
      if (line.includes('lowerbound') || line.includes('upperbound')) return false;
      info[k] = { multipv: k, depth: d, score: { [sc[1]]: +sc[2] }, pv };
      return false;
    };
    this.waiters.push(collect);
    this.send(movetime ? `go movetime ${movetime}` : `go depth ${depth}`);
    const best = await this.waitFor(l => l.startsWith('bestmove'));
    this.waiters = this.waiters.filter(w => w !== collect);
    const out = Object.values(info).sort((a, b) => a.multipv - b.multipv);
    out.bestmove = best.split(' ')[1];
    return out;
  }
  quit() { this.send('quit'); }
}

/* Score as centipawns from the side to move; mate mapped to +/-100000 minus distance. */
function cp(score) {
  if (!score) return 0;
  if (score.mate !== undefined) return score.mate > 0 ? 100000 - score.mate * 100 : -100000 - score.mate * 100;
  return score.cp;
}
function fmt(score) {
  if (!score) return '?';
  if (score.mate !== undefined) return (score.mate > 0 ? '#' : '#-') + Math.abs(score.mate);
  return (score.cp > 0 ? '+' : '') + (score.cp / 100).toFixed(2);
}
module.exports = { UCI, cp, fmt };
