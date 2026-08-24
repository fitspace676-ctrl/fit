import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATE_DEFAULTS } from '@fit/types';

/**
 * House copy rule: member-facing email text never uses an em-dash or a double
 * hyphen - a plain "-" is the only dash the copy carries.
 */
describe('email copy dash rule', () => {
  it('keeps every system template default free of em-dashes and double hyphens', () => {
    for (const template of EMAIL_TEMPLATE_DEFAULTS) {
      const copy = `${template.name}\n${template.subject}\n${template.body}`;
      expect(copy, `template ${template.key}`).not.toMatch(/—|--/);
    }
  });
});
