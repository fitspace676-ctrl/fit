import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatMessage,
  interpolate,
  resolveMessage,
  setMissingMessageHandler,
  translate,
  translatePlural,
  type Catalogues,
  type MessageTree,
} from './resolve';

const ka: MessageTree = {
  qr: {
    title: 'ჩექ-ინი',
    refreshesIn: 'განახლდება {time}-ში',
  },
  billing: {
    credits: {
      sessionsOne: '{count} სესია',
      sessionsOther: '{count} სესია',
    },
  },
  onlyKa: 'მხოლოდ ქართულად',
};

const en: MessageTree = {
  qr: {
    title: 'Check in',
    refreshesIn: 'Refreshes in {time}',
  },
  billing: {
    credits: {
      sessionsOne: '{count} session',
      sessionsOther: '{count} sessions',
    },
  },
  classes: {
    detail: { minutes: '{count, plural, one {# minute} other {# minutes}}' },
  },
  training: {
    packages: { confirmTitle: 'Buy {name}? {name} is a good pick.' },
  },
};

const catalogues = { ka, en } as unknown as Catalogues;

afterEach(() => {
  setMissingMessageHandler(null);
});

describe('resolveMessage', () => {
  it('resolves a dot path to its leaf string', () => {
    expect(resolveMessage(en, 'qr.title')).toBe('Check in');
    expect(resolveMessage(en, 'billing.credits.sessionsOne')).toBe('{count} session');
  });

  it('resolves a top-level leaf', () => {
    expect(resolveMessage(ka, 'onlyKa')).toBe('მხოლოდ ქართულად');
  });

  it('returns undefined — not "[object Object]" — when the key names a group', () => {
    expect(resolveMessage(en, 'qr')).toBeUndefined();
    expect(resolveMessage(en, 'billing.credits')).toBeUndefined();
  });

  it('returns undefined for a missing segment', () => {
    expect(resolveMessage(en, 'qr.nope')).toBeUndefined();
    expect(resolveMessage(en, 'nope.at.all')).toBeUndefined();
  });

  it('returns undefined when a path walks through a string', () => {
    expect(resolveMessage(en, 'qr.title.deeper')).toBeUndefined();
  });

  it('returns undefined for an empty path or an absent tree', () => {
    expect(resolveMessage(en, '')).toBeUndefined();
    expect(resolveMessage(undefined, 'qr.title')).toBeUndefined();
  });

  it('does not walk the prototype chain', () => {
    expect(resolveMessage(en, 'constructor')).toBeUndefined();
    expect(resolveMessage(en, 'qr.toString')).toBeUndefined();
  });
});

describe('interpolate', () => {
  it('substitutes a placeholder', () => {
    expect(interpolate('Refreshes in {time}', { time: '4:20' })).toBe('Refreshes in 4:20');
  });

  it('substitutes every repeat of the same placeholder', () => {
    expect(interpolate('Buy {name}? {name} is a good pick.', { name: 'Gold' })).toBe(
      'Buy Gold? Gold is a good pick.',
    );
  });

  it('coerces numbers', () => {
    expect(interpolate('{count} sessions', { count: 7 })).toBe('7 sessions');
  });

  it('leaves an unsupplied placeholder visible rather than blanking it', () => {
    expect(interpolate('Renews {date}', {})).toBe('Renews {date}');
  });

  it('is a no-op without params or braces', () => {
    expect(interpolate('Renews {date}')).toBe('Renews {date}');
    expect(interpolate('Check in', { time: 'x' })).toBe('Check in');
  });
});

describe('formatMessage', () => {
  it('renders an ICU block and then the surrounding placeholders', () => {
    const message = '{count, plural, one {# item} other {# items}} · {method}';
    expect(formatMessage(message, { count: 2, method: 'Cash' })).toBe('2 items · Cash');
  });

  it('renders a placeholder that lives inside the chosen ICU branch', () => {
    const message = '{count, plural, one {# credit for {name}} other {# credits for {name}}}';
    expect(formatMessage(message, { count: 1, name: 'Nino' })).toBe('1 credit for Nino');
  });
});

describe('translate', () => {
  it('resolves in the active locale', () => {
    expect(translate(catalogues, 'ka', 'qr.title')).toBe('ჩექ-ინი');
    expect(translate(catalogues, 'en', 'qr.title')).toBe('Check in');
  });

  it('interpolates params', () => {
    expect(translate(catalogues, 'en', 'qr.refreshesIn', { time: '30s' })).toBe('Refreshes in 30s');
  });

  it('falls back to the default locale when the active one is missing the key', () => {
    // `classes.detail.minutes` exists only in `en`; `ka` is the default locale,
    // so the fallback here is exercised the other way round via `onlyKa`.
    expect(translate(catalogues, 'en', 'onlyKa')).toBe('მხოლოდ ქართულად');
  });

  it('falls back to the raw key when neither locale has it', () => {
    expect(translate(catalogues, 'en', 'qr.error')).toBe('qr.error');
    expect(translate(catalogues, 'ka', 'nope.nope')).toBe('nope.nope');
  });

  it('falls back to the raw key rather than rendering a group object', () => {
    expect(translate(catalogues, 'en', 'billing.credits')).toBe('billing.credits');
  });

  it('reports a missing key exactly once, with the locale it was missing in', () => {
    const onMissing = vi.fn();
    setMissingMessageHandler(onMissing);
    expect(translate(catalogues, 'en', 'qr.error')).toBe('qr.error');
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(onMissing).toHaveBeenCalledWith('qr.error', 'en');
  });

  it('does not report a key that resolved through the fallback locale', () => {
    const onMissing = vi.fn();
    setMissingMessageHandler(onMissing);
    translate(catalogues, 'en', 'onlyKa');
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('renders an ICU plural when the count is passed to t()', () => {
    expect(translate(catalogues, 'en', 'classes.detail.minutes', { count: 45 })).toBe('45 minutes');
  });
});

describe('translatePlural', () => {
  it('picks the …One sibling at 1', () => {
    expect(translatePlural(catalogues, 'en', 'billing.credits.sessions', 1)).toBe('1 session');
  });

  it('picks the …Other sibling at 0, 2 and n', () => {
    expect(translatePlural(catalogues, 'en', 'billing.credits.sessions', 0)).toBe('0 sessions');
    expect(translatePlural(catalogues, 'en', 'billing.credits.sessions', 2)).toBe('2 sessions');
    expect(translatePlural(catalogues, 'en', 'billing.credits.sessions', 37)).toBe('37 sessions');
  });

  it('never renders "1 sessions" — the bug this helper exists for', () => {
    expect(translatePlural(catalogues, 'en', 'billing.credits.sessions', 1)).not.toContain(
      'sessions',
    );
  });

  it('injects the count without the caller passing it twice', () => {
    expect(translatePlural(catalogues, 'ka', 'billing.credits.sessions', 5)).toBe('5 სესია');
  });

  it('lets an explicit params.count override the injected one', () => {
    expect(translatePlural(catalogues, 'en', 'billing.credits.sessions', 2, { count: '2+' })).toBe(
      '2+ sessions',
    );
  });

  it('falls back to an ICU block at the base key when there are no siblings', () => {
    expect(translatePlural(catalogues, 'en', 'classes.detail.minutes', 1)).toBe('1 minute');
    expect(translatePlural(catalogues, 'en', 'classes.detail.minutes', 45)).toBe('45 minutes');
  });

  it('falls back to the plain message at the base key', () => {
    expect(translatePlural(catalogues, 'en', 'qr.title', 3)).toBe('Check in');
  });

  it('falls back to the raw key when nothing resolves', () => {
    expect(translatePlural(catalogues, 'en', 'nope.sessions', 2)).toBe('nope.sessions');
  });

  it('falls the sibling lookup back to the default locale', () => {
    const partial = {
      ka: { a: { bOne: 'ერთი {count}', bOther: 'მრავალი {count}' } },
      en: {},
    } as unknown as Catalogues;
    expect(translatePlural(partial, 'en', 'a.b', 1)).toBe('ერთი 1');
    expect(translatePlural(partial, 'en', 'a.b', 4)).toBe('მრავალი 4');
  });
});
