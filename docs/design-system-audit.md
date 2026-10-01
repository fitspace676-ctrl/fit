# დიზაინ სისტემის audit

2026-10-01 · მოცვა: `apps/admin`, `apps/platform`, `apps/mobile`, `packages/ui-mobile`, `packages/ui-web`, `packages/ui-kit`, `packages/astryx-theme`, `packages/config`.

ეს არის კოდის audit, არა ეკრანების ვიზუალური თანხვედრის დადასტურება. `docs/design-parity-audit.md` ისტორიულია: indigo/system-font აღწერა და mobile-ის წაშლის შენიშვნა მიმდინარე აღდგენილ mobile-ს აღარ შეესაბამება. `docs/tailwind-decommission.md` განსაზღვრავს მიგრაციის წესს; აქ ის არ მეორდება. Platform-ის ცალკე marketing დიზაინი განზრახაა — განსხვავება თავისთავად დეფექტი არ არის.

## Token-ების რუკა

| წყარო                                                                                | რას განსაზღვრავს                                                                                                                           | მომხმარებელი                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `forma-core-app/.workstation/design/_design/tokens.json`                             | ავტორიტეტული მხოლოდ `brand`, `ink`, `danger` raw ramps-ისთვის; ძველი ramp-ები და მხოლოდ dark მონაცემებიც დარჩენილია                        | mobile guard/test; პირდაპირი semantic წყარო არ არის                                       |
| `packages/astryx-theme/src/formacoreTheme.ts`                                        | Lime Block light/dark semantic ფერები, `--fc-*`, radius 10/14/26/32, typography base 16/ratio 1.2; `neutralTheme`-დან საბაზო scale/shadows | admin-ის Astryx theme + `ui-kit` CSS variables; `dist/formacore.css` გენერირებული შედეგია |
| `packages/astryx-theme/src/fitTheme.ts`                                              | ძველი theme-ის ცალკე განსაზღვრება                                                                                                          | package-ის მეორე theme; ფორმაკორის წყაროდ არ უნდა ჩაითვალოს                               |
| `packages/config/tailwind.config.base.mjs`                                           | lime brand, Noto/mono stack, card 12px, gutter 24px, overlay motion                                                                        | web Tailwind preset-ები; mobile-ის კონფიგურაციის საბაზო ფენა                              |
| `apps/admin/tailwind.config.mjs`                                                     | lime/ink/danger-ის ასლები, დამატებითი კატეგორიული ფერები; field/btn 14px, card 26px                                                        | ჯერ კიდევ Tailwind-ზე მყოფი admin კომპონენტები                                            |
| `apps/platform/tailwind.config.mjs`, `apps/platform/app/globals.css`                 | indigo brand, Aurora ფერები, `--surface/fg/panel`, light/dark; btn 12px/card 16px, Manrope/Archivo                                         | platform-ის Tailwind marketing და ადგილობრივი UI                                          |
| `packages/ui-kit/src/tokens.ts`                                                      | StyleX ფრაგმენტები: კონტროლები 36/40/44/48/56px, focus, surface, heading/micro/numeral                                                     | admin-ის ახალი კომპონენტები; shared web kit                                               |
| `packages/ui-web/src`                                                                | Astryx wrappers + ძველი Tailwind helpers (`buttonClasses`, Field და სხვ.)                                                                  | admin-ის თავსებადობის re-export-ები და დარჩენილი მომხმარებლები                            |
| `packages/ui-mobile/src/palette.mjs`                                                 | ერთადერთი literal წყარო mobile-ის სამი 11-საფეხურიანი ramp-ისთვის                                                                          | runtime palette და `tailwind.preset.mjs`                                                  |
| `packages/ui-mobile/src/tokens/{semantic,spacing,radii,typography,shadows,fonts}.ts` | light/dark semantic map; 4pt grid ნახევარი ნაბიჯებით; radius 10/14/26/32; type roles; RN shadow/elevation და ფონტები                       | `apps/mobile` და RN primitives; `tailwind.preset.mjs` ზომებს ცალკე იმეორებს               |

## რაოდენობრივი სურათი

Git-ში tracked `ts/tsx/js/jsx/mjs/css` ფაილები; გამორიცხულია `.test.`, `.spec.`, `.d.`, `dist`, `test-support`, `__tests__`, `vitest/jest/eslint/next.config`. **ეს არის ტექსტური დამთხვევების რაოდენობა, არა დეფექტების რაოდენობა:** მოიცავს კომენტარებს, token-ის განსაზღვრებებს, print/SVG/gradient შემთხვევებს. `rgb(var(...))`-ც ითვლება; underscore-იანი Tailwind `rgba` ამ regex-ში არ ხვდება. JSON assets/config და `rem` ამ ცხრილში არ შედის.

| სივრცე                  | ფაილები | hex | rgb/rgba |  px | numeric style |
| ----------------------- | ------: | --: | -------: | --: | ------------: |
| `apps/admin`            |     343 | 150 |       32 | 743 |           557 |
| `apps/platform`         |      42 | 133 |       15 |  97 |             2 |
| `apps/mobile`           |     178 |   2 |        0 |   8 |             7 |
| `packages/ui-mobile`    |      64 |  54 |       43 | 267 |            40 |
| `packages/ui-web`       |      12 |   6 |        0 |   5 |             0 |
| `packages/ui-kit`       |      22 |   4 |        3 |  78 |            27 |
| `packages/astryx-theme` |       3 |  82 |        8 |  19 |             0 |
| `packages/config`       |       3 |  11 |        0 |   0 |             0 |

კომპონენტებთან უფრო ახლოს მდგომი TSX ქვესიმრავლე (ტესტების გარეშე, კომენტარებით):

| სივრცე               | TSX ფაილები | hex | rgb/rgba |  px | numeric style |
| -------------------- | ----------: | --: | -------: | --: | ------------: |
| `apps/admin`         |         241 |  46 |       24 | 736 |           547 |
| `apps/platform`      |          28 |  24 |        6 |  94 |             2 |
| `apps/mobile`        |          80 |   1 |        0 |   7 |             7 |
| `packages/ui-mobile` |          41 |   2 |        6 |  90 |            39 |
| `packages/ui-web`    |          10 |   6 |        0 |   5 |             0 |
| `packages/ui-kit`    |          19 |   4 |        3 |  61 |            25 |

Mobile app-ის ორივე hex კომენტარშია (`lib/theme-preference.ts`, `providers/ThemePreferenceProvider.tsx`); `app.json`-ის ფიქსირებული splash ფერი ცალკე კონფიგურაციაა. შესაბამისად ამ მონაცემიდან „mobile-ში ორი hardcoded ფერის დარღვევა“ არ გამომდინარეობს.

გამეორება: შემდეგი სკრიპტი თითო სივრცეზე ბეჭდავს ყველა ფაილისა და TSX ქვესიმრავლის შედეგს. მაგალითების გადასამოწმებლად: `git grep -n -E '#[0-9a-fA-F]{3,8}|rgba?\(' -- apps/admin apps/platform apps/mobile packages/ui-mobile`.

```python
import pathlib, re, subprocess

roots = ["apps/admin", "apps/platform", "apps/mobile", "packages/ui-mobile",
         "packages/ui-web", "packages/ui-kit", "packages/astryx-theme", "packages/config"]
files = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
patterns = [r"#[0-9a-fA-F]{3,8}\b", r"\brgba?\(", r"\b\d+(?:\.\d+)?px\b",
            r"\b(?:fontSize|lineHeight|letterSpacing|padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?|margin(?:Horizontal|Vertical|Top|Bottom|Left|Right)?|gap|borderRadius|width|height)\s*:\s*\d+(?:\.\d+)?\b"]
for root in roots:
    selected = [f for f in files if f.startswith(root + "/")
                and re.search(r"\.(?:ts|tsx|js|jsx|mjs|css)$", f)
                and not re.search(r"(?:\.(?:test|spec|d)\.|/(?:dist|test-support|__tests__)/|(?:vitest|jest|eslint|next)\.config)", f)]
    for subset in (selected, [f for f in selected if f.endswith(".tsx")]):
        texts = [pathlib.Path(f).read_text() for f in subset]
        print(root, len(subset), [sum(len(re.findall(p, t)) for t in texts) for p in patterns])
```

## პრობლემები და გადაწყვეტილებები

| სიმძიმე | სად                                                                                     | რა                                                                                                                                             | გასწორება                                                                                          |
| ------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| მაღალი  | `scripts/check-design-tokens.ts`                                                        | semantic მნიშვნელობის palette-ში არსებობას ამოწმებს, მაგრამ web/mobile შესაბამისი როლების თანასწორობას არა; არ ფარავს admin/platform palette-ს | ცალკე PR: semantic წყვილების mapping + განზრახ გამონაკლისების ledger                               |
| საშუალო | `apps/admin/tailwind.config.mjs`, `packages/config/tailwind.config.base.mjs`            | brand/ink/danger ასლები; guard base-ის მხოლოდ brand-ს ამოწმებს                                                                                 | ჯერ equality checks, შემდეგ ცალკე PR-ში source-ის გაერთიანება                                      |
| საშუალო | `apps/admin/components/nav-icon.tsx`, `sidebar.tsx`, `door-frame.tsx`                   | `#63701D`, `#E4F26A`, `#131312` პირდაპირ კოდშია                                                                                                | როლისა და ორივე რეჟიმის დადასტურების შემდეგ token; ფოტო-overlay/print ავტომატურად არ შეიცვალოს     |
| საშუალო | `packages/ui-web/src/button.tsx`, `apps/platform/components/marketing/marketing-ui.tsx` | gradient/shadow და button variant ლოგიკა რამდენიმე ადგილასაა                                                                                   | მიგრაციის ფარგლებში consumers-ის ინვენტარიზაცია; ვიზუალური გაერთიანება — **ეკითხება მომხმარებელს** |
| საშუალო | `packages/ui-mobile/tailwind.preset.mjs`                                                | glass/header/scrim utilities მხოლოდ dark მნიშვნელობებს შეიცავს, runtime კი light/dark-ს არჩევს                                                 | ახალი light UI-ისთვის runtime semantic tokens; preset-ის ცვლილება ცალკე light/dark QA-ით           |
| საშუალო | `apps/platform/app/layout.tsx`                                                          | `lang="en"`, Manrope/Archivo latin subsets; ქართული დიზაინური font stack არ არის                                                               | ქართული marketing-ის საჭიროება და Noto-ზე გადასვლა — **ეკითხება მომხმარებელს**                     |
| დაბალი  | `packages/ui-mobile/src/tokens/fonts.ts`                                                | ერთ კომენტარში უკვე tracked ფონტები კვლავ „არ არსებობს“                                                                                        | ამ PR-ში გასწორდა; font loading არ შეცვლილა                                                        |
| დაბალი  | `packages/ui-mobile/src/tokens/spacing.ts`                                              | მინიმალური touch target 44 ცალკე literal იყო                                                                                                   | ამ PR-ში `spacing[11]`; შედეგი ისევ 44                                                             |
| დაბალი  | `docs/design-parity-audit.md`, `docs/tailwind-decommission.md`                          | ძველი parity დასკვნა; migration ცხრილში ძველი/გამოტოვებული გზებიცაა (`payments/transactions`, `trainers`, `automation`, `packages/ui-kit/src`) | ისტორიის შენარჩუნებით მიმდინარე manifest-ზე მიმართვა; ცალკე docs PR                                |

## Web/mobile შეუსაბამობები

- **ფერების სახელები:** mobile `accent` semantic როლი lime-ია; raw `accent` ramp არ არსებობს. Admin Tailwind `accent` ink-ია, platform `accent` კი ლურჯი. ერთნაირი სახელით კლასის გადატანა უსაფრთხო არ არის. Admin-ის `info/iris/teal/flame` კატეგორიული ფერები განზრახ რჩება; mobile-ის სამი ramp-ის წესს web-ზე ბრმად არ ვავრცელებთ.
- **Light/dark:** Astryx theme CSS variables და RN `colorTuples` ცალკე რეალიზაციებია; platform-ს თავისი RGB ცვლადები აქვს. `check:design-tokens`-ის გავლა არ ადასტურებს ყველა semantic როლის ან ეკრანის თანხვედრას.
- **Typography:** web theme base 16/ratio 1.2; kit-ს ხელით განსაზღვრული ფრაგმენტებიც აქვს. Mobile body 15/21, display 34/38, heading 24/28; `micro` 10/13 და tracking 0.10em, kit micro 10px და 0.16em. Android-ის ქართული ჩამომავალი ასოების დასატევად mobile line-height განზრახ გაზრდილია. ეს „გასასწორებელი typo“ არ არის.
- **Spacing/controls:** mobile 4pt grid და 36/40/44/56 კონტროლები; kit დამატებით 48-ს იყენებს. Web `rem` root font-size-ზეა დამოკიდებული, RN რიცხვები logical points-ია; px დათვლა RN-ის ყველა ზომას ვერ ხედავს. Runtime/preset spacing და radius ასლების თანხვედრას უკვე `tokens.spec.ts` ამოწმებს.
- **Radius/shadows:** admin/theme/mobile 10/14/26/32 შეესაბამება ერთმანეთს 16px web root-ის პირობებში; platform 12/16 ცალკე დიზაინია. RN `shadows.ts` web-ის მრავალფენიან shadow-ს ერთ shadow/elevation-ში აერთიანებს — pixel parity შეუძლებელი მოთხოვნაა.

## კომპონენტების დუბლირება და ქართული

ოთხი button ოჯახია: `packages/ui-kit/src/button.tsx`, `packages/ui-web/src/button.tsx`, `packages/ui-mobile/src/forms/button.tsx`, platform-ის `components/marketing/marketing-ui.tsx`. Field/Card-იც არსებობს kit-ში, legacy web-ში და RN-ში; RN `feedback/sheet.tsx` და web `ui-kit/src/drawer.tsx` განსხვავებულ პლატფორმულ ქცევას ემსახურება. ესენი ავტომატურად წასაშლელი დუბლიკატები არ არის. Admin-ის `components/ui/button.tsx`/`primitives.tsx` re-export-ებია; `form-fields.tsx` react-hook-form adapter-ია, `button-link.tsx` — Next routing adapter. ამ PR-ში არცერთი არ წაიშალა.

Admin `i18n/request.ts` იყენებს `@fit/i18n` + `next-intl`-ს; mobile `providers/I18nProvider.tsx` იმავე კატალოგებს საკუთარი resolver-ით კითხულობს, ka fallback-ით. Mobile-ის `catalogue.spec.ts` ამოწმებს გასაღებებს, interpolation-სა და plural-ებს. Admin Noto Sans Georgian-ს ყველა ძირითად ტექსტზე ტვირთავს; mobile 700/800 Noto-ს, 400–600 system sans-ს და რიცხვებისთვის JetBrains Mono-ს იყენებს. `packages/ui-mobile/src/forms/text-field.tsx` უკვე sentence-case `caption`-ს იყენებს; ეს შესწორება აღარ მეორდება. დარჩენილი `uppercase` micro/label როლები ცალკე უნდა შემოწმდეს ქართული მხედრულის მოთხოვნასთან: ლათინურისთვის დაწერილი transform ქართული სათაურებისთვის ავტომატურ წესად არ ჩაითვალოს. ვიზუალური QA უნდა მოიცავდეს „ჟღჯცძყფქ“, მრავალსტრიქონიან label-ს და გაზრდილ font scale-ს ორივე OS-ზე.

## გეგმა — თითო ნაბიჯი ცალკე PR

1. **ეს PR:** audit + ორი უვიზუალო უსაფრთხო ცვლილება. აშკარად უსაფრთხო კომპონენტის წაშლა ან glyph-ის ცვლილება ვერ დადასტურდა; არ შესრულდა.
2. **Guard coverage:** web/mobile semantic mapping და admin ramp equality, ცნობილი განსხვავებების ledger. არსებული palette/icon და NativeWind token ტესტები არ დუბლირდეს.
3. **წყაროების გაერთიანება:** მხოლოდ თანაბარი ramp-ების გაზიარება; generated `dist` მხოლოდ `pnpm --filter @fit/astryx-theme theme:build`-ით. ცვლილებამდე/შემდეგ მნიშვნელობების equality.
4. **Legacy primitives:** თითო PR-ში ერთი ოჯახის call sites (Button, შემდეგ Field/Card); Tailwind-ის ამოღება მიჰყვეს არსებულ decommission გეგმას. დიზაინის ცვლილება — **ეკითხება მომხმარებელს**.
5. **ქართული და ვიზუალური parity:** ცალკე გადაწყვეტილება marketing-ის ენაზე/ფონტებზე, micro tracking-ზე, uppercase/Mkhedruli-ზე და mobile body stack-ზე — **ეკითხება მომხმარებელს**. შემდეგ light/dark, ka/en, iOS/Android და გაზრდილი ტექსტის ვიზუალური შემოწმება.

## შემოწმებები

| ბრძანება                            | შედეგი                                                   |
| ----------------------------------- | -------------------------------------------------------- |
| `pnpm type-check`                   | წარმატებული: 32/32 Turbo tasks                           |
| `pnpm lint`                         | წარმატებული: 32/32 Turbo tasks                           |
| `pnpm --filter @fit/ui-mobile test` | 6 ფაილი, 297 ტესტი წარმატებული                           |
| `pnpm format:check`                 | წარმატებული                                              |
| `pnpm check:design-tokens`          | 33 color stops, 56 semantic roles, 60 icons; წარმატებული |
| `pnpm check:tailwind-guardrail`     | 285 ფაილი, 29 guarded path; წარმატებული                  |

ტესტები გაშვებულია შეცვლილი პაკეტისთვის; სრული monorepo `pnpm test` არ გაშვებულა. Turbo-ს ჰქონდა მხოლოდ არსებული build-output warnings (`i18n/types/ui-mobile/utils`). ეკრანის runtime სტილი არ შეცვლილა; ვიზუალური QA ამ PR-ში არ ჩატარებულა.
