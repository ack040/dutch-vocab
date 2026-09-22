const files = process.argv.slice(2);
if (!files.length) files.push('./traps-white.js', './traps-black.js');
let traps = [];
for (const f of files) {
  try { traps = traps.concat(require(f).TRAPS || []); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
process.exit(require('./validate.js').run(traps) ? 1 : 0);
