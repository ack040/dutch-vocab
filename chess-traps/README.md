# Chess Opening Traps

A self-contained HTML page with a library of 50 named opening traps, 25 where White
springs the trap and 25 where Black does. Enter the moves that were played and the
list narrows to the traps that are still reachable from the current position.

**Deliverable:** `dist/chess-traps.html` — one file, no CDN, no build step at load
time, no network access. Drop it on any static host.

## What it does

- **Explorer.** Type a move in algebraic notation (`e4`, `Nf3`, `Bxf7+`, `O-O`, `e8=Q`),
  or click one of the book continuation buttons. The number on each button is how many
  traps lie behind that move. Any legal move is accepted, including moves no trap uses;
  the page then says it is out of book.
- **Trap alerts.** When the opponent reaches the square where they can go wrong, the trap
  shows a warning with the blundering move. When they actually play it, a red panel
  appears with the punishing move and a one-click button to play it. Alerts fire for the
  opponent only, never for the side running the trap.
- **Library.** All 50 traps, filterable by side and searchable by name, opening, ECO code
  or a move in the line. Each one opens a viewer that steps through the line move by move
  with notes, the mistake flagged in red, the refutation in green, and what the other side
  should have played instead.

## Layout

```
src/engine.js          0x88 chess engine: legal move generation, SAN parse and render
src/traps-white-1.js   25 White-side traps
src/traps-white-2.js
src/traps-black-1.js   25 Black-side traps
src/traps-black-2.js
src/style.css          light and dark theme, responsive down to phone width
src/index.html         page structure with inlining markers
src/app.js             explorer, library and viewer
src/validate.js        line checker
src/check.js           CLI entry point for the checker
src/build.js           inlines everything into dist/chess-traps.html
```

## Rebuilding

```sh
node src/build.js          # writes dist/chess-traps.html
node src/check.js          # re-validates all 50 trap lines
```

## How the trap data is verified

`check.js` replays every line through the engine and fails on:

- any illegal move,
- any move whose notation is not the canonical SAN for that position
  (so disambiguation like `Ngxe5` or `N1f3` is forced to be correct),
- a line claiming checkmate whose final position is not checkmate,
- a line that is checkmate but is not labelled as such,
- a line claiming to win material where the final position does not show it,
- a line claiming equality where the material is not level,
- a blunder ply that belongs to the trapping side rather than the opponent,
  or a refutation ply that belongs to the opponent,
- duplicate trap ids.

The engine itself is checked against the four standard perft positions
(Kiwipete and positions 3 to 5) plus the start position to depth 4.

## Trap record format

```js
{
  id: 'legals-mate',
  name: "Légal's Mate",
  eco: 'C41',
  opening: 'Italian Game / Philidor',
  side: 'w',                  // who springs the trap
  outcome: 'mate',            // mate | material | attack | even
  line: ['e4','e5','Nf3', …], // full line in SAN
  blunder: 11,                // ply index of the opponent's losing move
  punish: 12,                 // ply index of the refutation
  summary: '…',               // what the trap is
  better: '…',                // what the opponent should have played
  notes: { 10: '…', 12: '…' } // ply index -> comment shown in the viewer
}
```

Adding a trap means appending a record to one of the `traps-*.js` files and running
`node src/check.js`. The material figure shown in the app is computed from the final
position at runtime, so it can never drift from the line.
