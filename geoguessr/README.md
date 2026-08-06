# GeoGuessr Tells Trainer

A tiny offline web app for drilling the **tells** — the meta clues that pin down
a country or region in GeoGuessr and similar street-view games. It's built for
one thing: surfacing the tells *you personally keep missing* so you can review
them before you play.

A "tell" is anything in the panorama that gives the location away: which side
they drive on, the shape of the bollards, licence-plate colours, the script on
the signs, utility poles, soil colour, road markings, architecture, and so on.

## Modes

- **🎯 Name the country** — clues are revealed one at a time; guess as early as
  you can (fewer clues = more points). After each answer the full tell sheet
  appears so you can ⭐ anything you'd have missed.
- **🃏 Recall the tells** — a flashcard shows a country; picture its streets and
  list the tells from memory, then flip to check. "I missed some" adds that
  country's tells to your watchlist.
- **🌍 Study the atlas** — browse every country, search by name or by tell
  (e.g. "bollard", "yellow plate"), and star the ones you overlook.
- **⭐ Tells I miss** — your personal watchlist, grouped by country. Skim it
  right before a round.

Use the **region filter** on the home screen to focus quizzes and flashcards on
one part of the world.

## Tech

Plain HTML/CSS/JS — no build step, no dependencies. Everything (including the
tell database in `data.js`) ships in the page, and a service worker caches it
for offline use, so it installs as a PWA and runs on a plane.

- `index.html` — screens and layout
- `style.css` — styling
- `data.js` — the tell database (`GG_COUNTRIES`, `GG_CATEGORIES`)
- `app.js` — modes, quiz logic, watchlist (stored in `localStorage`)
- `sw.js` / `manifest.webmanifest` — offline + installable

Your watchlist lives in your browser's `localStorage`; nothing is sent anywhere.

## Running

Serve the folder over HTTP (the service worker needs a real origin, not
`file://`):

```
cd geoguessr && python3 -m http.server 8000
# then open http://localhost:8000
```

On the published GitHub Pages site it lives at `/geoguessr/`.

## Adding tells

Edit `data.js`. Each country is an object with a `tells` map keyed by category
id (`drive`, `lang`, `plate`, `bollard`, `lines`, `signs`, `poles`, `arch`,
`land`, `car`, `misc`). A value is a string, or an array of strings for several
bullet points. Categories and their icons/labels live in `GG_CATEGORIES`.
