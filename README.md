# Study guides

Offline study apps for certification exams, published with GitHub Pages at **https://kanaparthysaisreekar.github.io/guides/**.

The site is a hub of guides. Every guide has the same two apps, and each works offline once it has been opened:

| App | For | What it is |
|---|---|---|
| **Study Portal** | a laptop (phones work too) | The guide's study material, cheat sheet, practice and mock exams |
| **Flashcards** | a phone | Concept cards and the practice questions, tap to reveal and swipe to move on |

| Guide | Portal | Flashcards |
|---|---|---|
| **CCAR-P**, Claude Certified Architect – Professional | [`/ccarp/portal/`](https://kanaparthysaisreekar.github.io/guides/ccarp/portal/) | [`/ccarp/flashcards/`](https://kanaparthysaisreekar.github.io/guides/ccarp/flashcards/) |
| **GCP-PCA**, Google Cloud Professional Cloud Architect | [`/gcp-pca/portal/`](https://kanaparthysaisreekar.github.io/guides/gcp-pca/portal/) | [`/gcp-pca/flashcards/`](https://kanaparthysaisreekar.github.io/guides/gcp-pca/flashcards/) |

These are unofficial study aids, not affiliated with Anthropic or Google. The GCP-PCA content was checked against Google's documentation on
14 October 2026; [`guides/gcp-pca/VERIFICATION.md`](guides/gcp-pca/VERIFICATION.md) records what was checked, what changed and what could not be confirmed.

## Layout

```
guides/
├─ docs/               the built site that GitHub Pages serves. Generated: never edit by hand
├─ guides/             one folder per guide
│  ├─ ccarp/           guide.json, content/ (bank, guide pages, cheat sheet, cards), cards.mjs, icons/
│  └─ gcp-pca/         guide.json, content/ (questions, sections, cards), cards.mjs, icons/, fonts/, VERIFICATION.md
├─ engine/             the apps, shared by every guide
│  ├─ portal/          Study Portal for blueprint-driven guides (CCAR-P): forms, readiness, plan
│  ├─ guidebook/       Study Portal for tabbed guides (GCP-PCA): plan, syllabus, cheat sheet, cases, mocks
│  ├─ flashcards/      the Flashcards app
│  └─ shared/          fonts and design tokens
├─ site/               the hub, guide homes and 404 (stylesheet, icon) and the usage-log script
├─ tools/              build, validators, icon and font helpers, a local preview server
├─ test/               unit tests and headless-Chrome checks
├─ analytics/          the usage-log collector (Cloudflare Worker + D1) and its dashboard
├─ dist/               standalone offline files per app (ignored by git)
└─ .cache/, reference/ scratch and local-only reference material (ignored by git)
```

A guide is a folder `guides/<slug>/` with a `guide.json`. Each app in it names its engine (`portal`, `guidebook` or `flashcards`) and the
build does the rest. The Flashcards engine takes its cards from the guide's own `cards.mjs`.

## Build, preview and test

Node 24 or newer, no dependencies. Headless Chrome (or Edge) is needed for the browser tests.

```
node tools/build.mjs                      # every guide: dist/<guide>/<app>.html and the hosted site in docs/
node tools/build.mjs --only gcp-pca       # one guide
node tools/build.mjs <dir> --no-analytics # build somewhere else, without the usage log
node tools/serve.mjs                      # preview docs/ at http://localhost:8080/guides/
```

| Check | Command |
|---|---|
| Unit tests (engine, plan, collector) | `npm test` |
| CCAR-P content validators | `npm run validate` |
| CCAR-P portal flows in Chrome | `node test/flows.mjs` |
| Flashcards: CCAR-P flows | `node test/fc-qa.mjs` |
| Flashcards: any guide, every deck and question set | `node test/fc-smoke.mjs --guide gcp-pca` |
| The hosted site (hub, guides, offline, usage log) | `node test/site-live.mjs --serve docs` |
| The live site | `node test/site-live.mjs https://kanaparthysaisreekar.github.io` |

Test builds should point the usage log at the local collector so they do not write to the real one:
`node tools/build.mjs <dir> --endpoint http://localhost:8767/e`, then `node test/site-live.mjs --serve <dir>`.

## Publishing

GitHub Pages serves `docs/` from `main`. Change sources, commit them, then rebuild and commit `docs/`:

```
node tools/build.mjs && git add -A && git commit && git push
```

Builds are stamped with the date of the last commit that touched their sources, not the clock, so rebuilding unchanged sources gives
identical files and installed copies refresh only when something changed. Build after committing the sources.

Each app keeps its own service worker, cache and manifest under its own path, so apps never touch each other. Progress lives in each
browser's localStorage under fixed keys, and every page shares one origin, so moving an app to a new path keeps it. An app that moves
inside its guide is listed in `guide.json` under `moved`: the old address forwards to the new one and retires its offline copy
(`/gcp-pca/field-guide/` became `/gcp-pca/portal/` this way). The old CCAR-P address on the `ccarp-flashcards` repository is handled the
same way with `node tools/build.mjs --legacy <checkout>`.

## Adding a guide

1. `guides/<slug>/guide.json`: `code`, `name`, `summary`, `order`, and its `apps` (`slug`, `engine`, `name`, `title`, `shortName`,
   `description`, `fit`, `device`, `head`, optional `files` for self-hosted fonts).
2. The content its engines need, in `guides/<slug>/content/`: for `guidebook`, `meta.json`, `sections.json`, `sections/*.html`,
   `questions.json`, `data.json` and `footer.html` (see the header of `tools/build-guidebook.mjs`); for `portal`, the blueprint, item bank and
   core files CCAR-P uses; for `flashcards`, a `guides/<slug>/cards.mjs` whose default export returns `{ data }` (see `guides/gcp-pca/cards.mjs`).
3. Icons: `guides/<slug>/icons/<app>-180|192|512.png`. Add the art to `tools/make-icons.mjs` and run it.
4. `test/site-live.mjs`: one readiness line per app in `APPS`. `analytics/dashboard.html`: the app's display name.
5. Build, run the tests, commit, push.

## Usage log

The hosted pages record who opened what and what they studied, as an audit trail for the site's owner: opens, page views, active time,
sessions and their scores, every answered question and rated card, with a random device id, the IP address, location and browser from
Cloudflare's edge. Each visitor sees a one-time notice. Named links such as `.../ccarp/?u=asha` label a device. The standalone files
in `dist/` never include it and stay network-free.

The collector is a Cloudflare Worker with a D1 database at `https://guides-audit.kana-hive.workers.dev`, dashboard at `/admin`. Its admin
key is kept in `analytics/.admin-token`, which is not in git. `node analytics/deploy.mjs` deploys it (Cloudflare account credentials
come from the environment), `node analytics/local.mjs` runs it locally, and `node tools/build.mjs --no-analytics` publishes without it.
The apps only announce events (`guides:track` DOM events); `site/track.js` queues them and sends them when online.

## Licences

Fonts are IBM Plex and Bricolage Grotesque (SIL OFL 1.1, licence files alongside). Icons in the portal are Phosphor (MIT). The CCAR-P
portal's About page credits the community sources it draws on.
