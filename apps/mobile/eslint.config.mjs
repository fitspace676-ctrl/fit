import config from '@fit/config/eslint';

/**
 * @fit/mobile — the shared preset plus two bans that close a class of bug each.
 *
 * Both are lint rules rather than conventions on purpose: a convention is only
 * as good as the reviewer who remembers it, and both of these failures are
 * invisible in a screenshot taken on an English device.
 */
export default [
  ...config,

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // ── 1. Never call `Intl`. ────────────────────────────────────────────
      //
      // `packages/i18n` exports `createNumberFormat` / `createDateTimeFormat`
      // because no browser ships Georgian locale data — `Intl` silently answers
      // with en-US, so a Georgian user sees English money and dates that also
      // disagree with the server's render. On the phone it is worse, not better:
      // Hermes' ICU is a subset of a browser's, and on Android it is whatever
      // the OS happens to have. `toLocaleDateString()` is the same bug wearing a
      // different hat, and is the form that actually shipped.
      //
      // Everything user-visible goes through `@fit/i18n`'s formatters.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.object.name='Intl']",
          message:
            'Never construct an Intl formatter — no runtime we ship carries Georgian locale data. Use createNumberFormat / createDateTimeFormat from @fit/i18n.',
        },
        {
          selector: "CallExpression[callee.object.name='Intl']",
          message:
            'Never call Intl — no runtime we ship carries Georgian locale data. Use createNumberFormat / createDateTimeFormat from @fit/i18n.',
        },
        {
          selector: "MemberExpression[object.name='Intl']",
          message:
            'Never reach into Intl — no runtime we ship carries Georgian locale data. Use createNumberFormat / createDateTimeFormat from @fit/i18n.',
        },
        {
          selector: 'MemberExpression[property.name=/^toLocale(String|DateString|TimeString)$/]',
          message:
            'toLocale*() delegates to Intl, which has no Georgian locale data — it renders en-US to Georgian users. Use createNumberFormat / createDateTimeFormat from @fit/i18n.',
        },
      ],

      // ── 2. Never import the full catalogue. ──────────────────────────────
      //
      // `@fit/i18n`'s `messages` (and the raw `en` / `ka`) is both catalogues:
      // 3509 keys, 2411 of them `admin`, plus the public marketing site. The app
      // has no code-splitting to shed that later — the entry graph is the
      // bundle. `@fit/i18n/member` is the 1044-key slice, and is also what the
      // `MessageKey` union is derived from, so importing the full catalogue
      // would quietly widen the typed key space as well as the bundle.
      //
      // Everything else from `@fit/i18n` — `Locale`, `locales`, `defaultLocale`,
      // `isLocale`, and both formatters — stays allowed.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@fit/i18n',
              importNames: ['messages', 'en', 'ka', 'Messages'],
              message:
                'Import the member slice instead: `@fit/i18n/member` (memberMessages / MemberMessages). The full catalogue is 3509 keys, 69% of them admin-only, and all of it would ship in the app bundle.',
            },
            {
              name: '@fit/i18n/locales/en.json',
              message: 'Import memberMessages from `@fit/i18n/member` instead.',
            },
            {
              name: '@fit/i18n/locales/ka.json',
              message: 'Import memberMessages from `@fit/i18n/member` instead.',
            },
          ],
        },
      ],
    },
  },
];
