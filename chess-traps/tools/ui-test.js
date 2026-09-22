/* Browser test for dist/chess-traps.html. Needs Playwright with Chromium:
     node tools/ui-test.js            (from the chess-traps directory) */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const FILE = 'file://' + path.resolve(__dirname, '..', 'dist', 'chess-traps.html');
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra !== undefined ? '  -> ' + extra : ''));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const sq = name => `#board .sq[data-sq="${(8 - +name[1]) * 16 + 'abcdefgh'.indexOf(name[0])}"]`;
  const click = async (a, b) => { await page.click(sq(a)); await page.click(sq(b)); };
  const type = async san => { await page.fill('#movein', san); await page.press('#movein', 'Enter'); };
  const hist = () => page.evaluate(() => window.__traps.X.hist.slice(0, window.__traps.X.cur).join(' '));
  const rows = () => page.$$eval('#matches .trap', els => els.map(e => e.getAttribute('data-open')));
  const reset = async () => { await page.click('#reset'); };

  await page.goto(FILE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  /* ---- load ---- */
  ok('64 squares, 32 pieces', await page.locator('#board .sq').count() === 64 && await page.locator('#board .pc').count() === 32);
  const glyphs = await page.$$eval('.pc', els => els.every(e => e.textContent.endsWith('︎')));
  ok('every piece glyph carries U+FE0E (no colour emoji on phones)', glyphs);
  ok('White sees only White traps (25)', (await rows()).length === 25, (await rows()).length);
  ok('start suggestions are 1.e4 and 1.d4', (await page.locator('#choices .mv b').allInnerTexts()).join(' ') === '1.e4 1.d4');
  ok('two blue arrows at the start', await page.locator('#board .ar.info').count() === 2);

  /* ---- tap to move ---- */
  await page.click(sq('g1'));
  ok('tapping a knight shows its 2 targets', await page.locator('#board .sq.tgt').count() === 2);
  await page.click(sq('g1'));
  ok('tapping it again deselects', await page.locator('#board .sq.tgt').count() === 0);
  await click('e2', 'e4');
  ok('tap-tap plays 1.e4', await hist() === 'e4');
  ok('last move highlighted', await page.locator('#board .sq.from').count() === 1 && await page.locator('#board .sq.to').count() === 1);
  ok('now the opponent is to move', /Opponent to move/.test(await page.locator('#turn').innerText()));
  await page.click(sq('e2'));
  ok('cannot pick up a piece of the side not to move', await page.locator('#board .sq.sel').count() === 0);

  /* ---- typing ---- */
  await type('e5'); await type('nf3');
  ok('typed moves accepted, lowercase piece letter too', await hist() === 'e4 e5 Nf3');
  await type('Qz9');
  ok('illegal input rejected with a message', /not a legal move/.test(await page.locator('#err').innerText()));
  await type('Nc6');
  ok('error clears after a legal move', (await page.locator('#err').innerText()) === '');

  /* ---- side filter: Blackburne Shilling is a Black trap ---- */
  await type('Bc4'); await type('Nd4');
  const whiteRows = await rows();
  ok('as White, the Black-side Blackburne Shilling is not shown', !whiteRows.includes('blackburne-shilling'), whiteRows.join(','));
  await page.click('#sideSeg [data-side="b"]');
  const blackRows = await rows();
  ok('as Black, Blackburne Shilling is shown', blackRows.includes('blackburne-shilling'), blackRows.join(','));
  ok('board flips when playing Black', await page.evaluate(() => document.querySelector('#board .sq').getAttribute('data-sq')) === '119');
  const bad = await page.locator('#choices .mv.bad b').allInnerTexts();
  ok('opponent’s losing move 4.Nxe5 marked red', bad.includes('4.Nxe5'), bad.join(','));
  ok('red arrow drawn for it', await page.locator('#board .ar.bad').count() === 1);
  await page.click('#choices .mv.bad');
  ok('after 4.Nxe5 the "they fell for it" alert shows', /They fell for it: Blackburne Shilling/.test(await page.locator('#alerts').innerText()));
  ok('green arrow for the punishing move', await page.locator('#board .ar.good').count() >= 1);
  await page.click('#alerts [data-play]');
  ok('one tap plays the punishment 4...Qg5', (await hist()).endsWith('Nxe5 Qg5'));

  /* ---- transposition ---- */
  await page.click('#sideSeg [data-side="w"]');
  await reset();
  for (const m of ['e4', 'e5', 'Bc4', 'Nc6', 'Nf3', 'd6', 'Nc3', 'Bg4']) await type(m);
  const tr = await rows();
  ok('Légal found through a different move order (2.Bc4, 3.Nf3)', tr.includes('legals-mate'), tr.join(','));
  const lg = await page.locator('#matches .trap[data-open="legals-mate"] .st').innerText();
  ok('move numbers follow this game', /5\.h3/.test(lg) || /h3/.test(lg), lg);

  /* ---- scholar's mate end to end, back/forward ---- */
  await reset();
  for (const m of ['e4', 'e5', 'Bc4', 'Bc5', 'Qh5']) await type(m);
  const armed = await page.locator('#matches .trap[data-open="scholars-mate"] .st').innerText();
  ok('Scholar’s Mate armed: 3...Nf6?? loses', /3\.\.\.Nf6\?\? loses/.test(armed), armed);
  await type('Nf6');
  await page.click('#alerts [data-play]');
  ok('Qxf7# played, checkmate announced', /Checkmate\. White wins/.test(await page.locator('#turn').innerText()));
  ok('king in check highlighted', await page.locator('#board .sq.chk').count() === 1);
  ok('board locked after mate', !(await page.locator('#board').getAttribute('class')).includes('live'));
  await page.click('#back'); await page.click('#back');
  ok('Back keeps the future moves', (await hist()) === 'e4 e5 Bc4 Bc5 Qh5' && await page.locator('#pgn .m.future').count() === 2);
  await page.keyboard.press('ArrowRight');
  ok('right arrow key steps forward', (await hist()) === 'e4 e5 Bc4 Bc5 Qh5 Nf6');
  await page.keyboard.press('ArrowLeft');
  await type('Qe7');
  ok('a different move replaces the future', (await hist()) === 'e4 e5 Bc4 Bc5 Qh5 Qe7' && await page.locator('#pgn .m.future').count() === 0);
  await page.click('#pgn .m[data-ply="2"]');
  ok('clicking a move in the list jumps there', (await hist()) === 'e4 e5');

  /* ---- out of book ---- */
  await reset();
  for (const m of ['e4', 'a6', 'a3']) await type(m);
  ok('out of book detected', /Out of book/.test(await page.locator('#matches').innerText()));
  await page.click('#matches [data-goto]');
  ok('"back to the last book position" goes back', (await hist()) === 'e4 a6' || (await hist()) === 'e4');

  /* ---- promotion: the Lasker Trap underpromotes to a knight ---- */
  await page.click('#sideSeg [data-side="b"]');
  await reset();
  for (const m of ['d4', 'd5', 'c4', 'e5', 'dxe5', 'd4', 'e3', 'Bb4+', 'Bd2', 'dxe3', 'Bxb4', 'exf2+', 'Ke2']) await type(m);
  await click('f2', 'g1');
  ok('promotion picker appears', await page.locator('#board .promo button').count() === 4);
  await page.click('#board .promo [data-promo="n"]');
  ok('underpromotion fxg1=N+ recorded', (await hist()).endsWith('Ke2 fxg1=N+'), await hist());

  /* ---- persistence ---- */
  await page.reload();
  ok('side and game survive a reload', (await hist()).endsWith('fxg1=N+') &&
    await page.locator('#sideSeg [data-side="b"][aria-pressed="true"]').count() === 1);

  /* ---- lichess link ---- */
  const href = await page.getAttribute('#xLichess', 'href');
  ok('Lichess link carries the FEN and orientation', /^https:\/\/lichess\.org\/analysis\/[1-8a-zA-Z\/]+_[wb]_[KQkq-]+_[a-h1-8-]+_\d+_\d+\?color=black$/.test(href), href);

  /* ---- library ---- */
  await page.click('#tab-library');
  ok('library shows 50 cards', await page.locator('#grid .tcard').count() === 50);
  ok('each card has a 64-square thumbnail', await page.locator('#grid .tcard .board.mini .sq').count() === 50 * 64);
  ok('each thumbnail shows the refutation arrow', await page.locator('#grid .tcard .ar.good').count() === 50);
  await page.fill('#search', 'stafford');
  ok('search', await page.locator('#grid .tcard').count() === 3, await page.locator('#grid .tcard').count());
  await page.click('#libSide [data-side="b"]');
  ok('side filter', await page.locator('#grid .tcard').count() === 2);
  await page.fill('#search', '');
  await page.click('#libSide [data-side="all"]');
  await page.selectOption('#libOutcome', 'mate');
  const mates = await page.locator('#grid .tcard').count();
  ok('outcome filter', mates > 5 && mates < 50, mates);
  await page.selectOption('#libOutcome', 'all');
  await page.selectOption('#libSort', 'short');
  ok('sort shortest first puts Fool’s Mate first', /Fool/.test(await page.locator('#grid .tcard .nm').first().innerText()));

  /* ---- viewer: study ---- */
  await page.click('#grid .tcard[data-open="legals-mate"]');
  ok('viewer opens', await page.locator('#overlay').isVisible());
  ok('next move drawn as an arrow', await page.locator('#vBoard .ar').count() === 1);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  ok('arrow keys step the line', await page.evaluate(() => window.__traps.V.ply) === 2);
  await page.click('#vEnd');
  ok('end shows the result', /Result\./.test(await page.locator('#vNotes').innerText()));
  await page.click('#vStart');
  await page.click('#vAuto');
  await page.waitForTimeout(2000);
  const played = await page.evaluate(() => window.__traps.V.ply);
  ok('play-through advances on its own', played >= 2, played);
  await page.click('#vAuto');
  const paused = await page.evaluate(() => window.__traps.V.ply);
  await page.waitForTimeout(1100);
  ok('and pauses', await page.evaluate(() => window.__traps.V.ply) === paused);
  await page.keyboard.press('Escape');
  ok('Esc closes the viewer', !(await page.locator('#overlay').isVisible()));

  /* ---- viewer: quiz, wrong answers, hint, reveal ---- */
  await page.click('#grid .tcard[data-open="scholars-mate"]');
  await page.click('#vModes [data-mode="quiz"]');
  const qtype = async san => { await page.fill('#qIn', san); await page.press('#qIn', 'Enter'); };
  await qtype('d4');
  ok('wrong quiz move is refused', /not the move/.test(await page.locator('#vNotes').innerText()));
  await qtype('c4');
  ok('second miss gives a hint square', await page.locator('#vBoard .sq.hint').count() === 1);
  await page.click('#qShow');
  await page.waitForTimeout(800);
  ok('"show the move" plays it and the reply follows', await page.evaluate(() => window.__traps.V.ply) === 2);
  await page.click('#qRestart');

  /* ---- quiz every trap cleanly: all 50 must end flawless and learned ---- */
  await page.keyboard.press('Escape');
  const ids = await page.evaluate(() => window.__traps.TRAPS.map(t => t.id));
  let clean = 0;
  for (const id of ids) {
    await page.evaluate(() => { document.querySelector('#libOutcome').value = 'all'; });
    await page.click(`#grid .tcard[data-open="${id}"]`);
    await page.click('#vModes [data-mode="quiz"]');
    const line = await page.evaluate(i => window.__traps.TRAPS.find(t => t.id === i).line, id);
    const side = await page.evaluate(i => window.__traps.TRAPS.find(t => t.id === i).side, id);
    for (let k = 0; k < line.length; k++) {
      if ((k % 2 ? 'b' : 'w') !== side) continue;
      await page.waitForFunction(kk => window.__traps.V.ply === kk && !window.__traps.V.timer, k, { timeout: 5000 });
      await page.fill('#qIn', line[k]);
      await page.press('#qIn', 'Enter');
    }
    await page.waitForFunction(() => window.__traps.V.q && window.__traps.V.q.done, null, { timeout: 5000 });
    if (await page.evaluate(() => window.__traps.V.q.mistakes === 0)) clean++;
    await page.keyboard.press('Escape');
  }
  ok('quiz completes cleanly for all 50 traps', clean === ids.length, clean + '/' + ids.length);
  ok('all 50 marked learned', /50 of 50 learned/.test(await page.locator('#libcount').innerText()), await page.locator('#libcount').innerText());
  await page.check('#libHide');
  ok('"hide learned" hides them all', await page.locator('#grid .tcard').count() === 0);
  await page.uncheck('#libHide');

  /* ---- load into explorer ---- */
  await page.click('#grid .tcard[data-open="kieninger-trap"]');
  await page.click('#vLoad');
  ok('"load into the explorer" switches tab, side and position',
    await page.locator('#view-explore').isVisible() && await page.locator('#sideSeg [data-side="b"][aria-pressed="true"]').count() === 1 &&
    /Kieninger/.test(await page.locator('#matches').innerText()));

  /* ---- layout ---- */
  for (const [w, h] of [[390, 844], [768, 1024], [1280, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.click('#tab-explore');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`no horizontal overflow at ${w}px (explorer)`, over === 0, over);
    await page.click('#tab-library');
    const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`no horizontal overflow at ${w}px (library)`, over2 === 0, over2);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#tab-explore');
  const order = await page.evaluate(() => ['.xboard', '.xinput', '.xtraps', '.xmoves'].map(s => document.querySelector(s).getBoundingClientRect().top));
  ok('phone layout: board, input, traps, moves from top to bottom', order.every((v, i) => i === 0 || v > order[i - 1]), order.map(Math.round).join(' < '));

  ok('no JavaScript errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
