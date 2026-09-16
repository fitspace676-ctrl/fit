# Font binaries

**The six files are here.** JetBrains Mono v2.304 (from the upstream release's
`fonts/ttf/`) and Noto Sans Georgian v2.005 (from `notofonts/georgian`'s release
`full/ttf/`), with each family's `OFL.txt` beside them as attribution.

`src/tokens/fonts.ts` `require()`s all six by exact filename, so **removing or
renaming one breaks the Metro build** — the resolution happens at build time
from a static string, not at runtime. That hard failure is deliberate; see the
note in `fonts.ts`. The rest of this file records where they came from and why
these six weights and no others.

That failure is deliberate. The alternative — a lazy `require` or a silent
fallback to the system font — is exactly how the last package shipped a "no
emoji" design system with an emoji tab icon in it: a missing asset that nothing
complained about.

## What is here

| Filename (exact)                 | Family · weight          | Bytes (approx, full) |
| -------------------------------- | ------------------------ | -------------------- |
| `JetBrainsMono-Regular.ttf`      | JetBrains Mono · 400     | ~110 KB              |
| `JetBrainsMono-Medium.ttf`       | JetBrains Mono · 500     | ~110 KB              |
| `JetBrainsMono-SemiBold.ttf`     | JetBrains Mono · 600     | ~110 KB              |
| `JetBrainsMono-Bold.ttf`         | JetBrains Mono · 700     | ~110 KB              |
| `NotoSansGeorgian-Bold.ttf`      | Noto Sans Georgian · 700 | ~60 KB               |
| `NotoSansGeorgian-ExtraBold.ttf` | Noto Sans Georgian · 800 | ~60 KB               |

The filenames are not a suggestion. They are the literal strings in
`fontAssetMap()` in `src/tokens/fonts.ts`, and they are mirrored as data in
`FONT_FILES` in the same file. Metro resolves an asset `require()` at build time
from a static string, so a rename in this directory is a rename in that file.

## Where they came from

**JetBrains Mono** — SIL Open Font License 1.1.

- <https://github.com/JetBrains/JetBrainsMono/releases> → the release zip's
  `fonts/ttf/` directory, which already uses these exact filenames.
- Or Google Fonts: <https://fonts.google.com/specimen/JetBrains+Mono> (the
  download gives a `static/` directory with the same names).

**Noto Sans Georgian** — SIL Open Font License 1.1.

- <https://fonts.google.com/noto/specimen/Noto+Sans+Georgian> → download family →
  `static/NotoSansGeorgian-Bold.ttf` and `static/NotoSansGeorgian-ExtraBold.ttf`.
- The download also contains `NotoSansGeorgian-VariableFont_wdth,wght.ttf`.
  **Do not use it.** RN's `fontWeight` cannot drive a variable axis on either
  platform, so a variable file would have to be instanced at build time anyway —
  at which point it is these two static files with extra steps and a 180 KB
  download.

Both licences require shipping the OFL text with the binaries. Drop each
family's `OFL.txt` in beside them (`JetBrainsMono-OFL.txt`,
`NotoSansGeorgian-OFL.txt`); nothing imports them, they are the attribution.

## Why these six and not others

**Four mono weights, each as its own registered family name.** React Native does
not synthesise weights for a custom family on Android: `fontFamily: 'JetBrains
Mono'` + `fontWeight: '700'` renders the _regular_ face, because the platform
matches a bundled font by its exact PostScript name and has no weight-matching
fallback for non-system families. There is no flag for this. So the weight is
baked into the family name and `typography.ts` sets `fontFamily` _without_
`fontWeight` for every bundled face. The mono numerals are the direction's
signature accent at 26–34px — the giant time cropped off the edge of the class
block on `mobile-home-v2.tsx` — and no system mono on either platform looks like
it.

**Two Georgian heading weights, and no Georgian body weights** (decision Q4 on
top of D5). Body copy rides the system sans: free, already tuned by the user's
accessibility settings, and both platforms cover Georgian at body weights. But
Roboto has no 800, and roughly 40 nodes across the six mobile artboards are
`font-extrabold` — every screen title, every stat number, the membership block's
headline. Left to the system, all of them render at 700 on Android and the
direction's display weight, which is most of what makes the type read as this
product, is quietly lost. 700 is bundled alongside 800 so the two heading
weights come from one family and cannot disagree about metrics mid-page.

## Subsetting (optional, later)

~570 KB unsubsetted is acceptable for v1. If it needs to come down, subset with
`pyftsubset` to Latin + Georgian + the punctuation the catalogues use — the
Georgian faces drop to ~40 KB each and the mono faces to ~45 KB. Keep the
filenames identical if you do; nothing else in the package should have to know.

## After adding them

```
pnpm --filter @fit/mobile start --clear   # Metro caches asset resolution
```

The splash stays up until `useFormacoreFonts()` reports `loaded` — see the hook
in `src/tokens/fonts.ts` for why that gate is not optional.
