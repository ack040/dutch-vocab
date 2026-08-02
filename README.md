# Dutch Vocab A1–C1 📱

An offline mobile quiz app for practising Dutch↔English vocabulary across CEFR levels A1–C1.

## Features

- **CEFR levels A1, A2, B1, B2, C1** — ~2,600 words total (A1 479, A2 354, B1 635, B2 710, C1 483): nouns with de/het article, verbs, adjectives, adverbs and connectors; each round draws only from your chosen level
- **Adaptive difficulty** — instead of a fixed level, take a short **placement test** (12 adaptive questions) and study a personalised **mix** of levels (e.g. *A2 22% · B1 49% · B2 29%*). Your ability drifts up or down after each round based on your score. A fixed single level is still available for focused drilling
- **User profiles** — register a name and study mode on the landing page; each user keeps their **own** best scores and mistakes. Switch user, level, or retake the placement test any time from the home screen's **Change** button
- **Three modes** — Nederlands → English, English → Nederlands, or mixed
- **🎯 Practice mistakes** — drill only the words you've missed (per level)
- **20 multiple-choice questions per round**, 4 options each, with instant feedback
- **"I don't know"** to skip without guessing, and **Show all translations** to reveal every option's meaning inline
- **Smart distractors** — wrong options match the word class of the answer and never overlap in meaning with the correct one
- **Best-score table (top 10) with dates and level**, stored on your device
- **Works fully offline** — it's a PWA with a network-first service worker: always up to date online, fully usable offline
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
