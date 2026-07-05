import { describe, expect, it } from 'vitest';
import { isCommandAvailable } from './exec';

describe('isCommandAvailable', () => {
  it('resolves a real executable on PATH (node)', () => {
    // Runs on every platform CI targets; proves the POSIX `command -v` probe
    // works through a shell rather than ENOENT-ing on a bare `command`.
    expect(isCommandAvailable('node')).toBe(true);
  });

  it('reports a nonexistent command as unavailable', () => {
    expect(isCommandAvailable('definitely-not-a-real-binary-xyz')).toBe(false);
  });
});
