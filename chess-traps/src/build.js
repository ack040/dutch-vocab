/* Inlines engine, trap data, styles and app into one standalone HTML file. */
const fs = require('fs'), path = require('path');
const here = __dirname, out = path.join(here, '..', 'dist', 'chess-traps.html');
const read = f => fs.readFileSync(path.join(here, f), 'utf8');

const traps = ['traps-white-1.js', 'traps-white-2.js', 'traps-black-1.js', 'traps-black-2.js'].map(read).join('\n');
let html = read('index.html')
  .replace('/*==CSS==*/', () => '\n' + read('style.css'))
  .replace('/*==ENGINE==*/', () => '\n' + read('engine.js'))
  .replace('/*==TRAPS==*/', () => '\n' + traps)
  .replace('/*==APP==*/', () => '\n' + read('app.js'));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
const n = (read('traps-white-1.js') + traps).match(/\bid: '/g);
console.log('wrote', path.relative(process.cwd(), out), '-', (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
