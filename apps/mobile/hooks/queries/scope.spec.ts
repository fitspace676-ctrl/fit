import { describe, expect, it } from 'vitest';
import { UNSCOPED, gymScope } from './scope';

describe('gymScope', () => {
  it('passes a real gym id through and enables the query', () => {
    expect(gymScope('gym_a')).toEqual({ gymId: 'gym_a', enabled: true });
  });

  it('substitutes the placeholder and disables the query when there is no gym', () => {
    // `null` is a real state, not an error: hydrating, signed out, or signed in
    // with no active membership. All three render, none of them fetch.
    expect(gymScope(null)).toEqual({ gymId: UNSCOPED, enabled: false });
  });

  it('uses a placeholder no real gym id can equal', () => {
    // The placeholder is only safe because `enabled: false` means nothing is
    // ever written under it. Being unrepresentable as a real id is the second
    // line of defence.
    expect(UNSCOPED).toBe('');
    expect(UNSCOPED.length).toBe(0);
  });
});
