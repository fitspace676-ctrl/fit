import config from '@fit/config/eslint';

export default [
  ...config,
  {
    // NestJS injects dependencies via constructor parameter *types*, which the
    // TS compiler emits as runtime metadata. `consistent-type-imports` would
    // rewrite those to `import type`, erasing the values DI needs — so it's
    // disabled for the API service.
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
