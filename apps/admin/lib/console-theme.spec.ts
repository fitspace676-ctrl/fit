import { readFileSync } from 'node:fs';
import { portalThemeVars } from '@fit/types';
import { describe, expect, it } from 'vitest';
import { consoleThemeCss } from './console-theme';

describe('consoleThemeCss', () => {
  // No choice means no override: the console keeps the theme's own colour.
  it('is null when the gym chose no colour', () => {
    expect(consoleThemeCss(null)).toBeNull();
  });

  it('paints the chosen colour onto the theme scope, as a fill and as type', () => {
    const css = consoleThemeCss('#dc2626');
    expect(css).toMatch(/^\[data-astryx-theme='formacore'\]\{.*\}$/);
    expect(css).toContain('--color-accent:#DC2626;');
    expect(css).toContain('--color-text-accent:');
    expect(css).toContain('--color-icon-accent:');
  });

  // The ink on the fill follows the fill, the same way it does on the member
  // portal: white on a deep red, near-black on a pale pink.
  it('picks legible ink for the button text', () => {
    expect(consoleThemeCss('#991b1b')).toContain('--color-on-accent:#FFFFFF;');
    expect(consoleThemeCss('#f9a8d4')).toContain('--color-on-accent:#131312;');
    // The default sky blue, saved explicitly, keeps white labels like the theme.
    expect(consoleThemeCss('#265F83')).toContain('--color-on-accent:#FFFFFF;');
  });

  it('writes nothing for a value that is not a six-digit hex', () => {
    expect(consoleThemeCss('red')).toBeNull();
    expect(consoleThemeCss('#fff')).toBeNull();
  });
});

describe('console brand skin', () => {
  it('leaves unknown slugs byte-for-byte unchanged', () => {
    for (const slug of [null, undefined, 'unknown', '__proto__', 'toString']) {
      expect(consoleThemeCss(null, slug)).toBeNull();
      expect(consoleThemeCss('#cc3311', slug)).toBe(consoleThemeCss('#cc3311'));
    }
  });

  it('paints both modes and leaves semantic status colours untouched', () => {
    const css = consoleThemeCss(null, 'synergy')!;
    expect(css).toContain('--color-background-body:light-dark(#F3EDE3, #1C1C1E);');
    expect(css).toContain('--color-text-primary:light-dark(#1C1C1E, #F3EDE3);');
    expect(css).toContain('--color-text-secondary:light-dark(#765B49, #ADA69C);');
    expect(css).toContain('--color-accent:#526EAA;');
    expect(css).toContain('--fc-control:light-dark(#F8F4EC, #262628);');
    expect(css).not.toMatch(/--color-(?:on-)?(?:success|warning|error)/);
    expect(css).not.toContain('--fc-membership');
    const theme = readFileSync(
      new URL('../../../packages/astryx-theme/dist/formacore.css', import.meta.url),
      'utf8',
    );
    const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    for (const match of css.matchAll(/(--[a-z-]+):/g)) {
      expect(theme + globals).toContain(`${match[1]}:`);
    }
  });

  it('lets an explicit console accent win without changing surfaces', () => {
    const css = consoleThemeCss('#cc3311', 'synergy')!;
    for (const [name, value] of Object.entries(portalThemeVars({ primaryColor: '#cc3311' }))) {
      expect(css).toContain(`${name}:${value};`);
    }
    expect(css).toContain('--color-background-body:light-dark(#F3EDE3, #1C1C1E);');
    expect(css).toContain(
      '--fc-focus-ring:0 0 0 3px color-mix(in srgb, var(--color-accent) 40%, transparent);',
    );
  });
});
