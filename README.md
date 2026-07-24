# Dutch Vocab B1–B2 📱

An offline mobile quiz app for practising Dutch↔English vocabulary at B1–B2 level.

## Features

- **520 curated B1–B2 words** — nouns (with de/het article), verbs, adjectives, adverbs and connectors
- **Three modes** — Nederlands → English, English → Nederlands, or mixed
- **20 multiple-choice questions per round**, 4 options each, with instant feedback
- **Smart distractors** — wrong options match the word class of the answer and never overlap in meaning with the correct one
- **Mistake review** at the end of each round
- **Best-score table (top 10) with dates**, stored on your device
- **Works fully offline** — it's a PWA: after the first visit everything is cached, no connection needed
- Light & dark mode, installable to your home screen

## How to use it on your phone

The app is plain HTML/CSS/JS — it just needs to be served over HTTPS once so your phone can cache it.

**Easiest: GitHub Pages**

1. In this repo go to **Settings → Pages**
2. Under *Build and deployment*, choose **Deploy from a branch**, select `main` and `/ (root)`, and save
3. Open the published URL (`https://<user>.github.io/dutch-vocab/`) on your phone
4. Add it to your home screen (*Share → Add to Home Screen* on iOS, *Install app* in the ⋮ menu on Android)

From then on it works with no internet connection. Scores are saved in the browser's local storage on the device.

## Development

No build step. Serve the folder with any static server and open it:

```sh
python3 -m http.server 8000
```

- `data.js` — the vocabulary list (add words here: `{ nl: "...", en: "..." }`)
- `app.js` — quiz logic and score storage
- `sw.js` — service worker (bump the `CACHE` version when you change files)
