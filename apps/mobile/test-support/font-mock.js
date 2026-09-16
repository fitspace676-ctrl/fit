// A stand-in for a bundled font binary.
//
// `@fit/ui-mobile`'s `fontAssetMap()` does six STATIC `require()`s of
// `apps/mobile/assets/fonts/*.ttf`, and Metro answers such a require with a
// numeric asset id — which is why the call sites are typed `as number`. Jest has
// no asset pipeline, so `jest.config.js` maps every font extension here and this
// module is that id.
//
// It also papers over a real gap, and the papering is deliberate rather than
// accidental: **the six font binaries are not in the repository.** `fonts.ts`
// claims that until they land `useFormacoreFonts()` "reports `loaded: false`
// with an error", but that is not what a missing static `require` does — under
// Metro it is a BUNDLE-TIME resolution failure, so the app does not start at all
// rather than starting with the system fallback. Without this mapping the same
// failure lands in Jest as `Cannot find module '…/JetBrainsMono-Regular.ttf'`
// thrown out of the root layout's first render.
//
// Owed back to WP-1 / the assets drop: either commit the six files, or make
// `fontAssetMap()` tolerate their absence (a `try`/`catch` around the requires,
// reporting the error the header already promises). This mock keeps the render
// suite honest about everything else in the meantime; it does not make the
// missing binaries a solved problem.
module.exports = 1;
