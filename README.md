# Study guides

Offline study apps for certification exams. Each one opens on a phone or a laptop and keeps working without a connection.

Live at https://kanaparthysaisreekar.github.io/guides/ (GitHub Pages, `main` branch, root). Every file here is generated; do not edit by hand.

| Path | What |
|---|---|
| `/` | Hub: lists every guide (generated from each `<guide>/guide.json`) |
| [`/ccarp/`](https://kanaparthysaisreekar.github.io/guides/ccarp/) | CCAR-P home: [Study Portal](https://kanaparthysaisreekar.github.io/guides/ccarp/portal/), [Flashcards](https://kanaparthysaisreekar.github.io/guides/ccarp/flashcards/) |
| `/<guide>/<app>/` | One app: its own service worker scope, cache, manifest and icons, so apps never touch each other |
| `/assets/` | Fonts, stylesheet and icon shared by the hub, guide homes and `404.html` |

## Adding a guide or an app

A guide is a folder `<guide>/` holding `guide.json`, `index.html` and one folder per app. Its build writes that folder
and then regenerates the hub, `404.html` and `assets/`; other guides' folders are left alone. For CCAR-P, from the
source folder (`portal-src`): describe the guide in `site/<guide>.json`, then

```
node tools/build.mjs                         # the Study Portal single file
node tools/build-site.mjs <this checkout>    # rebuilds the flashcards, writes ccarp/ and the hub
node test/site-live.mjs --serve <this checkout>
```

Commit and push; installed copies pick up the new version in the background and show it on the next launch.
Progress lives in each browser's localStorage under fixed keys, and every page here shares one origin, so moving an app
to a new path keeps it.
