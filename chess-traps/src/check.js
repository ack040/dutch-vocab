const files = process.argv.slice(2);
if (!files.length) files.push('./traps-white-1.js', './traps-white-2.js', './traps-black-1.js', './traps-black-2.js');
let traps = [];
for (const f of files) {
  try { traps = traps.concat(require(f).TRAPS || []); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
process.exit(require('./validate.js').run(traps) ? 1 : 0);
