import { describe, expect, it } from 'vitest';
import { boolFlag, parseArgs, stringFlag } from './args';

describe('parseArgs', () => {
  it('separates positionals from flags', () => {
    const { positionals, flags } = parseArgs(['get', 'DATABASE_URL', '--env', 'prod']);
    expect(positionals).toEqual(['get', 'DATABASE_URL']);
    expect(flags).toEqual({ env: 'prod' });
  });

  it('supports --flag=value form', () => {
    const { flags } = parseArgs(['--env=preview', '--pretty']);
    expect(flags.env).toBe('preview');
    expect(flags.pretty).toBe(true);
  });

  it('treats a flag followed by another flag as boolean', () => {
    const { flags } = parseArgs(['--pretty', '--env', 'local']);
    expect(flags.pretty).toBe(true);
    expect(flags.env).toBe('local');
  });

  it('treats a trailing flag as boolean', () => {
    const { flags } = parseArgs(['status', '--help']);
    expect(flags.help).toBe(true);
  });
});

describe('flag readers', () => {
  it('stringFlag returns strings only', () => {
    const { flags } = parseArgs(['--role', 'MANAGER', '--pretty']);
    expect(stringFlag(flags, 'role')).toBe('MANAGER');
    expect(stringFlag(flags, 'pretty')).toBeUndefined();
    expect(stringFlag(flags, 'absent')).toBeUndefined();
  });

  it('boolFlag recognizes presence and "true"', () => {
    const { flags } = parseArgs(['--pretty', '--verbose=true', '--quiet=false']);
    expect(boolFlag(flags, 'pretty')).toBe(true);
    expect(boolFlag(flags, 'verbose')).toBe(true);
    expect(boolFlag(flags, 'quiet')).toBe(false);
    expect(boolFlag(flags, 'absent')).toBe(false);
  });
});
