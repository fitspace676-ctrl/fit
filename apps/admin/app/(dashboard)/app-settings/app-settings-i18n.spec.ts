import { describe, it, expect } from 'vitest';
import { en, ka } from '@fit/i18n';
import { MOBILE_APP_FEATURES } from '@fit/types';

describe('app settings translations', () => {
  it.each([en, ka])('names every current optional mobile feature and its hint', (messages) => {
    const copy = messages.admin.appSettings;
    for (const key of MOBILE_APP_FEATURES) {
      expect(copy.features[key].length).toBeGreaterThan(0);
      expect(copy.hints[key].length).toBeGreaterThan(0);
      expect(copy.illustrations[key].length).toBeGreaterThan(0);
    }
    expect(copy.requestConfirmation.length).toBeGreaterThan(0);
  });
  it('carries the same sign-in photo copy in both locales', () => {
    expect(Object.keys(ka.admin.appSettings.loginImage).sort()).toEqual(
      Object.keys(en.admin.appSettings.loginImage).sort(),
    );
    expect(ka.admin.appSettings.loginImage.fromPortal).toBe('პორტალიდან');
  });
  it('uses Georgian without Mtavruli display letters', () => {
    expect(JSON.stringify(ka.admin.appSettings)).not.toMatch(/[\u1c90-\u1cbf]/u);
  });
});
