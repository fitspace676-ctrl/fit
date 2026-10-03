import { describe, expect, it } from 'vitest';
import { gymJoinCardSettingsSchema } from './gym-settings';
import { resolveJoinCard, type JoinCardDefaults } from './join-card';

/** The built-in copy, as `auth.join` would hand it over in one language. */
const DEFAULTS: JoinCardDefaults = {
  title: 'First time here?',
  titleNamed: 'Not at {gym} yet?',
  subtitle: 'Pick a branch and a plan.',
  benefits: ['Branch', 'Plan', 'Instant'],
  cta: 'Become a member',
};

const card = (input: unknown) => gymJoinCardSettingsSchema.parse(input);

describe('resolveJoinCard', () => {
  // The contract the whole feature rests on: a gym that never opened the card
  // gets exactly the screen it had before.
  it('renders the built-in copy for an untouched gym', () => {
    expect(resolveJoinCard(card({}), 'en', DEFAULTS, 'Downtown')).toEqual({
      title: 'Not at Downtown yet?',
      subtitle: 'Pick a branch and a plan.',
      benefits: ['Branch', 'Plan', 'Instant'],
      cta: 'Become a member',
    });
  });

  it('uses the unnamed heading when no gym is in scope', () => {
    expect(resolveJoinCard(card({}), 'en', DEFAULTS, null)?.title).toBe('First time here?');
  });

  it('takes each line the gym wrote, in the visitor’s language only', () => {
    const custom = card({
      ka: { title: 'მოდი {gym}-ში', cta: 'შემოგვიერთდი' },
      en: { subtitle: 'Your first class is free.' },
    });
    expect(resolveJoinCard(custom, 'ka', DEFAULTS, 'Downtown')).toMatchObject({
      title: 'მოდი Downtown-ში',
      subtitle: 'Pick a branch and a plan.',
      cta: 'შემოგვიერთდი',
    });
    expect(resolveJoinCard(custom, 'en', DEFAULTS, 'Downtown')).toMatchObject({
      title: 'Not at Downtown yet?',
      subtitle: 'Your first class is free.',
      cta: 'Become a member',
    });
  });

  // `{gym}` with no gym in scope (apex domain, preview URL) must not leak the
  // raw token onto the page.
  it('drops the {gym} token when there is no gym name', () => {
    expect(
      resolveJoinCard(card({ en: { title: 'Join {gym}' } }), 'en', DEFAULTS, null)?.title,
    ).toBe('Join');
  });

  it('keeps a custom list, and an empty one means no ticks', () => {
    expect(
      resolveJoinCard(card({ en: { benefits: ['Free trial'] } }), 'en', DEFAULTS, null)?.benefits,
    ).toEqual(['Free trial']);
    expect(resolveJoinCard(card({ en: { benefits: [] } }), 'en', DEFAULTS, null)?.benefits).toEqual(
      [],
    );
  });

  it('returns null when the gym hid the card', () => {
    expect(resolveJoinCard(card({ hidden: true }), 'en', DEFAULTS, 'Downtown')).toBeNull();
  });

  // A locale the contract has no slot for reads the default copy rather than
  // throwing on the sign-in screen.
  it('falls back to the built-in copy for an unknown locale', () => {
    expect(resolveJoinCard(card({ en: { cta: 'Join' } }), 'de', DEFAULTS, null)?.cta).toBe(
      'Become a member',
    );
  });
});
