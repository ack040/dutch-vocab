/* Inlines engine, trap data, styles and app into one standalone HTML file. */
const fs = require('fs'), path = require('path');
const here = __dirname, out = path.join(here, '..', 'dist', 'chess-traps.html');
const read = f => fs.readFileSync(path.join(here, f), 'utf8');

const traps = ['traps-white.js', 'traps-black.js', 'evals.js'].filter(f => fs.existsSync(path.join(here, f))).map(read).join('\n');
let html = read('index.html')
  .replace('/*==CSS==*/', () => '\n' + read('style.css'))
  .replace('/*==ENGINE==*/', () => '\n' + read('engine.js'))
  .replace('/*==TRAPS==*/', () => '\n' + traps)
  .replace('/*==APP==*/', () => '\n' + read('app.js'));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', path.relative(process.cwd(), out), '-', (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
