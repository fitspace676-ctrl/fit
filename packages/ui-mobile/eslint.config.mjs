import config from '@fit/config/eslint';

export default [
  ...config,

  // ---------------------------------------------------------------------------
  // The package/app line, enforced.
  //
  // This rule is load-bearing. `@fit/ui-mobile` is a *design* package: a
  // component belongs here iff it can be fully specified by the artboards
  // without naming a backend field, a route, an i18n key, or a query hook.
  // Every label — including every `accessibilityLabel` — is a required prop.
  //
  // The previous incarnation of this package had no such rule. Components drifted
  // toward app concerns, screens stopped being able to reuse them, a parallel
  // local kit grew inside the app, and the repo ended up shipping two design
  // systems and two tab bars. The ban below is what prevents the first step of
  // that sequence, so it is an error, not a warning, and it is not to be relaxed
  // for convenience: if something under `src/` needs one of these, the dependency
  // belongs in the *prop signature*, and the component belongs in
  // `apps/mobile/components/` instead.
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@fit/types',
              message:
                'Design components must not know backend shapes. Take the fields you render as props.',
            },
            {
              name: '@fit/i18n',
              message:
                'Design components ship no copy. Every label, including accessibilityLabel, is a required prop.',
            },
            {
              name: 'expo-router',
              message:
                'Design components must not know routes. Take an onPress handler and let the screen navigate.',
            },
            {
              name: '@tanstack/react-query',
              message:
                'Design components must not fetch. Take data, loading and error as props; the screen owns the query.',
            },
          ],
          patterns: [
            {
              group: ['@fit/types/*', '@fit/i18n/*', 'expo-router/*', '@tanstack/react-query/*'],
              message:
                'Banned in @fit/ui-mobile/src: app concerns (backend shapes, copy, routing, data fetching) must arrive as props.',
            },
          ],
        },
      ],
    },
  },
];
