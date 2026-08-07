# Dashboard chart restyle — design

**Date:** 2026-08-07
**Branch:** `feat/dashboard`
**Status:** Approved for implementation, stage 1

## Problem

The five hand-built dashboard tabs share one chart kit (`charts.tsx`), and it is
the weakest thing on the screen. Flat strokes, a grey filled track behind every
bar, no reference line, no hover, and — the part that actually breaks reading —
two series drawn in colours nobody checked.

## What the audit found

`dataviz`'s rule is that the colour part is computable, so it gets computed. Run
against the dark card surface (`#262626`), the palette the kit ships today fails:

```
#9184F1 (accent) + #99e2d3 (teal)
  FAIL  normal-vision floor   ΔE 13.8  (threshold 15)
  FAIL  lightness band        both outside L 0.48–0.67
  FAIL  chroma floor          teal reads as grey
```

ΔE 13.8 means a reader with full colour vision struggles to tell the two lines
apart. Every pastel `--color-text-*` token in the theme fails the same way: they
are text colours, and text colours are not series colours.

## The palette

Two series is all the kit needs — no chart here draws a third. Snapped into the
validator's band per hue and re-run until every check passes, in both modes:

| Slot     | Dark (`#262626`) | Light (`#FFFFFF`) |
| -------- | ---------------- | ----------------- |
| Series 1 | `#7e74e1`        | `#6b5dcf`         |
| Series 2 | `#be7100`        | `#ab5a00`         |

```
ALL CHECKS PASS  (dark)   worst adjacent ΔE 27.8 normal, 27.8 protan
ALL CHECKS PASS  (light)  worst adjacent ΔE 27.8 normal, 27.4 protan
```

A third series is deliberately not defined. If one is ever needed it gets
validated then, not guessed — and the first question should be whether the chart
wants small multiples instead.

## Stage 1 — the kit

1. **Series tokens.** `--chart-series-1/2` as `light-dark()` pairs in
   `globals.css`, beside the theme import. The kit stops reaching for text and
   status tokens.
2. **Line treatment.** 2px stroke over a wider, low-opacity copy of the same path
   for the glow the reference is built on. Primary series only, and only where
   the surface is dark enough to carry it.
3. **Reference line.** A dashed horizontal at the series mean with a small end
   label. It is what turns a wiggle into a reading.
4. **End marker + value chip.** A dot on the last point and one pill with its
   value. `dataviz`'s selective direct labelling: one label, not forty.
5. **Hover layer.** Crosshair + tooltip on the line charts, per-mark tooltip on
   bars and heatmap cells. The kit has none today, and `dataviz` treats it as
   default-required for an HTML chart.
6. **Bars.** The filled grey track goes; 4px rounded ends anchored to the
   baseline, 2px gap between marks.

## Stage 2 — the tiles (not this commit)

Display number with the unit set smaller and lighter, and a micro-sparkline
bleeding to the tile's bottom edge where the same payload already carries the
trend.

**No deltas.** The reference's `+$2,956 / ▲6.25%` pills need a previous-period
comparison the API does not return. Inventing one is out of the question, and
adding period-over-period to five contracts is a bigger piece of work than this.
Where a comparison already exists in the payload (attendance against no-show) the
tile can state it; nowhere else.

## Not taken from the reference

- **Glow on everything.** It is the reference's signature at one moment and an AI
  tell everywhere else. One series, one glow.
- **The mesh-gradient promo panel.** It is an ad. This dashboard has nothing to
  sell its own operator.
- **Display type on every tile.** That is a landing page's density. A gym owner
  scanning six tabs needs the numbers close together, not each one shouting.

`taste-skill` was consulted and is explicitly out of scope for dashboards
(its Section 13). Its anti-slop bans are honoured; its landing-page layout rules
are not applied here, because they would make this screen worse.
