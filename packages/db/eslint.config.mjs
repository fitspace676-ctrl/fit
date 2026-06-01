import config from '@fit/config/eslint';

export default [
  // Prisma's generated client is machine-authored; don't lint it.
  { ignores: ['generated/**'] },
  ...config,
];
